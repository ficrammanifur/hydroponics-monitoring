// ==========================================
// LIBRARY
// ==========================================
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ==========================================
// VERSION & INFO
// ==========================================
#define FIRMWARE_VERSION "1.0.0"
#define DEVICE_NAME "esp32-hydroponic"

// ==========================================
// CONFIGURASI PIN POMPA
// ==========================================
const int PIN_AERATOR      = 12;
const int PIN_SIRKULASI_1  = 13;
const int PIN_SIRKULASI_2  = 11;
const int PIN_PH_UP        = 10;
const int PIN_PH_DOWN      = 46;
const int PIN_NUTRISI_A    = 14;
const int PIN_NUTRISI_B    = 17;

// ==========================================
// CONFIGURASI SENSOR
// ==========================================
#define PIN_TDS 19
#define PIN_TEMP 3
#define PIN_PH 4

// ==========================================
// CONFIGURASI I2C (LCD)
// ==========================================
#define I2C_SDA 8
#define I2C_SCL 9
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ==========================================
// SENSOR SUHU (DS18B20)
// ==========================================
OneWire oneWire(PIN_TEMP);
DallasTemperature sensors(&oneWire);

// ==========================================
// KONSTANTA pH
// ==========================================
#define VREF 3.3
#define ADC_RESOLUTION 4095.0
const float slope = -0.01172;
const float intercept = 32.38;
float phFiltered = 4.00;

// ==========================================
// KONSTANTA TDS
// ==========================================
float temperature = 25.0;

// ==========================================
// KONFIGURASI MQTT - TOPIK hydroponic/riski/
// ==========================================
const char* mqtt_server = "broker.hivemq.com";
const int mqtt_port = 1883;

// === SENSOR TOPICS ===
#define TOPIC_SENSOR_PH      "hydroponic/riski/sensor/ph"
#define TOPIC_SENSOR_TDS     "hydroponic/riski/sensor/tds"
#define TOPIC_SENSOR_TEMP    "hydroponic/riski/sensor/temp"
#define TOPIC_SENSOR_ALL     "hydroponic/riski/sensor/all"

// === CONTROL TOPICS ===
#define TOPIC_CONTROL_AERATOR    "hydroponic/riski/control/aerator"
#define TOPIC_CONTROL_SIRKULASI1 "hydroponic/riski/control/sirkulasi1"
#define TOPIC_CONTROL_SIRKULASI2 "hydroponic/riski/control/sirkulasi2"
#define TOPIC_CONTROL_PHUP       "hydroponic/riski/control/phup"
#define TOPIC_CONTROL_PHDOWN     "hydroponic/riski/control/phdown"
#define TOPIC_CONTROL_NUTRISIA   "hydroponic/riski/control/nutrisia"
#define TOPIC_CONTROL_NUTRISIB   "hydroponic/riski/control/nutrisib"

// === STATUS TOPICS ===
#define TOPIC_STATUS_AERATOR    "hydroponic/riski/status/aerator"
#define TOPIC_STATUS_SIRKULASI1 "hydroponic/riski/status/sirkulasi1"
#define TOPIC_STATUS_SIRKULASI2 "hydroponic/riski/status/sirkulasi2"
#define TOPIC_STATUS_PHUP       "hydroponic/riski/status/phup"
#define TOPIC_STATUS_PHDOWN     "hydroponic/riski/status/phdown"
#define TOPIC_STATUS_NUTRISIA   "hydroponic/riski/status/nutrisia"
#define TOPIC_STATUS_NUTRISIB   "hydroponic/riski/status/nutrisib"
#define TOPIC_STATUS_DEVICE     "hydroponic/riski/status/device"

WiFiClient espClient;
PubSubClient client(espClient);

// ==========================================
// VARIABEL GLOBAL
// ==========================================
unsigned long lastSensorRead = 0;
const unsigned long SENSOR_INTERVAL = 2000;
unsigned long lastMQTTPublish = 0;
const unsigned long MQTT_PUBLISH_INTERVAL = 5000;
unsigned long lastMQTTReconnect = 0;
unsigned long lastWiFiCheck = 0;
const unsigned long WIFI_CHECK_INTERVAL = 30000;
unsigned long lastLCDUpdate = 0;
const unsigned long LCD_UPDATE_INTERVAL = 1000;

// State pompa (0:aerator,1:sirkulasi1,2:sirkulasi2,3:phup,4:phdown,5:nutrisia,6:nutrisib)
bool pumpState[7] = {false};
int pumpPins[7] = {PIN_AERATOR, PIN_SIRKULASI_1, PIN_SIRKULASI_2, PIN_PH_UP, PIN_PH_DOWN, PIN_NUTRISI_A, PIN_NUTRISI_B};

