/* ==========================================================================
   Hidroponik NFT Dashboard — MQTT Integration with Multiple Broker Fallback
   ========================================================================== */

// ==================== MQTT CONFIGURATION ====================
const MQTT_BROKERS = [
    {
        name: 'EMQX',
        broker: 'wss://broker.emqx.io:8084/mqtt',
        port: 8084
    },
    {
        name: 'HiveMQ',
        broker: 'wss://broker.hivemq.com:8084/mqtt',
        port: 8084
    },
    {
        name: 'Mosquitto',
        broker: 'wss://test.mosquitto.org:8081/mqtt',
        port: 8081
    }
];

let CURRENT_BROKER_INDEX = 0;

const MQTT_CONFIG = {
    get broker() {
        return MQTT_BROKERS[CURRENT_BROKER_INDEX].broker;
    },
    get brokerName() {
        return MQTT_BROKERS[CURRENT_BROKER_INDEX].name;
    },
    topics: {
        ph: 'hydroponic/sensor/ph',
        tds: 'hydroponic/sensor/tds',
        temp: 'hydroponic/sensor/temp',
        all: 'hydroponic/sensor/all',
        
        controlAerator: 'hydroponic/control/aerator',
        controlSirkulasi1: 'hydroponic/control/sirkulasi1',
        controlSirkulasi2: 'hydroponic/control/sirkulasi2',
        controlPhUp: 'hydroponic/control/phup',
        controlPhDown: 'hydroponic/control/phdown',
        controlNutrisiA: 'hydroponic/control/nutrisia',
        controlNutrisiB: 'hydroponic/control/nutrisib',
        
        statusAerator: 'hydroponic/status/aerator',
        statusSirkulasi1: 'hydroponic/status/sirkulasi1',
        statusSirkulasi2: 'hydroponic/status/sirkulasi2',
        statusPhUp: 'hydroponic/status/phup',
        statusPhDown: 'hydroponic/status/phdown',
        statusNutrisiA: 'hydroponic/status/nutrisia',
        statusNutrisiB: 'hydroponic/status/nutrisib',
        statusDevice: 'hydroponic/status/device',
        statusDashboard: 'hydroponic/status/dashboard'
    }
};

// ==================== KONFIGURASI SENSOR ====================
const SENSORS = [
  {
    key: "tds",
    label: "TDS / Nutrisi",
    unit: "ppm",
    decimals: 0,
    scaleMin: 0,
    scaleMax: 2000,
    idealMin: 800,
    idealMax: 1400,
    icon: '<path d="M12 2v6M12 22v-6M4.9 4.9l4.2 4.2M14.9 14.9l4.2 4.2M2 12h6M22 12h-6M4.9 19.1l4.2-4.2M14.9 9.1l4.2-4.2"/>',
  },
  {
    key: "temp",
    label: "Suhu Air",
    unit: "°C",
    decimals: 1,
    scaleMin: 10,
    scaleMax: 40,
    idealMin: 18,
    idealMax: 28,
    icon: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
  },
  {
    key: "ph",
    label: "pH Larutan",
    unit: "pH",
    decimals: 2,
    scaleMin: 3,
    scaleMax: 10,
    idealMin: 5.5,
    idealMax: 7.0,
    icon: '<path d="M3 3v18h18"/><path d="m7 14 3-3 3 3 5-5"/>',
  },
];

// ==================== KONFIGURASI POMPA ====================
const PUMPS = [
  { key: "aerator", name: "Aerator", pin: 12, group: "Aerasi", controlTopic: 'hydroponic/control/aerator', statusTopic: 'hydroponic/status/aerator' },
  { key: "sirkulasi1", name: "Sirkulasi 1", pin: 13, group: "Sirkulasi", controlTopic: 'hydroponic/control/sirkulasi1', statusTopic: 'hydroponic/status/sirkulasi1' },
  { key: "sirkulasi2", name: "Sirkulasi 2", pin: 11, group: "Sirkulasi", controlTopic: 'hydroponic/control/sirkulasi2', statusTopic: 'hydroponic/status/sirkulasi2' },
  { key: "nutrisiA", name: "Nutrisi A", pin: 14, group: "Dosis Nutrisi", controlTopic: 'hydroponic/control/nutrisia', statusTopic: 'hydroponic/status/nutrisia' },
  { key: "nutrisiB", name: "Nutrisi B", pin: 17, group: "Dosis Nutrisi", controlTopic: 'hydroponic/control/nutrisib', statusTopic: 'hydroponic/status/nutrisib' },
];
const PUMP_GROUP_ORDER = ["Aerasi", "Sirkulasi", "Dosis Nutrisi"];

