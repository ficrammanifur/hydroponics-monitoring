/*
 * ============================================================
 * HYDROPONIC NFT SYSTEM - ESP32 FIRMWARE v2.2.2
 * FIX: Callback MQTT untuk phmode
 * ============================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Preferences.h>
#include <WiFiManager.h>

// ==================== VERSION ====================
#define FIRMWARE_VERSION "2.2.2"

// ==================== PIN DEFINITIONS ====================
#define PIN_AERATOR      13
#define PIN_SIRKULASI    14
#define PIN_PH_UP        26
#define PIN_PH_DOWN      25
#define PIN_NUTRISI_A    33
#define PIN_NUTRISI_B    32

#define PIN_TDS  35
#define PIN_PH   34
#define PIN_TEMP 4

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

#define TOPIC_STATUS_AERATOR    "hydroponic/riski/status/aerator"
#define TOPIC_STATUS_SIRKULASI  "hydroponic/riski/status/sirkulasi"
#define TOPIC_STATUS_PHUP       "hydroponic/riski/status/phup"
#define TOPIC_STATUS_PHDOWN     "hydroponic/riski/status/phdown"
#define TOPIC_STATUS_NUTRISIA   "hydroponic/riski/status/nutrisia"
#define TOPIC_STATUS_NUTRISIB   "hydroponic/riski/status/nutrisib"
#define TOPIC_STATUS_DEVICE     "hydroponic/riski/status/device"
#define TOPIC_STATUS_REQUEST    "hydroponic/riski/status/request"
#define TOPIC_STATUS_PHMODE     "hydroponic/riski/status/phmode"

// ★★★ FIX: Topik control phmode ★★★
#define TOPIC_CONTROL_PHMODE    "hydroponic/riski/control/phmode"

WiFiClient espClient;
PubSubClient mqttClient(espClient);
bool mqttConnected = false;

// ==================== pH CONSTANTS ====================
#define VREF 3.3
#define ADC_RESOLUTION 4095.0
const float slope = -0.01172;
const float intercept = 32.38;
float phFiltered = 6.0;

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

// ==================== FUZZY LOGIC ====================
float fuzzyStrength = 0.0;
String fuzzyAction = "idle";
float phTargetMin = 5.8;
float phTargetMax = 6.3;
unsigned long lastFuzzyUpdate = 0;
const unsigned long FUZZY_INTERVAL = 3000;

// ==================== MODE CONTROL ====================
bool phModeAuto = true;

// ==================== PREFERENCES ====================
Preferences prefs;

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
void fuzzyLogicController();
void handlePumpControl(int index, bool state);
void checkWiFiConnection();
void printStatus();
void printHelp();
void publishModeStatus();

// ============================================================
// SETUP
// ============================================================
void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println("\n========================================");
    Serial.println(" HYDROPONIC NFT SYSTEM v" + String(FIRMWARE_VERSION));
    Serial.println("========================================\n");
    
    Wire.begin(I2C_SDA, I2C_SCL);
    lcd.init();
    lcd.backlight();
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Hydroponic NFT");
    lcd.setCursor(0, 1);
    lcd.print("Booting...");
    
    analogReadResolution(12);
    analogSetPinAttenuation(PIN_PH, ADC_11db);
    
    sensors.begin();
    setupPumps();
    
    prefs.begin("hydroponic", false);
    phTargetMin = prefs.getFloat("phMin", 5.8);
    phTargetMax = prefs.getFloat("phMax", 6.3);
    phModeAuto = prefs.getBool("phMode", true);
    prefs.end();
    
    Serial.printf("[Config] pH Mode: %s\n", phModeAuto ? "AUTO" : "MANUAL");
    Serial.printf("[Config] pH Target: %.1f - %.1f\n", phTargetMin, phTargetMax);
    
    setupWiFiManager();
    
    if (wifiConnected) {
        mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
        mqttClient.setCallback(callback);
        mqttClient.setBufferSize(2048);
        reconnectMQTT();
    }
    
    readSensors();
    
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("System Ready!");
    delay(1000);
    updateLCD();
    
    Serial.println("[OK] System initialized");
    Serial.println("========================================\n");
    Serial.println("Commands:");
    Serial.println(" status       - Show system status");
    Serial.println(" mode auto    - Set AUTO mode");
    Serial.println(" mode manual  - Set MANUAL mode");
    Serial.println(" pump 1-6     - Toggle pump");
    Serial.println(" all off      - Turn all pumps OFF");
    Serial.println(" help         - Show help");
    Serial.println("========================================\n");
}

// ============================================================
// SETUP WIFI MANAGER
// ============================================================
void setupWiFiManager() {
    Serial.println("[WiFi] Starting WiFiManager...");
    Serial.println("[WiFi] SSID: Hydroponic_NFT");
    Serial.println("[WiFi] Password: password1234");
    
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
        Serial.print("[WiFi] IP: ");
        Serial.println(WiFi.localIP());
        
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
        digitalWrite(pumpPins[i], HIGH);
        pumpState[i] = false;
    }
    Serial.println("[Pumps] Initialized (all OFF)");
    Serial.println("  LOW = ON, HIGH = OFF");
    for (int i = 0; i < NUM_PUMPS; i++) {
        Serial.printf("    Relay %d - %-10s: GPIO%d\n", i+1, pumpNames[i], pumpPins[i]);
    }
}

// ============================================================
// HANDLE PUMP CONTROL (ACTIVE LOW)
// ============================================================
void handlePumpControl(int index, bool state) {
    digitalWrite(pumpPins[index], state ? LOW : HIGH);
    pumpState[index] = state;
    publishPumpStatus(index);
    Serial.printf("[Pump] %s -> %s\n", pumpNames[index], state ? "ON" : "OFF");
}

// ============================================================
// PUBLISH MODE STATUS
// ============================================================
void publishModeStatus() {
    if (mqttClient.connected()) {
        String modeStr = phModeAuto ? "auto" : "manual";
        mqttClient.publish(TOPIC_STATUS_PHMODE, modeStr.c_str());
        Serial.printf("[MQTT] Mode published: %s\n", modeStr.c_str());
    }
}

// ============================================================
// LOOP
// ============================================================
void loop() {
    unsigned long now = millis();
    
    if (now - lastWiFiCheck >= WIFI_CHECK_INTERVAL) {
        lastWiFiCheck = now;
        checkWiFiConnection();
    }
    
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
    
    if (now - lastSensorRead >= SENSOR_INTERVAL) {
        lastSensorRead = now;
        readSensors();
    }
    
    // ★★★ FUZZY LOGIC - HANYA JALAN DI MODE AUTO ★★★
    if (phModeAuto && mqttConnected && (now - lastFuzzyUpdate >= FUZZY_INTERVAL)) {
        lastFuzzyUpdate = now;
        fuzzyLogicController();
    }
    
    if (now - lastLCDUpdate >= LCD_UPDATE_INTERVAL) {
        lastLCDUpdate = now;
        updateLCD();
    }
    
    if (now - lastMQTTPublish >= MQTT_PUBLISH_INTERVAL) {
        lastMQTTPublish = now;
        if (mqttClient.connected() && wifiConnected) {
            publishMQTT();
        }
    }
    
    static unsigned long lastModePublish = 0;
    if (mqttClient.connected() && (now - lastModePublish >= 2000)) {
        lastModePublish = now;
        publishModeStatus();
    }
    
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();
        cmd.toLowerCase();
        
        if (cmd == "status") {
            printStatus();
        } else if (cmd == "mode auto") {
            phModeAuto = true;
            prefs.begin("hydroponic", false);
            prefs.putBool("phMode", true);
            prefs.end();
            publishModeStatus();
            Serial.println("[CMD] ✅ Mode: AUTO");
        } else if (cmd == "mode manual") {
            phModeAuto = false;
            if (pumpState[2]) handlePumpControl(2, false);
            if (pumpState[3]) handlePumpControl(3, false);
            prefs.begin("hydroponic", false);
            prefs.putBool("phMode", false);
            prefs.end();
            publishModeStatus();
            Serial.println("[CMD] ✅ Mode: MANUAL");
        } else if (cmd.startsWith("pump ")) {
            int idx = cmd.substring(5, 6).toInt() - 1;
            if (idx >= 0 && idx < NUM_PUMPS) {
                bool state = !pumpState[idx];
                handlePumpControl(idx, state);
            }
        } else if (cmd == "all off") {
            for (int i = 0; i < NUM_PUMPS; i++) {
                handlePumpControl(i, false);
                delay(100);
            }
            Serial.println("[CMD] All pumps OFF");
        } else if (cmd == "help") {
            printHelp();
        } else if (cmd == "reset") {
            Serial.println("[CMD] Restarting ESP32...");
            ESP.restart();
        } else if (cmd == "wm") {
            Serial.println("[CMD] Opening WiFiManager portal...");
            wifiManager.startConfigPortal("Hydroponic_NFT", "password1234");
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
// FUZZY LOGIC CONTROLLER
// ============================================================
void fuzzyLogicController() {
    if (!phModeAuto) {
        return;
    }
    
    float targetCenter = (phTargetMin + phTargetMax) / 2.0;
    float error = phValue - targetCenter;
    
    float asamKuat = 0, asamLemah = 0, netral = 0, basaLemah = 0, basaKuat = 0;
    
    if (error <= -0.5) asamKuat = 1.0;
    else if (error < -0.3) asamKuat = (-0.3 - error) / 0.2;
    
    if (error > -0.7 && error < -0.3) asamLemah = (error + 0.7) / 0.4;
    else if (error >= -0.3 && error < -0.05) asamLemah = (-0.05 - error) / 0.25;
    
    if (error > -0.15 && error < 0) netral = (error + 0.15) / 0.15;
    else if (error >= 0 && error < 0.15) netral = (0.15 - error) / 0.15;
    
    if (error > 0.05 && error < 0.3) basaLemah = (error - 0.05) / 0.25;
    else if (error >= 0.3 && error < 0.7) basaLemah = (0.7 - error) / 0.4;
    
    if (error >= 0.5) basaKuat = 1.0;
    else if (error > 0.3) basaKuat = (error - 0.3) / 0.2;
    
    float crisp = (asamKuat * -1.0 + asamLemah * -0.5 + netral * 0.0 + 
                   basaLemah * 0.5 + basaKuat * 1.0);
    float sumW = asamKuat + asamLemah + netral + basaLemah + basaKuat;
    
    if (sumW > 0) crisp = crisp / sumW;
    else crisp = 0;
    
    fuzzyStrength = abs(crisp);
    if (fuzzyStrength > 1.0) fuzzyStrength = 1.0;
    
    String action = "idle";
    if (crisp > 0.08) {
        action = "dosing-up";
    } else if (crisp < -0.08) {
        action = "dosing-down";
    }
    fuzzyAction = action;
    
    if (phModeAuto) {
        if (action == "dosing-up" && !pumpState[2]) {
            if (!pumpState[3]) {
                handlePumpControl(2, true);
            }
        } else if (action == "dosing-down" && !pumpState[3]) {
            if (!pumpState[2]) {
                handlePumpControl(3, true);
            }
        } else if (action == "idle") {
            if (pumpState[2]) handlePumpControl(2, false);
            if (pumpState[3]) handlePumpControl(3, false);
        }
    }
    
    Serial.printf("[Fuzzy] error: %.3f | action: %s | strength: %.1f%%\n", 
                  error, action.c_str(), fuzzyStrength * 100);
}

// ============================================================
// ★★★ MQTT CALLBACK - FIX ★★★
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
            bool isPhPump = (i == 2 || i == 3);
            
            if (isPhPump && phModeAuto) {
                Serial.printf("[MQTT] ⛔ pH pump control REJECTED (AUTO mode)\n");
                return;
            }
            
            handlePumpControl(i, isON);
            return;
        }
    }
    
    // ===== Status Request =====
    if (topicStr == TOPIC_STATUS_REQUEST) {
        Serial.println("[MQTT] Status request received, publishing...");
        publishMQTT();
        publishModeStatus();
        return;
    }
    
    // ================================================================
    // ★★★ PH MODE - FIX: Terima auto/manual dari dashboard ★★★
    // ================================================================
    if (topicStr == TOPIC_CONTROL_PHMODE) {
        String mode = message;
        mode.toLowerCase();
        
        Serial.printf("[MQTT] 🔄 Mode command received: %s\n", mode.c_str());
        
        if (mode == "auto") {
            phModeAuto = true;
            Serial.println("[MQTT] ✅ Mode changed to: AUTO");
            
            // ★★★ Simpan ke preferences ★★★
            prefs.begin("hydroponic", false);
            prefs.putBool("phMode", true);
            prefs.end();
            
            // ★★★ Kirim konfirmasi ke dashboard ★★★
            publishModeStatus();
            
        } else if (mode == "manual") {
            phModeAuto = false;
            
            // Matikan pH pumps
            if (pumpState[2]) handlePumpControl(2, false);
            if (pumpState[3]) handlePumpControl(3, false);
            
            Serial.println("[MQTT] ✅ Mode changed to: MANUAL");
            
            // ★★★ Simpan ke preferences ★★★
            prefs.begin("hydroponic", false);
            prefs.putBool("phMode", false);
            prefs.end();
            
            // ★★★ Kirim konfirmasi ke dashboard ★★★
            publishModeStatus();
            
        } else {
            Serial.printf("[MQTT] Unknown mode: %s\n", message.c_str());
        }
        return;
    }
    
    // ===== Preset Tanaman =====
    if (topicStr == "hydroponic/riski/control/preset") {
        try {
            StaticJsonDocument<128> doc;
            deserializeJson(doc, message);
            
            if (doc.containsKey("phMin") && doc.containsKey("phMax")) {
                float newMin = doc["phMin"];
                float newMax = doc["phMax"];
                
                if (newMin > 0 && newMax > 0 && newMin < newMax) {
                    phTargetMin = newMin;
                    phTargetMax = newMax;
                    
                    prefs.begin("hydroponic", false);
                    prefs.putFloat("phMin", phTargetMin);
                    prefs.putFloat("phMax", phTargetMax);
                    prefs.end();
                    
                    Serial.printf("[MQTT] Preset applied: pH %.1f - %.1f\n", 
                                  phTargetMin, phTargetMax);
                }
            }
        } catch (const std::exception& e) {
            Serial.printf("[MQTT] Preset parse error: %s\n", e.what());
        }
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
        
        for (int i = 0; i < NUM_PUMPS; i++) {
            mqttClient.subscribe(controlTopics[i]);
        }
        mqttClient.subscribe(TOPIC_STATUS_REQUEST);
        mqttClient.subscribe(TOPIC_CONTROL_PHMODE);  // ★★★ Subscribe ke phmode ★★★
        mqttClient.subscribe("hydroponic/riski/control/preset");
        
        mqttClient.publish(TOPIC_STATUS_DEVICE, "online");
        for (int i = 0; i < NUM_PUMPS; i++) {
            publishPumpStatus(i);
        }
        
        publishModeStatus();
        
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
    
    dtostrf(phValue, 4, 2, buffer);
    mqttClient.publish(TOPIC_SENSOR_PH, buffer);
    
    dtostrf(tdsValue, 5, 0, buffer);
    mqttClient.publish(TOPIC_SENSOR_TDS, buffer);
    
    dtostrf(tempValue, 4, 1, buffer);
    mqttClient.publish(TOPIC_SENSOR_TEMP, buffer);
    
    StaticJsonDocument<512> doc;
    doc["ph"] = phValue;
    doc["tds"] = tdsValue;
    doc["temperature"] = tempValue;
    doc["timestamp"] = millis();
    doc["ph_target_min"] = phTargetMin;
    doc["ph_target_max"] = phTargetMax;
    doc["ph_mode"] = phModeAuto ? "auto" : "manual";
    doc["fuzzy_strength"] = fuzzyStrength;
    doc["fuzzy_action"] = fuzzyAction;
    
    doc["aerator"] = pumpState[0] ? "ON" : "OFF";
    doc["sirkulasi"] = pumpState[1] ? "ON" : "OFF";
    doc["phup"] = pumpState[2] ? "ON" : "OFF";
    doc["phdown"] = pumpState[3] ? "ON" : "OFF";
    doc["nutrisia"] = pumpState[4] ? "ON" : "OFF";
    doc["nutrisib"] = pumpState[5] ? "ON" : "OFF";
    
    char jsonBuffer[512];
    serializeJson(doc, jsonBuffer);
    mqttClient.publish(TOPIC_SENSOR_ALL, jsonBuffer);
    
    Serial.println("[MQTT] ✅ Data published");
}

// ============================================================
// UPDATE LCD
// ============================================================
void updateLCD() {
    lcd.clear();
    
    lcd.setCursor(0, 0);
    lcd.print("pH:");
    lcd.print(phValue, 2);
    lcd.print(" TDS:");
    lcd.print(tdsValue, 0);
    
    lcd.setCursor(0, 1);
    if (wifiConnected && mqttConnected) {
        lcd.print("MQTT ");
        lcd.print(phModeAuto ? "A" : "M");
        lcd.print(" P");
        int activePumps = 0;
        for (int i = 0; i < NUM_PUMPS; i++) {
            if (pumpState[i]) activePumps++;
        }
        lcd.print(activePumps);
    } else if (wifiConnected && !mqttConnected) {
        lcd.print("MQTT Offline");
    } else {
        lcd.print("WiFi Offline ");
    }
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
    Serial.printf("║ ★ MODE      : %s                ║\n", phModeAuto ? "AUTO" : "MANUAL");
    Serial.printf("║ pH Target   : %.1f - %.1f        ║\n", phTargetMin, phTargetMax);
    Serial.printf("║ Fuzzy       : %s (%.1f%%)      ║\n", fuzzyAction.c_str(), fuzzyStrength * 100);
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
    Serial.println(" status       - Show system status");
    Serial.println(" mode auto    - Set mode AUTO (Fuzzy ON)");
    Serial.println(" mode manual  - Set mode MANUAL (Fuzzy OFF)");
    Serial.println(" pump 1-6     - Toggle pump");
    Serial.println(" all off      - Turn all pumps OFF");
    Serial.println(" reset        - Restart ESP32");
    Serial.println(" wm           - Open WiFiManager portal");
    Serial.println(" help         - Show this help");
    Serial.println("========================================\n");
}