// Nama pompa untuk log
const char* pumpNames[7] = {"Aerator", "Sirkulasi1", "Sirkulasi2", "pH Up", "pH Down", "Nutrisi A", "Nutrisi B"};

// Control topics untuk setiap pompa
const char* controlTopics[7] = {
  TOPIC_CONTROL_AERATOR,
  TOPIC_CONTROL_SIRKULASI1,
  TOPIC_CONTROL_SIRKULASI2,
  TOPIC_CONTROL_PHUP,
  TOPIC_CONTROL_PHDOWN,
  TOPIC_CONTROL_NUTRISIA,
  TOPIC_CONTROL_NUTRISIB
};

// Status topics untuk setiap pompa
const char* statusTopics[7] = {
  TOPIC_STATUS_AERATOR,
  TOPIC_STATUS_SIRKULASI1,
  TOPIC_STATUS_SIRKULASI2,
  TOPIC_STATUS_PHUP,
  TOPIC_STATUS_PHDOWN,
  TOPIC_STATUS_NUTRISIA,
  TOPIC_STATUS_NUTRISIB
};

// Nilai sensor
float tdsValue = 0;
float tempValue = 25.0;
float phValue = 6.0;
float humidityValue = 60.0;
int soilMoistureValue = 50;
int waterLevelValue = 80;

// Status koneksi
bool wifiConnected = false;
bool mqttConnected = false;
int wifiReconnectAttempts = 0;
const int MAX_WIFI_RECONNECT_ATTEMPTS = 3;

WiFiManager wm;

// ==========================================
// FUNCTION PROTOTYPES
// ==========================================
void setupPumps();
void readSensors();
float readPH();
float readTDS(float temp);
float readTemperature();
void publishMQTT();
void callback(char* topic, byte* payload, unsigned int length);
void reconnectMQTT();
void updateLCD();
void setupMQTT();
bool checkWiFiConnection();
void startAPMode();
void setupWiFiManager();
void publishPumpStatus(int index);

// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\n=== HYDROPONIC NFT SYSTEM ===");
  Serial.println("Firmware Version: " + String(FIRMWARE_VERSION));
  Serial.println("MQTT Broker: broker.hivemq.com");
  Serial.println("Topics: hydroponic/riski/#");
  
  // Setup I2C LCD
  Wire.begin(I2C_SDA, I2C_SCL);
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Hydroponic NFT");
  lcd.setCursor(0, 1);
  lcd.print("Booting...");

  // Setup ADC
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_PH, ADC_11db);

  // Setup sensor suhu
  sensors.begin();

  // Setup pin pompa
  setupPumps();

  // Setup WiFi dengan WiFiManager
  setupWiFiManager();

  // Setup MQTT
  setupMQTT();

  // Baca sensor pertama kali
  readSensors();
  
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("System Ready!");
  delay(1000);
  updateLCD();
}

// ==========================================
// SETUP WiFi Manager
// ==========================================
void setupWiFiManager() {
  wm.setConfigPortalTimeout(180);
  wm.setConnectTimeout(20);
  
  wm.setAPCallback([&](WiFiManager* myWiFiManager) {
    Serial.println("Entered AP Mode");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("AP Mode Active");
    lcd.setCursor(0, 1);
    lcd.print("SSID: Hydroponic");
  });
  
  bool res = wm.autoConnect("Hydroponic_NFT", "password1234");
  
  if(!res) {
    Serial.println("Failed to connect to WiFi!");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Failed!");
    lcd.setCursor(0, 1);
    lcd.print("Starting AP Mode");
    delay(3000);
    startAPMode();
  } else {
    wifiConnected = true;
    Serial.println("WiFi connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Connected");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP().toString().substring(0, 16));
    delay(2000);
  }
}

// ==========================================
// START AP MODE
// ==========================================
void startAPMode() {
  Serial.println("Starting Access Point Mode...");
  wifiConnected = false;
  
  WiFi.mode(WIFI_AP);
  WiFi.softAP("Hydroponic_NFT", "password1234");
  
  IPAddress IP = WiFi.softAPIP();
  Serial.print("AP IP address: ");
  Serial.println(IP);
  
  unsigned long lastToggle = 0;
  bool showSSID = true;
  
  while(!wifiConnected) {
    if(millis() - lastToggle > 3000) {
      lastToggle = millis();
      showSSID = !showSSID;
      lcd.clear();
      if(showSSID) {
        lcd.setCursor(0, 0);
        lcd.print("SSID:");
        lcd.setCursor(0, 1);
        lcd.print("Hydroponic_NFT");
      } else {
        lcd.setCursor(0, 0);
        lcd.print("IP:");
        lcd.setCursor(0, 1);
        lcd.print(IP.toString());
      }
    }
    
    if(WiFi.status() == WL_CONNECTED) {
      wifiConnected = true;
      break;
    }
    
    delay(1000);
  }
}