// ==================== PRESET TANAMAN ====================
const PLANT_PRESETS = [
  { key: "selada", name: "Selada", phMin: 6.0, phMax: 7.0 },
  { key: "sawi", name: "Sawi", phMin: 5.5, phMax: 6.5 },
  { key: "kangkung", name: "Kangkung", phMin: 5.5, phMax: 6.5 },
  { key: "bayam", name: "Bayam", phMin: 6.0, phMax: 7.0 },
  { key: "kailan", name: "Kailan", phMin: 5.5, phMax: 6.5 },
  { key: "pakcoy", name: "Pakcoy", phMin: 6.8, phMax: 7.0 },
  { key: "seledri", name: "Seledri", phMin: 6.3, phMax: 6.7 },
  { key: "cabe", name: "Cabe", phMin: 6.0, phMax: 6.5 },
  { key: "peterseli", name: "Peterseli", phMin: 5.5, phMax: 6.0 },
  { key: "strawberry", name: "Strawberry", phMin: 5.8, phMax: 6.2 },
  { key: "ketimun", name: "Ketimun", phMin: 5.3, phMax: 5.7 },
];

const PH_ALLOWED_MIN = 5.5;
const PH_ALLOWED_MAX = 7.0;
const PUMP_ICON = '<path d="M4 20V10a2 2 0 0 1 2-2h6l3-3v14"/><path d="M12 8V4h4"/><circle cx="8" cy="15" r="1"/>';

// ==================== STATE ====================
const HISTORY_LEN = 40;
const state = {
  values: { tds: 0, temp: 0, ph: 0 },
  history: { tds: [], temp: [], ph: [] },
  pumps: { aerator: false, sirkulasi1: false, sirkulasi2: false, nutrisiA: false, nutrisiB: false, phUp: false, phDown: false },
  phMode: "auto",
  phTarget: { min: 5.8, max: 6.3 },
  preset: "custom",
  fuzzy: { asamKuat: 0, asamLemah: 0, netral: 0, basaLemah: 0, basaKuat: 0, action: "idle", strength: 0 },
  broker: "connecting",
  esp: "waiting",
  lastPacket: 0,
  packets: 0,
  startTime: Date.now(),
  mqttConnected: false,
  clientId: '',
  hasReceivedData: false,
  currentBroker: 0
};

// seed flat history
SENSORS.forEach((s) => {
  state.history[s.key] = Array.from({ length: HISTORY_LEN }, () => 0);
});

// ==================== MQTT CLIENT ====================
let mqttClient = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🌱 Hydroponic NFT Dashboard');
    console.log('📡 MQTT Broker:', MQTT_CONFIG.broker);
    console.log('📡 Broker Name:', MQTT_CONFIG.brokerName);
    
    renderSensors();
    renderPhPanel();
    renderPumps();
    renderConnStatus();
    connectMQTT();
    
    setInterval(tickClock, 1000);
    tickClock();
});

