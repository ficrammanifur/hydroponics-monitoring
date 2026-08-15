/*
 * ============================================================
 * HYDROPONIC NFT - ESP32 FIRMWARE
 * ============================================================
 * ESP32 hanya: Baca sensor + Terima perintah relay
 * Fuzzy Logic berjalan di Dashboard (JavaScript)
 * ============================================================
 * 
 * RELAY CONFIG (ACTIVE LOW):
 * LOW  = ON (Relay aktif)
 * HIGH = OFF (Relay mati)
 * 
 * Relay 1 -> GPIO 13 -> Aerator
 * Relay 2 -> GPIO 14 -> Sirkulasi
 * Relay 3 -> GPIO 26 -> pH Up
 * Relay 4 -> GPIO 25 -> pH Down
 * Relay 5 -> GPIO 33 -> Nutrisi A
 * Relay 6 -> GPIO 32 -> Nutrisi B
 * 
 * Sensor:
 * pH     -> GPIO 34 (ADC1)
 * TDS    -> GPIO 35 (ADC1)
 * Suhu   -> GPIO 4  (DS18B20)
 * 
 * LCD I2C -> SDA=21, SCL=22
 * ============================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>

// ==================== VERSION ====================
#define FIRMWARE_VERSION "3.0.0"

// ==================== PIN DEFINITIONS ====================
// Relay Pumps (ACTIVE LOW: LOW = ON, HIGH = OFF)
#define PIN_AERATOR      13
#define PIN_SIRKULASI    14
#define PIN_PH_UP        26
#define PIN_PH_DOWN      25
#define PIN_NUTRISI_A    33
#define PIN_NUTRISI_B    32

// Sensors
#define PIN_TDS  35   // ADC1 Input Only
#define PIN_PH   34   // ADC1 Input Only
#define PIN_TEMP 4    // DS18B20 1-Wire

// I2C LCD
#define I2C_SDA 21
#define I2C_SCL 22
#define LCD_ADDR 0x27

// ==================== LCD ====================
LiquidCrystal_I2C lcd(LCD_ADDR, 16, 2);

// ==================== DS18B20 ====================
OneWire oneWire(PIN_TEMP);
DallasTemperature sensors(&oneWire);

// ==================== WiFiManager ====================
WiFiManager wifiManager;
bool wifiConnected = false;

// ==================== MQTT ====================
const char* MQTT_BROKER = "broker.hivemq.com";
const int MQTT_PORT = 1883;

// Topics
#define TOPIC_SENSOR_PH      "hydroponic/riski/sensor/ph"
#define TOPIC_SENSOR_TDS     "hydroponic/riski/sensor/tds"
#define TOPIC_SENSOR_TEMP    "hydroponic/riski/sensor/temp"
#define TOPIC_SENSOR_ALL     "hydroponic/riski/sensor/all"

#define TOPIC_CONTROL_AERATOR    "hydroponic/riski/control/aerator"
#define TOPIC_CONTROL_SIRKULASI  "hydroponic/riski/control/sirkulasi"
#define TOPIC_CONTROL_PHUP       "hydroponic/riski/control/phup"
#define TOPIC_CONTROL_PHDOWN     "hydroponic/riski/control/phdown"
#define TOPIC_CONTROL_NUTRISIA   "hydroponic/riski/control/nutrisia"
#define TOPIC_CONTROL_NUTRISIB   "hydroponic/riski/control/nutrisib"
#define TOPIC_CONTROL_PHMODE     "hydroponic/riski/control/phmode"

#define TOPIC_STATUS_AERATOR    "hydroponic/riski/status/aerator"
#define TOPIC_STATUS_SIRKULASI  "hydroponic/riski/status/sirkulasi"
#define TOPIC_STATUS_PHUP       "hydroponic/riski/status/phup"
#define TOPIC_STATUS_PHDOWN     "hydroponic/riski/status/phdown"
#define TOPIC_STATUS_NUTRISIA   "hydroponic/riski/status/nutrisia"
#define TOPIC_STATUS_NUTRISIB   "hydroponic/riski/status/nutrisib"
#define TOPIC_STATUS_DEVICE     "hydroponic/riski/status/device"
#define TOPIC_STATUS_REQUEST    "hydroponic/riski/status/request"

WiFiClient espClient;
PubSubClient mqttClient(espClient);
bool mqttConnected = false;

// ==================== pH CONSTANTS ====================
#define VREF 3.3
#define ADC_RESOLUTION 4095.0
const float slope = -0.01172;
const float intercept = 32.38;
float phFiltered = 6.0;

// ==================== TDS CONSTANTS ====================
float temperatureC = 25.0;

// ==================== PUMP CONFIG ====================
#define NUM_PUMPS 6

int pumpPins[NUM_PUMPS] = {
    PIN_AERATOR, PIN_SIRKULASI, PIN_PH_UP, PIN_PH_DOWN, PIN_NUTRISI_A, PIN_NUTRISI_B
};

bool pumpState[NUM_PUMPS] = {false, false, false, false, false, false};

const char* pumpNames[NUM_PUMPS] = {
    "Aerator", "Sirkulasi", "pH Up", "pH Down", "Nutrisi A", "Nutrisi B"
};

const char* controlTopics[NUM_PUMPS] = {
    TOPIC_CONTROL_AERATOR, TOPIC_CONTROL_SIRKULASI,
    TOPIC_CONTROL_PHUP, TOPIC_CONTROL_PHDOWN, 
    TOPIC_CONTROL_NUTRISIA, TOPIC_CONTROL_NUTRISIB
};

const char* statusTopics[NUM_PUMPS] = {
    TOPIC_STATUS_AERATOR, TOPIC_STATUS_SIRKULASI,
    TOPIC_STATUS_PHUP, TOPIC_STATUS_PHDOWN, 
    TOPIC_STATUS_NUTRISIA, TOPIC_STATUS_NUTRISIB
};

// ==================== SENSOR VALUES ====================
float phValue = 6.0;
float tdsValue = 0.0;
float tempValue = 25.0;

// ==================== TIMING ====================
unsigned long lastSensorRead = 0;
const unsigned long SENSOR_INTERVAL = 2000;
unsigned long lastMQTTPublish = 0;
const unsigned long MQTT_PUBLISH_INTERVAL = 5000;
unsigned long lastMQTTReconnect = 0;
unsigned long lastLCDUpdate = 0;
const unsigned long LCD_UPDATE_INTERVAL = 1000;
unsigned long lastWiFiCheck = 0;
const unsigned long WIFI_CHECK_INTERVAL = 30000;

// ==================== MODE ====================
bool phModeAuto = true;  // Default AUTO (Fuzzy di dashboard)

// ==================== FUNCTION PROTOTYPES ====================
void setupPumps();
void readSensors();
float readPH();
float readTDS(float temp);
float readTemperature();
void publishMQTT();
void callback(char* topic, byte* payload, unsigned int length);
void reconnectMQTT();
void updateLCD();
void setupWiFiManager();
void startAPMode();
void publishPumpStatus(int index);
void handlePumpControl(int index, bool state);
void checkWiFiConnection();
void printStatus();
void printHelp();

// ============================================================
// SETUP
// ============================================================
void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println("\n========================================");
    Serial.println(" HYDROPONIC NFT - SIMPLE VERSION");
    Serial.println(" Firmware: " + String(FIRMWARE_VERSION));
    Serial.println("========================================\n");
    Serial.println("📌 Fuzzy Logic berjalan di Dashboard!");
    Serial.println("📌 ESP32 hanya: Baca sensor + Terima perintah\n");
    
    // ===== LCD =====
    Wire.begin(I2C_SDA, I2C_SCL);
    lcd.init();
    lcd.backlight();
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Hydroponic NFT");
    lcd.setCursor(0, 1);
    lcd.print("Booting...");
    
    // ===== ADC =====
    analogReadResolution(12);
    analogSetPinAttenuation(PIN_PH, ADC_11db);
    
    // ===== DS18B20 =====
    sensors.begin();
    
    // ===== Pumps =====
    setupPumps();
    
    // ===== WiFi Manager =====
    setupWiFiManager();
    
    // ===== MQTT =====
    if (wifiConnected) {
        mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
        mqttClient.setCallback(callback);
        mqttClient.setBufferSize(2048);
        reconnectMQTT();
    }
    
    // ===== First Reading =====
    readSensors();
    
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("System Ready!");
    lcd.setCursor(0, 1);
    lcd.print("Fuzzy: Dashboard");
    delay(2000);
    updateLCD();
    
    Serial.println("[OK] System initialized");
    Serial.println("========================================\n");
    Serial.println("Commands:");
    Serial.println(" status  - Show system status");
    Serial.println(" reset   - Restart ESP32");
    Serial.println(" wm      - Open WiFiManager portal");
    Serial.println(" help    - Show help");
    Serial.println("========================================\n");
}

// ============================================================
// SETUP WIFI MANAGER
// ============================================================
void setupWiFiManager() {
    Serial.println("[WiFi] Starting WiFiManager...");
    Serial.println("[WiFi] If not connected, open hotspot:");
    Serial.println("[WiFi] SSID: Hydroponic_NFT");
    Serial.println("[WiFi] Password: password1234");
    Serial.println("[WiFi] Timeout: 180 seconds");
    
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Setup");
    lcd.setCursor(0, 1);
    lcd.print("Open Hotspot");
    lcd.setCursor(0, 2);
    lcd.print("Hydroponic_NFT");
    lcd.setCursor(0, 3);
    lcd.print("pwd: password1234");
    
    wifiManager.setConfigPortalTimeout(180);
    wifiManager.setConnectTimeout(20);
    
    wifiManager.setAPCallback([&](WiFiManager* myWiFiManager) {
        Serial.println("[WiFi] Entered AP Mode");
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("AP Mode Active");
        lcd.setCursor(0, 1);
        lcd.print("SSID: Hydroponic_NFT");
        lcd.setCursor(0, 2);
        lcd.print("IP: 192.168.4.1");
    });
    
    wifiManager.setSaveConfigCallback([&]() {
        Serial.println("[WiFi] Configuration saved!");
    });
    
    bool res = wifiManager.autoConnect("Hydroponic_NFT", "password1234");
    
    if (!res) {
        Serial.println("[WiFi] ❌ Failed to connect!");
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("WiFi Failed!");
        lcd.setCursor(0, 1);
        lcd.print("Restarting...");
        delay(3000);
        ESP.restart();
    } else {
        wifiConnected = true;
        Serial.println("[WiFi] ✅ Connected!");
        Serial.print("[WiFi] SSID: ");
        Serial.println(WiFi.SSID().c_str());
        Serial.print("[WiFi] IP: ");
        Serial.println(WiFi.localIP());
        Serial.print("[WiFi] RSSI: ");
        Serial.println(WiFi.RSSI());
        
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("WiFi Connected");
        lcd.setCursor(0, 1);
        lcd.print(WiFi.localIP().toString().substring(0, 16));
        delay(2000);
    }
}

// ============================================================
// START AP MODE
// ============================================================
void startAPMode() {
    Serial.println("[WiFi] Starting Access Point Mode...");
    wifiConnected = false;
    
    WiFi.mode(WIFI_AP);
    WiFi.softAP("Hydroponic_NFT", "password1234");
    
    IPAddress IP = WiFi.softAPIP();
    Serial.print("[WiFi] AP IP address: ");
    Serial.println(IP);
    
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("AP Mode");
    lcd.setCursor(0, 1);
    lcd.print("Hydroponic_NFT");
    lcd.setCursor(0, 2);
    lcd.print(IP.toString());
    lcd.setCursor(0, 3);
    lcd.print("pwd: password1234");
    
    unsigned long startTime = millis();
    while (WiFi.softAPgetStationNum() == 0) {
        if (millis() - startTime > 60000) {
            Serial.println("[WiFi] AP Mode timeout, restarting...");
            ESP.restart();
        }
        delay(1000);
        Serial.print(".");
    }
    Serial.println("\n[WiFi] Device connected to AP!");
    
    wifiManager.startConfigPortal("Hydroponic_NFT", "password1234");
}

// ============================================================
// CHECK WIFI CONNECTION
// ============================================================
void checkWiFiConnection() {
    if (WiFi.status() != WL_CONNECTED) {
        wifiConnected = false;
        Serial.println("[WiFi] Connection lost!");
        WiFi.reconnect();
        delay(5000);
        
        if (WiFi.status() == WL_CONNECTED) {
            wifiConnected = true;
            Serial.println("[WiFi] Reconnected!");
            Serial.print("[WiFi] IP: ");
            Serial.println(WiFi.localIP());
        } else {
            Serial.println("[WiFi] Reconnect failed, starting AP Mode...");
            startAPMode();
        }
    } else {
        wifiConnected = true;
    }
}

// ============================================================
// SETUP PUMPS (ACTIVE LOW)
// ============================================================
void setupPumps() {
    for (int i = 0; i < NUM_PUMPS; i++) {
        pinMode(pumpPins[i], OUTPUT);
        digitalWrite(pumpPins[i], HIGH);  // HIGH = OFF (Active Low)
        pumpState[i] = false;
    }
    Serial.println("[Pumps] Initialized (all OFF)");
    Serial.println("  Relay Configuration (Active LOW):");
    Serial.println("    Relay 1 - Aerator    : GPIO" + String(PIN_AERATOR));
    Serial.println("    Relay 2 - Sirkulasi  : GPIO" + String(PIN_SIRKULASI));
    Serial.println("    Relay 3 - pH Up      : GPIO" + String(PIN_PH_UP));
    Serial.println("    Relay 4 - pH Down    : GPIO" + String(PIN_PH_DOWN));
    Serial.println("    Relay 5 - Nutrisi A  : GPIO" + String(PIN_NUTRISI_A));
    Serial.println("    Relay 6 - Nutrisi B  : GPIO" + String(PIN_NUTRISI_B));
    Serial.println("  LOW = ON, HIGH = OFF");
}

// ============================================================
// HANDLE PUMP CONTROL (ACTIVE LOW)
// ============================================================
void handlePumpControl(int index, bool state) {
    // Active Low: LOW = ON, HIGH = OFF
    digitalWrite(pumpPins[index], state ? LOW : HIGH);
    pumpState[index] = state;
    publishPumpStatus(index);
    Serial.printf("[Pump] %s -> %s\n", pumpNames[index], state ? "ON" : "OFF");
}

// ============================================================
// LOOP
// ============================================================
void loop() {
    unsigned long now = millis();
    
    // ===== WiFi Check =====
    if (now - lastWiFiCheck >= WIFI_CHECK_INTERVAL) {
        lastWiFiCheck = now;
        checkWiFiConnection();
    }
    
    // ===== MQTT =====
    if (wifiConnected) {
        if (!mqttClient.connected()) {
            if (now - lastMQTTReconnect > 5000) {
                reconnectMQTT();
                lastMQTTReconnect = now;
            }
        } else {
            mqttConnected = true;
            mqttClient.loop();
        }
    }
    
    // ===== Read Sensors =====
    if (now - lastSensorRead >= SENSOR_INTERVAL) {
        lastSensorRead = now;
        readSensors();
    }
    
    // ===== Update LCD =====
    if (now - lastLCDUpdate >= LCD_UPDATE_INTERVAL) {
        lastLCDUpdate = now;
        updateLCD();
    }
    
    // ===== Publish MQTT =====
    if (now - lastMQTTPublish >= MQTT_PUBLISH_INTERVAL) {
        lastMQTTPublish = now;
        if (mqttClient.connected() && wifiConnected) {
            publishMQTT();
        }
    }
    
    // ===== Serial Commands =====
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();
        cmd.toLowerCase();
        
        if (cmd == "status") {
            printStatus();
        } else if (cmd == "reset") {
            Serial.println("[CMD] Restarting ESP32...");
            ESP.restart();
        } else if (cmd == "wm") {
            Serial.println("[CMD] Opening WiFiManager portal...");
            wifiManager.startConfigPortal("Hydroponic_NFT", "password1234");
        } else if (cmd == "help") {
            printHelp();
        } else if (cmd.startsWith("pump ")) {
            int idx = cmd.substring(5, 6).toInt() - 1;
            if (idx >= 0 && idx < NUM_PUMPS) {
                bool state = !pumpState[idx];
                handlePumpControl(idx, state);
            }
        } else if (cmd == "all on") {
            for (int i = 0; i < NUM_PUMPS; i++) {
                handlePumpControl(i, true);
                delay(100);
            }
            Serial.println("[CMD] All pumps ON");
        } else if (cmd == "all off") {
            for (int i = 0; i < NUM_PUMPS; i++) {
                handlePumpControl(i, false);
                delay(100);
            }
            Serial.println("[CMD] All pumps OFF");
        }
    }
    
    delay(10);
}

// ============================================================
// READ SENSORS
// ============================================================
void readSensors() {
    phValue = readPH();
    tempValue = readTemperature();
    tdsValue = readTDS(tempValue);
    
    Serial.printf("[Sensors] pH: %.2f | TDS: %.0f ppm | Temp: %.1f °C\n", 
                  phValue, tdsValue, tempValue);
}

// ============================================================
// READ pH
// ============================================================
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
    
    // Filter EMA
    const float alpha = 0.1;
    phFiltered = (alpha * ph) + ((1.0 - alpha) * phFiltered);
    
    return phFiltered;
}

// ============================================================
// READ TEMPERATURE
// ============================================================
float readTemperature() {
    sensors.requestTemperatures();
    float temp = sensors.getTempCByIndex(0);
    if (temp == DEVICE_DISCONNECTED_C) {
        return 25.0;
    }
    return temp;
}

// ============================================================
// READ TDS
// ============================================================
float readTDS(float temp) {
    int rawValue = analogRead(PIN_TDS);
    float voltage = rawValue * (3.3 / 4095.0);
    float compensation = 1.0 + 0.02 * (temp - 25.0);
    float tds = (133.42 * voltage * voltage * voltage - 
                 255.86 * voltage * voltage + 
                 857.39 * voltage) * compensation;
    return constrain(tds, 0, 2000);
}

// ============================================================
// MQTT CALLBACK
// ============================================================
void callback(char* topic, byte* payload, unsigned int length) {
    String message;
    for (int i = 0; i < length; i++) {
        message += (char)payload[i];
    }
    
    Serial.printf("[MQTT] Received: %s -> %s\n", topic, message.c_str());
    
    String topicStr = String(topic);
    bool isON = (message == "ON" || message == "1");
    
    // ===== Pump Controls =====
    for (int i = 0; i < NUM_PUMPS; i++) {
        if (topicStr == String(controlTopics[i])) {
            handlePumpControl(i, isON);
            return;
        }
    }
    
    // ===== Status Request =====
    if (topicStr == TOPIC_STATUS_REQUEST) {
        Serial.println("[MQTT] Status request received, publishing...");
        publishMQTT();
        return;
    }
    
    // ===== PH Mode =====
    if (topicStr == TOPIC_CONTROL_PHMODE) {
        if (message == "auto" || message == "AUTO") {
            phModeAuto = true;
            Serial.println("[MQTT] Mode: AUTO (Fuzzy di dashboard)");
        } else if (message == "manual" || message == "MANUAL") {
            phModeAuto = false;
            Serial.println("[MQTT] Mode: MANUAL");
        }
        return;
    }
}

// ============================================================
// RECONNECT MQTT
// ============================================================
void reconnectMQTT() {
    if (mqttClient.connected()) return;
    if (!wifiConnected) return;
    
    Serial.print("[MQTT] Connecting to ");
    Serial.print(MQTT_BROKER);
    Serial.print("...");
    
    String clientId = "esp32-hydroponic-" + String(random(0xffff), HEX);
    
    if (mqttClient.connect(clientId.c_str())) {
        Serial.println(" ✅ Connected!");
        mqttConnected = true;
        
        // Subscribe ke semua control topics
        for (int i = 0; i < NUM_PUMPS; i++) {
            mqttClient.subscribe(controlTopics[i]);
        }
        mqttClient.subscribe(TOPIC_STATUS_REQUEST);
        mqttClient.subscribe(TOPIC_CONTROL_PHMODE);
        
        // Publish status
        mqttClient.publish(TOPIC_STATUS_DEVICE, "online");
        for (int i = 0; i < NUM_PUMPS; i++) {
            publishPumpStatus(i);
        }
        
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("MQTT Connected");
        delay(1000);
    } else {
        Serial.printf(" ❌ Failed! rc=%d\n", mqttClient.state());
        mqttConnected = false;
    }
}

// ============================================================
// PUBLISH PUMP STATUS
// ============================================================
void publishPumpStatus(int index) {
    if (mqttClient.connected()) {
        mqttClient.publish(statusTopics[index], pumpState[index] ? "ON" : "OFF");
    }
}

// ============================================================
// PUBLISH MQTT
// ============================================================
void publishMQTT() {
    if (!mqttClient.connected() || !wifiConnected) return;
    
    char buffer[16];
    
    // ===== Individual Topics =====
    dtostrf(phValue, 4, 2, buffer);
    mqttClient.publish(TOPIC_SENSOR_PH, buffer);
    
    dtostrf(tdsValue, 5, 0, buffer);
    mqttClient.publish(TOPIC_SENSOR_TDS, buffer);
    
    dtostrf(tempValue, 4, 1, buffer);
    mqttClient.publish(TOPIC_SENSOR_TEMP, buffer);
    
    // ===== All Data as JSON =====
    StaticJsonDocument<256> doc;
    doc["ph"] = phValue;
    doc["tds"] = tdsValue;
    doc["temperature"] = tempValue;
    doc["timestamp"] = millis();
    
    // Pump status
    doc["aerator"] = pumpState[0] ? "ON" : "OFF";
    doc["sirkulasi"] = pumpState[1] ? "ON" : "OFF";
    doc["phup"] = pumpState[2] ? "ON" : "OFF";
    doc["phdown"] = pumpState[3] ? "ON" : "OFF";
    doc["nutrisia"] = pumpState[4] ? "ON" : "OFF";
    doc["nutrisib"] = pumpState[5] ? "ON" : "OFF";
    
    // Mode info
    doc["ph_mode"] = phModeAuto ? "auto" : "manual";
    
    char jsonBuffer[256];
    serializeJson(doc, jsonBuffer);
    mqttClient.publish(TOPIC_SENSOR_ALL, jsonBuffer);
    
    Serial.println("[MQTT] ✅ Data published");
}

// ============================================================
// UPDATE LCD
// ============================================================
void updateLCD() {
    lcd.clear();
    
    // Baris 1: pH dan TDS
    lcd.setCursor(0, 0);
    lcd.print("pH:");
    lcd.print(phValue, 2);
    lcd.print(" TDS:");
    lcd.print(tdsValue, 0);
    
    // Baris 2: Status + Mode
    lcd.setCursor(0, 1);
    if (wifiConnected && mqttConnected) {
        lcd.print("MQTT ");
        lcd.print(phModeAuto ? "A" : "M");  // A=Auto, M=Manual
    } else if (wifiConnected && !mqttConnected) {
        lcd.print("MQTT Offline");
    } else {
        lcd.print("WiFi Offline ");
    }
    
    // Jumlah pompa aktif
    int activePumps = 0;
    for (int i = 0; i < NUM_PUMPS; i++) {
        if (pumpState[i]) activePumps++;
    }
    lcd.setCursor(13, 1);
    lcd.print("P");
    lcd.print(activePumps);
}

// ============================================================
// PRINT STATUS
// ============================================================
void printStatus() {
    Serial.println("\n╔═══════════════════════════════════════╗");
    Serial.println("║ SYSTEM STATUS                        ║");
    Serial.println("╠═══════════════════════════════════════╣");
    Serial.printf("║ pH          : %6.2f                ║\n", phValue);
    Serial.printf("║ TDS         : %6.0f ppm           ║\n", tdsValue);
    Serial.printf("║ Temperature : %6.2f °C            ║\n", tempValue);
    Serial.println("╠═══════════════════════════════════════╣");
    Serial.printf("║ WiFi        : %s                ║\n", wifiConnected ? "Connected" : "Offline");
    Serial.printf("║ MQTT        : %s                ║\n", mqttConnected ? "Connected" : "Disconnected");
    Serial.printf("║ pH Mode     : %s                ║\n", phModeAuto ? "AUTO (Fuzzy di Dashboard)" : "MANUAL");
    Serial.println("╠═══════════════════════════════════════╣");
    Serial.println("║ PUMP STATUS                         ║");
    for (int i = 0; i < NUM_PUMPS; i++) {
        Serial.printf("║ %-10s : %s                ║\n", pumpNames[i], pumpState[i] ? "ON" : "OFF");
    }
    Serial.println("╚═══════════════════════════════════════╝\n");
}

// ============================================================
// PRINT HELP
// ============================================================
void printHelp() {
    Serial.println("\n=== COMMANDS ===");
    Serial.println(" status     - Show system status");
    Serial.println(" reset      - Restart ESP32");
    Serial.println(" wm         - Open WiFiManager portal");
    Serial.println(" pump 1-6   - Toggle pump");
    Serial.println(" all on     - Turn all pumps ON");
    Serial.println(" all off    - Turn all pumps OFF");
    Serial.println(" help       - Show this help");
    Serial.println("========================================\n");
}