// ==========================================
// SETUP MQTT
// ==========================================
void setupMQTT() {
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
  client.setBufferSize(2048);
  reconnectMQTT();
}

// ==========================================
// SETUP PUMPS
// ==========================================
void setupPumps() {
  for(int i = 0; i < 7; i++) {
    pinMode(pumpPins[i], OUTPUT);
    digitalWrite(pumpPins[i], LOW);
    pumpState[i] = false;
  }
}

// ==========================================
// CHECK WIFI CONNECTION
// ==========================================
bool checkWiFiConnection() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    return true;
  } else {
    wifiConnected = false;
    Serial.println("WiFi connection lost!");
    return false;
  }
}

// ==========================================
// LOOP
// ==========================================
void loop() {
  // CHECK WIFI
  if (millis() - lastWiFiCheck >= WIFI_CHECK_INTERVAL) {
    lastWiFiCheck = millis();
    if (!checkWiFiConnection()) {
      wifiReconnectAttempts++;
      if (wifiReconnectAttempts >= MAX_WIFI_RECONNECT_ATTEMPTS) {
        wifiReconnectAttempts = 0;
        startAPMode();
      } else {
        WiFi.reconnect();
        delay(5000);
      }
    } else {
      wifiReconnectAttempts = 0;
    }
  }

  // MQTT
  if (wifiConnected) {
    if (!client.connected()) {
      if (millis() - lastMQTTReconnect > 5000) {
        reconnectMQTT();
        lastMQTTReconnect = millis();
      }
    } else {
      mqttConnected = true;
      client.loop();
    }
  }

  // Baca sensor
  if (millis() - lastSensorRead >= SENSOR_INTERVAL) {
    lastSensorRead = millis();
    readSensors();
  }

  // Update LCD
  if (millis() - lastLCDUpdate >= LCD_UPDATE_INTERVAL) {
    lastLCDUpdate = millis();
    updateLCD();
  }

  // Publish MQTT
  if (millis() - lastMQTTPublish >= MQTT_PUBLISH_INTERVAL) {
    lastMQTTPublish = millis();
    if (client.connected() && wifiConnected) {
      publishMQTT();
    }
  }
}

// ==========================================
// READ SENSORS
// ==========================================
void readSensors() {
  phValue = readPH();
  tempValue = readTemperature();
  tdsValue = readTDS(tempValue);
  
  // Simulasi data tambahan untuk dashboard
  humidityValue = 60.0 + random(-5, 5);
  soilMoistureValue = map((int)tdsValue, 0, 2000, 30, 80);
  waterLevelValue = 80 + random(-10, 10);
  if (waterLevelValue > 100) waterLevelValue = 100;
  if (waterLevelValue < 0) waterLevelValue = 0;
  
  Serial.print("pH: ");
  Serial.print(phValue, 2);
  Serial.print(" | TDS: ");
  Serial.print(tdsValue, 0);
  Serial.print(" ppm | Temp: ");
  Serial.print(tempValue, 1);
  Serial.print(" °C | Soil: ");
  Serial.print(soilMoistureValue);
  Serial.print("% | Water: ");
  Serial.print(waterLevelValue);
  Serial.println("%");
}

// ==========================================
// READ pH
// ==========================================
float readPH() {
  const int samples = 200;
  long totalADC = 0;
  
  for (int i = 0; i < samples; i++) {
    totalADC += analogRead(PIN_PH);
    delay(5);
  }
  
  float adcAverage = totalADC / (float)samples;
  float voltage = (adcAverage / ADC_RESOLUTION) * VREF;
  float voltage_mV = voltage * 1000.0;
  float ph = (slope * voltage_mV) + intercept;
  ph = constrain(ph, 0.0, 14.0);
  
  const float alpha = 0.1;
  phFiltered = (alpha * ph) + ((1.0 - alpha) * phFiltered);
  
  return phFiltered;
}

// ==========================================
// READ TEMPERATURE
// ==========================================
float readTemperature() {
  sensors.requestTemperatures();
  float temp = sensors.getTempCByIndex(0);
  if (temp == DEVICE_DISCONNECTED_C) {
    return 25.0;
  }
  return temp;
}

// ==========================================
// READ TDS
// ==========================================
float readTDS(float temp) {
  int rawValue = analogRead(PIN_TDS);
  float voltage = rawValue * (3.3 / 4095.0);
  float compensation = 1.0 + 0.02 * (temp - 25.0);
  float tds = (133.42 * voltage * voltage * voltage - 255.86 * voltage * voltage + 857.39 * voltage) * compensation;
  return constrain(tds, 0, 2000);
}