// ==================== CONNECT MQTT ====================
function connectMQTT() {
    if (mqttClient && mqttClient.connected) {
        mqttClient.end();
        mqttClient = null;
    }
    
    state.broker = "connecting";
    state.mqttConnected = false;
    renderConnStatus();
    
    const clientId = 'dashboard_' + Math.random().toString(16).substr(2, 8);
    state.clientId = clientId;
    document.getElementById('clientId').textContent = clientId;
    document.getElementById('connHost').textContent = MQTT_CONFIG.brokerName + ' (' + MQTT_CONFIG.broker + ')';
    
    const options = {
        clientId: clientId,
        clean: true,
        reconnectPeriod: 3000,
        keepAlive: 60,
        connectTimeout: 15000,
        will: {
            topic: MQTT_CONFIG.topics.statusDashboard,
            payload: 'offline',
            qos: 1,
            retain: false
        }
    };
    
    console.log('🔄 Connecting to MQTT...');
    console.log('📡 Broker:', MQTT_CONFIG.broker);
    console.log('📡 Name:', MQTT_CONFIG.brokerName);
    
    try {
        mqttClient = mqtt.connect(MQTT_CONFIG.broker, options);
        
        mqttClient.on('connect', () => {
            console.log('✅ MQTT Connected to', MQTT_CONFIG.brokerName);
            state.broker = "online";
            state.mqttConnected = true;
            state.startTime = Date.now();
            reconnectAttempts = 0;
            renderConnStatus();
            
            showToast('✅ MQTT Connected to ' + MQTT_CONFIG.brokerName + '!', 'success');
            
            // Subscribe ke semua topik
            const topics = [
                MQTT_CONFIG.topics.ph,
                MQTT_CONFIG.topics.tds,
                MQTT_CONFIG.topics.temp,
                MQTT_CONFIG.topics.all,
                MQTT_CONFIG.topics.statusAerator,
                MQTT_CONFIG.topics.statusSirkulasi1,
                MQTT_CONFIG.topics.statusSirkulasi2,
                MQTT_CONFIG.topics.statusPhUp,
                MQTT_CONFIG.topics.statusPhDown,
                MQTT_CONFIG.topics.statusNutrisiA,
                MQTT_CONFIG.topics.statusNutrisiB,
                MQTT_CONFIG.topics.statusDevice
            ];
            
            topics.forEach(topic => {
                mqttClient.subscribe(topic, { qos: 1 }, (err) => {
                    if (!err) {
                        console.log('✅ Subscribed to:', topic);
                    } else {
                        console.error('❌ Subscribe error:', topic, err);
                    }
                });
            });
            
            // Publish status online
            mqttClient.publish(MQTT_CONFIG.topics.statusDashboard, 'online', { qos: 1, retain: false });
            
            // Request status dari ESP32
            setTimeout(() => {
                if (mqttClient && mqttClient.connected) {
                    mqttClient.publish('hydroponic/status/request', 'STATUS');
                    showToast('📡 Menunggu data dari ESP32...', 'info');
                }
            }, 1000);
        });
        
        mqttClient.on('message', (topic, message) => {
            const payload = message.toString();
            console.log('📥', topic, '->', payload.substring(0, 100));
            handleMQTTMessage(topic, payload);
        });
        
        mqttClient.on('error', (err) => {
            console.error('❌ MQTT Error:', err);
            state.broker = "offline";
            state.mqttConnected = false;
            renderConnStatus();
            showToast('❌ MQTT Error with ' + MQTT_CONFIG.brokerName + ': ' + err.message, 'error');
            
            // Try next broker
            switchToNextBroker();
        });
        
        mqttClient.on('offline', () => {
            console.log('⚠️ MQTT Offline');
            state.broker = "offline";
            state.mqttConnected = false;
            renderConnStatus();
        });
        
        mqttClient.on('reconnect', () => {
            console.log('🔄 MQTT Reconnecting...');
            state.broker = "connecting";
            renderConnStatus();
        });
        
        mqttClient.on('close', () => {
            console.log('🔌 MQTT Connection Closed');
            state.broker = "offline";
            state.mqttConnected = false;
            renderConnStatus();
            
            // Try next broker after delay
            setTimeout(() => {
                if (!state.mqttConnected) {
                    switchToNextBroker();
                }
            }, 5000);
        });
        
    } catch (e) {
        console.error('❌ MQTT Init error:', e);
        state.broker = "offline";
        renderConnStatus();
        showToast('❌ MQTT Error: ' + e.message, 'error');
        
        // Try next broker
        setTimeout(() => {
            switchToNextBroker();
        }, 5000);
    }
}

// ==================== SWITCH TO NEXT BROKER ====================
function switchToNextBroker() {
    CURRENT_BROKER_INDEX = (CURRENT_BROKER_INDEX + 1) % MQTT_BROKERS.length;
    console.log('🔄 Switching to broker:', MQTT_BROKERS[CURRENT_BROKER_INDEX].name);
    showToast('🔄 Switching to ' + MQTT_BROKERS[CURRENT_BROKER_INDEX].name + '...', 'info');
    
    // Update config
    Object.defineProperty(MQTT_CONFIG, 'broker', {
        get: function() { return MQTT_BROKERS[CURRENT_BROKER_INDEX].broker; }
    });
    Object.defineProperty(MQTT_CONFIG, 'brokerName', {
        get: function() { return MQTT_BROKERS[CURRENT_BROKER_INDEX].name; }
    });
    
    document.getElementById('connHost').textContent = MQTT_CONFIG.brokerName + ' (' + MQTT_CONFIG.broker + ')';
    
    // Reconnect
    connectMQTT();
}

// ==================== HANDLE MQTT MESSAGE ====================
function handleMQTTMessage(topic, payload) {
    state.lastPacket = Date.now();
    state.packets++;
    state.hasReceivedData = true;
    
    // Update status ESP
    if (topic === MQTT_CONFIG.topics.statusDevice) {
        state.esp = payload === 'online' ? 'active' : 'inactive';
        renderConnStatus();
        return;
    }
    
    // Parse sensor data
    if (topic === MQTT_CONFIG.topics.all) {
        try {
            const data = JSON.parse(payload);
            if (data.ph !== undefined) {
                state.values.ph = parseFloat(data.ph);
                state.history.ph = state.history.ph.slice(1).concat(state.values.ph);
            }
            if (data.tds !== undefined) {
                state.values.tds = parseFloat(data.tds);
                state.history.tds = state.history.tds.slice(1).concat(state.values.tds);
            }
            if (data.temperature !== undefined) {
                state.values.temp = parseFloat(data.temperature);
                state.history.temp = state.history.temp.slice(1).concat(state.values.temp);
            }
            
            renderSensors();
            renderPhPanel();
            updateFuzzyLogic();
            
        } catch (e) {
            console.warn('⚠️ Failed to parse JSON:', e);
        }
        return;
    }
    
    // Individual sensor topics
    if (topic === MQTT_CONFIG.topics.ph) {
        state.values.ph = parseFloat(payload);
        state.history.ph = state.history.ph.slice(1).concat(state.values.ph);
        renderSensors();
        renderPhPanel();
        updateFuzzyLogic();
        return;
    }
    
    if (topic === MQTT_CONFIG.topics.tds) {
        state.values.tds = parseFloat(payload);
        state.history.tds = state.history.tds.slice(1).concat(state.values.tds);
        renderSensors();
        return;
    }
    
    if (topic === MQTT_CONFIG.topics.temp) {
        state.values.temp = parseFloat(payload);
        state.history.temp = state.history.temp.slice(1).concat(state.values.temp);
        renderSensors();
        return;
    }
    
    // Pump status
    const pumpMap = {
        'hydroponic/status/aerator': 'aerator',
        'hydroponic/status/sirkulasi1': 'sirkulasi1',
        'hydroponic/status/sirkulasi2': 'sirkulasi2',
        'hydroponic/status/phup': 'phUp',
        'hydroponic/status/phdown': 'phDown',
        'hydroponic/status/nutrisia': 'nutrisiA',
        'hydroponic/status/nutrisib': 'nutrisiB'
    };
    
    if (pumpMap[topic]) {
        state.pumps[pumpMap[topic]] = payload === 'ON';
        renderPumps();
        renderPhPanel();
        return;
    }
}

// ==================== FUZZY LOGIC ====================
function triangle(x, a, b, c) {
  if (x <= a || x >= c) return 0;
  if (x === b) return 1;
  return x < b ? (x - a) / (b - a) : (c - x) / (c - b);
}

function shoulderLeft(x, a, b) {
  if (x <= a) return 1;
  if (x >= b) return 0;
  return (b - x) / (b - a);
}

function shoulderRight(x, a, b) {
  if (x <= a) return 0;
  if (x >= b) return 1;
  return (x - a) / (b - a);
}