// ==========================================
// UPDATE LCD
// ==========================================
void updateLCD() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("pH:");
  lcd.print(phValue, 2);
  lcd.print(" TDS:");
  lcd.print(tdsValue, 0);
  
  lcd.setCursor(0, 1);
  if (wifiConnected && mqttConnected) {
    lcd.print("MQTT Online ");
  } else if (wifiConnected && !mqttConnected) {
    lcd.print("MQTT Offline");
  } else {
    lcd.print("WiFi Offline ");
  }
  
  int activePumps = 0;
  for (int i = 0; i < 7; i++) {
    if (pumpState[i]) activePumps++;
  }
  lcd.setCursor(12, 1);
  lcd.print("P:");
  lcd.print(activePumps);
}

// ==========================================
// PUBLISH PUMP STATUS
// ==========================================
void publishPumpStatus(int index) {
  if (client.connected()) {
    client.publish(statusTopics[index], pumpState[index] ? "ON" : "OFF");
  }
}

// ==========================================
// MQTT CALLBACK
// ==========================================
void callback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  
  Serial.print("MQTT Message: [");
  Serial.print(topic);
  Serial.print("] ");
  Serial.println(message);
  
  String topicStr = String(topic);
  bool isON = (message == "ON" || message == "1");
  
  // Cek semua control topics untuk pompa
  for(int i = 0; i < 7; i++) {
    if(topicStr == String(controlTopics[i])) {
      digitalWrite(pumpPins[i], isON ? HIGH : LOW);
      pumpState[i] = isON;
      publishPumpStatus(i);
      Serial.printf("[%s] %s\n", pumpNames[i], isON ? "ON" : "OFF");
      return;
    }
  }
}

// ==========================================
// RECONNECT MQTT
// ==========================================
void reconnectMQTT() {
  if (client.connected()) return;
  if (!wifiConnected) return;
  
  Serial.print("Connecting to MQTT (HiveMQ)...");
  String clientId = "esp32-hydroponic-" + String(random(0xffff), HEX);
  
  if (client.connect(clientId.c_str())) {
    Serial.println("connected!");
    mqttConnected = true;
    
    // Subscribe ke semua control topics
    for(int i = 0; i < 7; i++) {
      client.subscribe(controlTopics[i]);
    }
    
    // Publish status device
    client.publish(TOPIC_STATUS_DEVICE, "online");
    
    // Publish status semua pompa
    for(int i = 0; i < 7; i++) {
      publishPumpStatus(i);
    }
    
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("MQTT Connected");
  } else {
    Serial.print("failed, rc=");
    Serial.println(client.state());
    mqttConnected = false;
  }
}

// ==========================================
// PUBLISH MQTT
// ==========================================
void publishMQTT() {
  if (!client.connected() || !wifiConnected) return;
  
  char buffer[16];
  
  // === PUBLISH SENSOR DATA ===
  
  // pH
  dtostrf(phValue, 4, 2, buffer);
  client.publish(TOPIC_SENSOR_PH, buffer);
  
  // TDS
  dtostrf(tdsValue, 5, 0, buffer);
  client.publish(TOPIC_SENSOR_TDS, buffer);
  
  // Temperature
  dtostrf(tempValue, 4, 1, buffer);
  client.publish(TOPIC_SENSOR_TEMP, buffer);
  
  // === PUBLISH ALL DATA AS JSON ===
  StaticJsonDocument<512> doc;
  doc["ph"] = phValue;
  doc["tds"] = tdsValue;
  doc["temperature"] = tempValue;
  doc["humidity"] = humidityValue;
  doc["soil_moisture"] = soilMoistureValue;
  doc["water_level"] = waterLevelValue;
  doc["timestamp"] = millis();
  
  // Status pompa
  doc["aerator"] = pumpState[0] ? "ON" : "OFF";
  doc["sirkulasi1"] = pumpState[1] ? "ON" : "OFF";
  doc["sirkulasi2"] = pumpState[2] ? "ON" : "OFF";
  doc["phup"] = pumpState[3] ? "ON" : "OFF";
  doc["phdown"] = pumpState[4] ? "ON" : "OFF";
  doc["nutrisia"] = pumpState[5] ? "ON" : "OFF";
  doc["nutrisib"] = pumpState[6] ? "ON" : "OFF";
  
  char jsonBuffer[512];
  serializeJson(doc, jsonBuffer);
  client.publish(TOPIC_SENSOR_ALL, jsonBuffer);
  
  Serial.println("📤 MQTT Data published");
}