function fuzzyPhController(ph, targetMin, targetMax) {
  const center = (targetMin + targetMax) / 2;
  const e = ph - center;

  const asamKuat = shoulderLeft(e, -1.0, -0.5);
  const asamLemah = triangle(e, -0.7, -0.3, -0.05);
  const netral = triangle(e, -0.15, 0, 0.15);
  const basaLemah = triangle(e, 0.05, 0.3, 0.7);
  const basaKuat = shoulderRight(e, 0.5, 1.0);

  const rules = [
    { w: asamKuat, out: 1.0 },
    { w: asamLemah, out: 0.5 },
    { w: netral, out: 0.0 },
    { w: basaLemah, out: -0.5 },
    { w: basaKuat, out: -1.0 },
  ];

  const sumW = rules.reduce((a, r) => a + r.w, 0);
  const crisp = sumW > 0 ? rules.reduce((a, r) => a + r.w * r.out, 0) / sumW : 0;

  let action = "idle";
  if (crisp > 0.08) action = "dosing-up";
  else if (crisp < -0.08) action = "dosing-down";

  return {
    memberships: { asamKuat, asamLemah, netral, basaLemah, basaKuat },
    crisp,
    action,
    strength: Math.min(1, Math.abs(crisp)),
  };
}

function updateFuzzyLogic() {
    const ph = state.values.ph || 0;
    const { min, max } = state.phTarget;
    const fuzzy = fuzzyPhController(ph, min, max);
    state.fuzzy = fuzzy;
}

// ==================== PUBLISH CONTROL ====================
function publishControl(topic, value) {
    if (!mqttClient || !mqttClient.connected) {
        showToast('⚠️ MQTT not connected!', 'warning');
        return false;
    }
    
    try {
        mqttClient.publish(topic, value, { qos: 1 });
        console.log('📤', topic, '->', value);
        return true;
    } catch (e) {
        console.error('❌ Publish error:', e);
        showToast('❌ Failed to publish: ' + e.message, 'error');
        return false;
    }
}

// ==================== RENDER FUNCTIONS ====================

function renderConnStatus() {
  const bDot = document.getElementById("brokerDot");
  const bTxt = document.getElementById("brokerStatus");
  const eDot = document.getElementById("espDot");
  const eTxt = document.getElementById("espStatus");
  const reBtn = document.getElementById("reconnectBtn");

  bDot.className = "dot " + (state.broker === "online" ? "online" : state.broker === "connecting" ? "connecting" : "offline");
  bTxt.textContent = state.broker === "online" ? "Terhubung (" + MQTT_CONFIG.brokerName + ")" : state.broker === "connecting" ? "Menghubungkan…" : "Terputus";

  const espOk = state.broker === "online" && state.esp === "active";
  eDot.className = "dot " + (espOk ? "online" : state.esp === "waiting" ? "connecting" : "offline");
  eTxt.textContent = !state.broker || state.broker !== "online" ? "Tidak ada sinyal" : espOk ? "Aktif" : state.esp === "waiting" ? "Menunggu…" : "Tidak aktif";

  reBtn.textContent = state.broker === "online" ? "Putuskan" : "Sambungkan";
  reBtn.className = "btn-reconnect" + (state.broker === "online" ? "" : " reconnect");
}

function sensorStatus(cfg, v) {
  if (v < cfg.idealMin || v > cfg.idealMax) {
    const span = cfg.idealMax - cfg.idealMin;
    const dist = v < cfg.idealMin ? cfg.idealMin - v : v - cfg.idealMax;
    return dist > span * 0.35 ? "crit" : "warn";
  }
  return "ok";
}

const STATUS_TEXT = { ok: "Ideal", warn: "Perhatian", crit: "Kritis" };

function sparkPath(data, w, h) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((d - min) / range) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function renderSensors() {
  const grid = document.getElementById("sensorGrid");
  grid.innerHTML = SENSORS.map((s) => {
    const v = state.values[s.key] || 0;
    const st = sensorStatus(s, v);
    const data = state.history[s.key] || Array(HISTORY_LEN).fill(v);
    const path = sparkPath(data, 240, 40);
    const idealLeft = ((s.idealMin - s.scaleMin) / (s.scaleMax - s.scaleMin)) * 100;
    const idealWidth = ((s.idealMax - s.idealMin) / (s.scaleMax - s.scaleMin)) * 100;
    const markerPos = Math.max(0, Math.min(100, ((v - s.scaleMin) / (s.scaleMax - s.scaleMin)) * 100));
    return `
      <div class="sensor-card">
        <div class="sc-head">
          <div class="sc-title">
            <span class="sc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg></span>
            ${s.label}
          </div>
          <span class="sc-badge ${st}">${STATUS_TEXT[st]}</span>
        </div>
        <div class="sc-value">
          <span class="sc-num">${v.toFixed(s.decimals)}</span>
          <span class="sc-unit">${s.unit}</span>
        </div>
        <svg class="sc-spark" viewBox="0 0 240 40" preserveAspectRatio="none">
          <path d="${path}" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="sc-scale">
          <div class="sc-scale-ideal" style="left:${idealLeft}%;width:${idealWidth}%"></div>
          <div class="sc-scale-marker" style="left:${markerPos}%"></div>
        </div>
        <div class="sc-scale-labels">
          <span>${s.scaleMin}</span>
          <span>ideal ${s.idealMin}–${s.idealMax}</span>
          <span>${s.scaleMax}</span>
        </div>
      </div>`;
  }).join("");
}

function renderPhPanel() {
  const panel = document.getElementById("phPanel");
  const ph = state.values.ph || 0;
  const { min, max } = state.phTarget;
  const inRange = ph >= min && max >= ph;
  const stateColor = inRange
    ? "color:var(--ok);background:var(--primary-soft)"
    : ph < min
    ? "color:#97650f;background:#fbf1dc"
    : "color:var(--danger);background:var(--danger-soft)";
  const stateText = inRange ? "Dalam rentang" : ph < min ? "Terlalu asam" : "Terlalu basa";
  const f = state.fuzzy;

  const presetOptions = ['<option value="custom">Target manual…</option>']
    .concat(PLANT_PRESETS.map((p) => `<option value="${p.key}" ${state.preset === p.key ? "selected" : ""}>${p.name} (pH ${p.phMin}–${p.phMax})</option>`))
    .join("");

  const upActive = state.pumps.phUp;
  const downActive = state.pumps.phDown;
  const manual = state.phMode === "manual";

  const fuzzyRows = [
    ["Asam Kuat", f.memberships?.asamKuat ?? 0],
    ["Asam Lemah", f.memberships?.asamLemah ?? 0],
    ["Netral", f.memberships?.netral ?? 0],
    ["Basa Lemah", f.memberships?.basaLemah ?? 0],
    ["Basa Kuat", f.memberships?.basaKuat ?? 0],
  ]
    .map(
      ([name, val]) => `
      <div class="fuzzy-row">
        <span class="fuzzy-name">${name}</span>
        <span class="fuzzy-bar"><span class="fuzzy-fill" style="width:${(val * 100).toFixed(0)}%"></span></span>
        <span class="fuzzy-pct">${(val * 100).toFixed(0)}%</span>
      </div>`
    )
    .join("");

  panel.innerHTML = `
    <div class="ph-left">
      <div class="ph-mode" role="radiogroup" aria-label="Mode kontrol pH">
        <button role="radio" aria-checked="${state.phMode === "auto"}" class="${state.phMode === "auto" ? "active" : ""}" data-mode="auto">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>
          Auto
        </button>
        <button role="radio" aria-checked="${state.phMode === "manual"}" class="${manual ? "active" : ""}" data-mode="manual">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V6a3 3 0 0 1 6 0v5M5 11h14l-1 9H6z"/></svg>
          Manual
        </button>
      </div>

      <div class="ph-readout">
        <span class="val">${ph.toFixed(2)}</span>
        <span class="ph-state" style="${stateColor}">${stateText}</span>
      </div>

      <div class="ph-target-box">
        <label>Preset tanaman</label>
        <select class="ph-select" id="presetSelect">${presetOptions}</select>
        <div class="ph-target-row" style="margin-top:12px">
          <input type="number" id="phMin" step="0.1" min="${PH_ALLOWED_MIN}" max="${PH_ALLOWED_MAX}" value="${min.toFixed(1)}" aria-label="pH minimum" />
          <span>s/d</span>
          <input type="number" id="phMax" step="0.1" min="${PH_ALLOWED_MIN}" max="${PH_ALLOWED_MAX}" value="${max.toFixed(1)}" aria-label="pH maksimum" />
        </div>
        <p class="ph-hint" style="margin-top:8px">Rentang aman larutan nutrisi: pH ${PH_ALLOWED_MIN}–${PH_ALLOWED_MAX}.</p>
      </div>
    </div>

    <div class="ph-right">
      <div class="fuzzy-box">
        <h4>Derajat Keanggotaan Fuzzy · e = ${(ph - (min + max) / 2).toFixed(2)}</h4>
        ${fuzzyRows}
      </div>

      <div class="dose-cards">
        <div class="dose-card ${upActive ? "active" : ""}">
          <h4><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg> pH Up</h4>
          <div class="chem">GPIO 10 · KOH 10%</div>
          <div class="dose-status ${upActive ? "on" : ""}">${upActive ? "Mendosis…" : "Standby"}</div>
          <button class="dose-btn ${upActive ? "on" : ""}" data-dose="phUp" ${manual ? "" : "disabled"}>${upActive ? "Matikan" : "Nyalakan"}</button>
        </div>
        <div class="dose-card ${downActive ? "active" : ""}">
          <h4><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg> pH Down</h4>
          <div class="chem">GPIO 46 · H₃PO₄</div>
          <div class="dose-status ${downActive ? "on" : ""}">${downActive ? "Mendosis…" : "Standby"}</div>
          <button class="dose-btn ${downActive ? "on" : ""}" data-dose="phDown" ${manual ? "" : "disabled"}>${downActive ? "Matikan" : "Nyalakan"}</button>
        </div>
      </div>

      <p class="ph-hint">${
        manual
          ? "Mode Manual: nyalakan pompa pH sesuai kebutuhan. Hanya satu pompa aktif dalam satu waktu."
          : `Mode Auto (Fuzzy): sistem mengevaluasi pH dan mengatur dosis otomatis. Kekuatan dosis saat ini <strong>${(f.strength * 100).toFixed(0)}%</strong>.`
      }</p>
    </div>`;

  // wire events
  panel.querySelectorAll("[data-mode]").forEach((btn) =>
    btn.addEventListener("click", () => setPhMode(btn.dataset.mode))
  );
  panel.querySelectorAll("[data-dose]").forEach((btn) =>
    btn.addEventListener("click", () => togglePhManual(btn.dataset.dose))
  );
  const presetSel = panel.querySelector("#presetSelect");
  presetSel && presetSel.addEventListener("change", (e) => applyPreset(e.target.value));
  const phMinEl = panel.querySelector("#phMin");
  const phMaxEl = panel.querySelector("#phMax");
  [phMinEl, phMaxEl].forEach((el) =>
    el.addEventListener("change", () => {
      const mn = clamp(parseFloat(phMinEl.value), PH_ALLOWED_MIN, PH_ALLOWED_MAX);
      const mx = clamp(parseFloat(phMaxEl.value), PH_ALLOWED_MIN, PH_ALLOWED_MAX);
      state.phTarget = { min: Math.min(mn, mx), max: Math.max(mn, mx) };
      state.preset = "custom";
      renderPhPanel();
    })
  );
}

function renderPumps() {
  const container = document.getElementById("pumpGroups");
  container.innerHTML = PUMP_GROUP_ORDER.map((group) => {
    const rows = PUMPS.filter((p) => p.group === group)
      .map((p) => {
        const on = state.pumps[p.key] || false;
        return `
        <div class="pump-row">
          <div class="pump-info">
            <span class="pump-ic ${on ? "on" : ""}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PUMP_ICON}</svg></span>
            <div>
              <div class="pump-name">${p.name}</div>
              <div class="pump-pin">GPIO ${p.pin}</div>
            </div>
          </div>
          <label class="switch">
            <input type="checkbox" ${on ? "checked" : ""} data-pump="${p.key}" aria-label="${on ? "Matikan" : "Nyalakan"} pompa ${p.name}" />
            <span class="slider"></span>
          </label>
        </div>`;
      })
      .join("");
    return `<div class="pump-group"><h3>${group}</h3>${rows}</div>`;
  }).join("");

  container.querySelectorAll("[data-pump]").forEach((input) =>
    input.addEventListener("change", (e) => togglePump(e.target.dataset.pump, e.target.checked))
  );

  const active = Object.values(state.pumps).filter(Boolean).length;
  document.getElementById("activePumps").textContent = active;
}

function clamp(v, a, b) {
  if (isNaN(v)) return a;
  return Math.max(a, Math.min(b, v));
}

// ==================== ACTIONS ====================
function togglePump(key, val) {
  state.pumps[key] = val;
  const pump = PUMPS.find(p => p.key === key);
  if (pump) {
    publishControl(pump.controlTopic, val ? "ON" : "OFF");
  }
  renderPumps();
}

function setPhMode(mode) {
  state.phMode = mode;
  if (mode === "manual") {
    state.pumps.phUp = false;
    state.pumps.phDown = false;
    publishControl('hydroponic/control/phup', "OFF");
    publishControl('hydroponic/control/phdown', "OFF");
  }
  renderPhPanel();
}

function togglePhManual(pump) {
  const next = !state.pumps[pump];
  state.pumps.phUp = pump === "phUp" ? next : false;
  state.pumps.phDown = pump === "phDown" ? next : false;
  
  if (pump === "phUp") {
    publishControl('hydroponic/control/phup', next ? "ON" : "OFF");
  } else if (pump === "phDown") {
    publishControl('hydroponic/control/phdown', next ? "ON" : "OFF");
  }
  renderPhPanel();
}

function applyPreset(key) {
  state.preset = key;
  const p = PLANT_PRESETS.find((x) => x.key === key);
  if (p) state.phTarget = { min: p.phMin, max: p.phMax };
  renderPhPanel();
}

// ==================== CLOCK & UPTIME ====================
function pad(n) {
  return String(n).padStart(2, "0");
}

function tickClock() {
  const now = new Date();
  document.getElementById("clock").textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  document.getElementById("pktCount").textContent = state.packets.toLocaleString("id-ID");
  if (state.broker === "online") {
    const s = Math.floor((Date.now() - state.startTime) / 1000);
    document.getElementById("uptime").textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  } else {
    document.getElementById("uptime").textContent = "00:00:00";
  }
}

// ==================== TOAST ====================
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
        const div = document.createElement('div');
        div.id = 'toastContainer';
        div.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
        document.body.appendChild(div);
        return showToast(message, type);
    }
    
    const toast = document.createElement('div');
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };
    toast.style.cssText = `
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        background: ${colors[type] || '#6b7280'};
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 14px;
        font-weight: 500;
        animation: slideIn 0.3s ease;
        max-width: 400px;
    `;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ==================== RECONNECT ====================
document.getElementById("reconnectBtn").addEventListener("click", () => {
  if (state.broker === "online") {
    if (mqttClient) {
      mqttClient.end();
    }
    state.broker = "offline";
    state.mqttConnected = false;
    renderConnStatus();
    showToast('🔌 Disconnected from MQTT', 'info');
  } else {
    // Reset to first broker
    CURRENT_BROKER_INDEX = 0;
    Object.defineProperty(MQTT_CONFIG, 'broker', {
        get: function() { return MQTT_BROKERS[CURRENT_BROKER_INDEX].broker; }
    });
    Object.defineProperty(MQTT_CONFIG, 'brokerName', {
        get: function() { return MQTT_BROKERS[CURRENT_BROKER_INDEX].name; }
    });
    connectMQTT();
    showToast('🔄 Connecting to ' + MQTT_CONFIG.brokerName + '...', 'info');
  }
});

// ==================== ADD TOAST STYLES ====================
const style = document.createElement('style');
style.textContent = `
@keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}
`;
document.head.appendChild(style);

// ==================== INITIAL RENDER ====================
renderSensors();
renderPhPanel();
renderPumps();
renderConnStatus();

console.log('✅ Dashboard ready!');
console.log('📡 Monitoring MQTT topics:', MQTT_CONFIG.topics);
console.log('📡 Current Broker:', MQTT_CONFIG.brokerName);
