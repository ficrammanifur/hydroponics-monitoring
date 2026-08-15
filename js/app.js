/* ============================================================
   HYDROPONIC NFT DASHBOARD - APP.JS
   ============================================================ */

// ==================== CONFIG ====================
const BROKERS = [
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://test.mosquitto.org:8081/mqtt',
    'wss://broker.emqx.io:8084/mqtt'
];
let brokerIdx = 0;

const TOPICS = {
    ph: 'hydroponic/riski/sensor/ph',
    tds: 'hydroponic/riski/sensor/tds',
    temp: 'hydroponic/riski/sensor/temp',
    all: 'hydroponic/riski/sensor/all',
    controlAerator: 'hydroponic/riski/control/aerator',
    controlSirkulasi: 'hydroponic/riski/control/sirkulasi',
    controlPhUp: 'hydroponic/riski/control/phup',
    controlPhDown: 'hydroponic/riski/control/phdown',
    controlNutrisiA: 'hydroponic/riski/control/nutrisia',
    controlNutrisiB: 'hydroponic/riski/control/nutrisib',
    statusAerator: 'hydroponic/riski/status/aerator',
    statusSirkulasi: 'hydroponic/riski/status/sirkulasi',
    statusPhUp: 'hydroponic/riski/status/phup',
    statusPhDown: 'hydroponic/riski/status/phdown',
    statusNutrisiA: 'hydroponic/riski/status/nutrisia',
    statusNutrisiB: 'hydroponic/riski/status/nutrisib',
    statusDevice: 'hydroponic/riski/status/device',
    statusDashboard: 'hydroponic/riski/status/dashboard',
    statusRequest: 'hydroponic/riski/status/request',
    controlPhMode: 'hydroponic/riski/control/phmode',
    controlPreset: 'hydroponic/riski/control/preset'
};

// ==================== PLANT PRESETS ====================
const PLANTS = [
    { key: 'custom', name: '🎯 Manual', phMin: 5.8, phMax: 6.3 },
    { key: 'selada', name: '🥬 Selada', phMin: 6.0, phMax: 7.0 },
    { key: 'sawi', name: '🌿 Sawi', phMin: 5.5, phMax: 6.5 },
    { key: 'kangkung', name: '🌱 Kangkung', phMin: 5.5, phMax: 6.5 },
    { key: 'bayam', name: '🍃 Bayam', phMin: 6.0, phMax: 7.0 },
    { key: 'kailan', name: '🥦 Kailan', phMin: 5.5, phMax: 6.5 },
    { key: 'pakcoy', name: '🥬 Pakcoy', phMin: 6.8, phMax: 7.0 },
    { key: 'seledri', name: '🌿 Seledri', phMin: 6.3, phMax: 6.7 },
    { key: 'cabe', name: '🌶️ Cabe', phMin: 6.0, phMax: 6.5 },
    { key: 'peterseli', name: '🌿 Peterseli', phMin: 5.5, phMax: 6.0 },
    { key: 'strawberry', name: '🍓 Strawberry', phMin: 5.8, phMax: 6.2 },
    { key: 'ketimun', name: '🥒 Ketimun', phMin: 5.3, phMax: 5.7 }
];

// ==================== SENSORS & PUMPS ====================
const SENSORS = [
    { key: 'ph', label: 'pH', unit: 'pH', dec: 2, icon: 'fa-vial', idealMin: 5.5, idealMax: 7.0 },
    { key: 'tds', label: 'TDS', unit: 'ppm', dec: 0, icon: 'fa-water', idealMin: 800, idealMax: 1400 },
    { key: 'temp', label: 'Suhu', unit: '°C', dec: 1, icon: 'fa-temperature-half', idealMin: 18, idealMax: 28 }
];

const PUMPS = [
    { key: 'aerator', name: 'Aerator', pin: 13, icon: 'fa-wind' },
    { key: 'sirkulasi', name: 'Sirkulasi', pin: 14, icon: 'fa-arrows-rotate' },
    { key: 'phUp', name: 'pH Up', pin: 26, icon: 'fa-arrow-up' },
    { key: 'phDown', name: 'pH Down', pin: 25, icon: 'fa-arrow-down' },
    { key: 'nutrisiA', name: 'Nutrisi A', pin: 33, icon: 'fa-flask' },
    { key: 'nutrisiB', name: 'Nutrisi B', pin: 32, icon: 'fa-flask' }
];

// ==================== STATE ====================
const state = {
    values: { ph: 0, tds: 0, temp: 0 },
    pumps: { aerator: false, sirkulasi: false, phUp: false, phDown: false, nutrisiA: false, nutrisiB: false },
    phMode: 'auto',
    phTarget: { min: 5.8, max: 6.3 },
    fuzzy: { strength: 0, action: 'idle' },
    broker: 'offline',
    esp: 'waiting',
    packets: 0,
    startTime: Date.now(),
    mqttConnected: false,
    hasData: false,
    connecting: false,
    attempts: 0,
    currentPreset: 'custom',
    chartLabels: [],
    chartPhData: [],
    chartTdsData: [],
    chartTempData: [],
    maxChartPoints: 30
};

let client = null;
let chartInstance = null;

// ==================== DOM REFS ====================
const $ = id => document.getElementById(id);
const dom = {
    sidebar: $('sidebar'),
    sidebarOverlay: $('sidebarOverlay'),
    mobileToggleBtn: $('mobileToggleBtn'),
    sidebarDot: $('sidebarDot'),
    sidebarStatusTitle: $('sidebarStatusTitle'),
    sidebarStatusSub: $('sidebarStatusSub'),
    brokerDot: $('headerStatusDot'),
    brokerStatus: $('headerSystemStatus'),
    mqttBadge: $('mqttBadge'),
    espBadge: $('espBadge'),
    clock: $('clock'),
    uptime: $('uptime'),
    pktCount: $('pktCount'),
    clientId: $('clientId'),
    connHost: $('connHost'),
    connPort: $('connPort'),
    reconnectBtn: $('reconnectBtn'),
    sensorGrid: $('sensorGrid'),
    pumpGrid: $('pumpGrid'),
    phPanel: $('phPanel'),
    activePumps: $('activePumps'),
    statusIcon: $('statusIcon'),
    waterStatus: $('waterStatus'),
    statusDetail: $('statusDetail'),
    statusBadge: $('statusBadge'),
    lastUpdate: $('lastUpdate'),
    signalStatus: $('signalStatus'),
    lastMessage: $('lastMessage'),
    presetBadge: $('presetBadge'),
    footerTime: $('footerTime'),
    btnCopyData: $('btnCopyData')
};

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🌱 Hydroponic NFT Dashboard v2.0');
    console.log('🧠 Fuzzy Logic running in JavaScript!');
    
    initNavigation();
    initChart();
    renderSensors();
    renderPumps();
    renderPhPanel();
    updateStatus();
    updateFooterTime();
    
    setTimeout(connectMQTT, 1000);
    setInterval(tick, 1000);
    setInterval(updateFooterTime, 30000);
    tick();
});

// ==================== NAVIGATION ====================
function initNavigation() {
    const sidebar = dom.sidebar;
    const overlay = dom.sidebarOverlay;
    const toggleBtn = dom.mobileToggleBtn;
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('active');
        });
    }
    
    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        });
    }
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            if (window.innerWidth <= 992) {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
            }
        });
    });
}

// ==================== CHART ====================
function initChart() {
    const canvas = document.getElementById('environmentChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const initialData = Array(30).fill(0);
    
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(30).fill('--'),
            datasets: [{
                label: 'pH',
                data: initialData,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                fill: true,
                tension: 0.4,
                borderWidth: 2,
                pointRadius: 1.5,
                pointBackgroundColor: '#10b981',
                pointHoverRadius: 4
            }, {
                label: 'TDS (ppm)',
                data: initialData,
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                fill: true,
                tension: 0.4,
                borderWidth: 2,
                pointRadius: 1.5,
                pointBackgroundColor: '#38bdf8',
                pointHoverRadius: 4,
                hidden: true
            }, {
                label: 'Temperature (°C)',
                data: initialData,
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                fill: true,
                tension: 0.4,
                borderWidth: 2,
                pointRadius: 1.5,
                pointBackgroundColor: '#f59e0b',
                pointHoverRadius: 4,
                hidden: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#9ca3af',
                        font: { family: "'JetBrains Mono', monospace", size: 10 },
                        boxWidth: 12,
                        padding: 10
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(17, 24, 39, 0.9)',
                    titleColor: '#f3f4f6',
                    bodyColor: '#9ca3af',
                    borderColor: 'rgba(255,255,255,0.05)',
                    borderWidth: 1,
                    padding: 8,
                    cornerRadius: 6
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: '#6b7280', maxTicksLimit: 8, font: { size: 9 } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: '#6b7280', font: { size: 9 } }
                }
            },
            interaction: { intersect: false, mode: 'index' }
        }
    });
    
    document.querySelectorAll('.chart-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const target = tab.dataset.target;
            const datasets = chartInstance.data.datasets;
            datasets.forEach(d => d.hidden = true);
            
            if (target === 'temp') { datasets[2].hidden = false;
                datasets[2].label = 'Temperature (°C)'; } 
            else if (target === 'ph') { datasets[0].hidden = false;
                datasets[0].label = 'pH'; } 
            else if (target === 'tds') { datasets[1].hidden = false;
                datasets[1].label = 'TDS (ppm)'; }
            
            chartInstance.update();
        });
    });
    
    chartInstance.data.datasets[1].hidden = true;
    chartInstance.data.datasets[2].hidden = true;
    chartInstance.update();
}

function updateChart(ph, tds, temp) {
    if (!chartInstance) return;
    
    const now = new Date();
    const label = now.getHours().toString().padStart(2, '0') + ':' + 
                  now.getMinutes().toString().padStart(2, '0');
    
    if (state.chartLabels.length >= state.maxChartPoints) {
        state.chartLabels.shift();
        state.chartPhData.shift();
        state.chartTdsData.shift();
        state.chartTempData.shift();
    }
    
    state.chartLabels.push(label);
    if (ph !== null && ph !== undefined) state.chartPhData.push(ph);
    if (tds !== null && tds !== undefined) state.chartTdsData.push(tds);
    if (temp !== null && temp !== undefined) state.chartTempData.push(temp);
    
    chartInstance.data.labels = state.chartLabels;
    chartInstance.data.datasets[0].data = state.chartPhData;
    chartInstance.data.datasets[1].data = state.chartTdsData;
    chartInstance.data.datasets[2].data = state.chartTempData;
    chartInstance.update('none');
}

// ==================== CONNECT MQTT ====================
function connectMQTT() {
    if (state.connecting) return;
    if (state.attempts >= 15) {
        toast('❌ Gagal konek. Refresh halaman.', 'error');
        return;
    }
    
    if (client && client.connected) { client.end();
        client = null; }
    
    state.broker = 'connecting';
    state.connecting = true;
    state.attempts++;
    updateStatus();
    
    if (state.attempts > 3 && brokerIdx < BROKERS.length - 1) {
        brokerIdx++;
        dom.connHost.textContent = new URL(BROKERS[brokerIdx]).hostname;
        dom.connPort.textContent = 'WSS';
        toast('🔄 Coba broker alternatif...', 'info');
    }
    
    const url = BROKERS[brokerIdx];
    const id = 'dash_' + Math.random().toString(16).substr(2, 8);
    dom.clientId.textContent = id;
    
    const opts = {
        clientId: id,
        clean: true,
        reconnectPeriod: 3000,
        keepAlive: 60,
        connectTimeout: 15000,
        will: { topic: TOPICS.statusDashboard, payload: 'offline', qos: 1, retain: false }
    };
    
    console.log('🔄 Connecting to', url);
    toast('🔄 Menghubungkan...', 'info');
    
    try {
        client = mqtt.connect(url, opts);
        
        client.on('connect', () => {
            console.log('✅ Connected');
            state.broker = 'online';
            state.mqttConnected = true;
            state.connecting = false;
            state.attempts = 0;
            state.startTime = Date.now();
            updateStatus();
            toast('✅ MQTT Terhubung!', 'success');
            
            const subs = [
                TOPICS.ph, TOPICS.tds, TOPICS.temp, TOPICS.all,
                TOPICS.statusDevice, TOPICS.statusAerator, TOPICS.statusSirkulasi,
                TOPICS.statusPhUp, TOPICS.statusPhDown,
                TOPICS.statusNutrisiA, TOPICS.statusNutrisiB
            ];
            subs.forEach(t => client.subscribe(t, { qos: 1 }));
            client.subscribe('hydroponic/riski/#', { qos: 1 });
            client.publish(TOPICS.statusDashboard, 'online', { qos: 1 });
            
            setTimeout(() => {
                if (client && client.connected) {
                    client.publish(TOPICS.statusRequest, 'STATUS');
                }
            }, 1000);
        });
        
        client.on('message', (topic, payload) => handleMessage(topic, payload.toString()));
        
        client.on('error', (err) => {
            console.error('❌ Error:', err.message);
            state.broker = 'offline';
            state.mqttConnected = false;
            state.connecting = false;
            updateStatus();
            toast('❌ ' + err.message, 'error');
            setTimeout(() => { if (!state.mqttConnected) connectMQTT(); }, 5000);
        });
        
        client.on('offline', () => {
            state.broker = 'offline';
            state.mqttConnected = false;
            state.connecting = false;
            updateStatus();
        });
        
        client.on('close', () => {
            state.broker = 'offline';
            state.mqttConnected = false;
            state.connecting = false;
            updateStatus();
            setTimeout(() => { if (!state.mqttConnected) connectMQTT(); }, 3000);
        });
        
    } catch (e) {
        console.error('❌ Init error:', e);
        state.broker = 'offline';
        state.connecting = false;
        updateStatus();
        toast('❌ ' + e.message, 'error');
        setTimeout(() => { if (!state.mqttConnected) connectMQTT(); }, 5000);
    }
}

// ==================== HANDLE MESSAGE ====================
function handleMessage(topic, payload) {
    state.packets++;
    state.hasData = true;
    dom.pktCount.textContent = state.packets;
    
    if (topic === TOPICS.statusDevice) {
        state.esp = payload === 'online' ? 'active' : 'inactive';
        updateStatus();
        if (payload === 'online') toast('✅ ESP32 Online!', 'success');
        return;
    }
    
    if (topic === TOPICS.all) {
        try {
            const d = JSON.parse(payload);
            dom.lastMessage.textContent = JSON.stringify(d, null, 2);
            
            let hasUpdate = false;
            
            if (d.ph !== undefined) {
                state.values.ph = parseFloat(d.ph);
                updateSensor('ph', state.values.ph);
                hasUpdate = true;
            }
            if (d.tds !== undefined) {
                state.values.tds = parseFloat(d.tds);
                updateSensor('tds', state.values.tds);
                hasUpdate = true;
            }
            if (d.temperature !== undefined) {
                state.values.temp = parseFloat(d.temperature);
                updateSensor('temp', state.values.temp);
                hasUpdate = true;
            }
            
            if (d.aerator !== undefined) state.pumps.aerator = d.aerator === 'ON';
            if (d.sirkulasi !== undefined) state.pumps.sirkulasi = d.sirkulasi === 'ON';
            if (d.phup !== undefined) state.pumps.phUp = d.phup === 'ON';
            if (d.phdown !== undefined) state.pumps.phDown = d.phdown === 'ON';
            if (d.nutrisia !== undefined) state.pumps.nutrisiA = d.nutrisia === 'ON';
            if (d.nutrisib !== undefined) state.pumps.nutrisiB = d.nutrisib === 'ON';
            
            if (d.ph_target_min !== undefined) state.phTarget.min = parseFloat(d.ph_target_min);
            if (d.ph_target_max !== undefined) state.phTarget.max = parseFloat(d.ph_target_max);
            
            // Update chart
            updateChart(state.values.ph, state.values.tds, state.values.temp);
            
            renderPumps();
            renderPhPanel();
            updateStatus();
            
            // Run Fuzzy Logic
            if (state.phMode === 'auto' && hasUpdate) {
                runFuzzyLogic();
            }
            
        } catch (e) {
            dom.lastMessage.textContent = '❌ Parse error: ' + e.message + '\n\n' + payload.substring(0, 200);
        }
        return;
    }
    
    // Individual sensors
    const map = { [TOPICS.ph]: 'ph', [TOPICS.tds]: 'tds', [TOPICS.temp]: 'temp' };
    if (map[topic]) {
        const v = parseFloat(payload);
        if (!isNaN(v)) {
            state.values[map[topic]] = v;
            updateSensor(map[topic], v);
            updateChart(state.values.ph, state.values.tds, state.values.temp);
            if (state.phMode === 'auto') runFuzzyLogic();
        }
        return;
    }
    
    // Pump status
    const pmap = {
        [TOPICS.statusAerator]: 'aerator',
        [TOPICS.statusSirkulasi]: 'sirkulasi',
        [TOPICS.statusPhUp]: 'phUp',
        [TOPICS.statusPhDown]: 'phDown',
        [TOPICS.statusNutrisiA]: 'nutrisiA',
        [TOPICS.statusNutrisiB]: 'nutrisiB'
    };
    if (pmap[topic]) {
        state.pumps[pmap[topic]] = payload === 'ON';
        renderPumps();
        renderPhPanel();
    }
}

// ==================== FUZZY LOGIC ====================
function runFuzzyLogic() {
    const ph = state.values.ph || 0;
    const { min, max } = state.phTarget;
    const targetCenter = (min + max) / 2.0;
    const error = ph - targetCenter;
    
    // Membership Functions
    let asamKuat = 0,
        asamLemah = 0,
        netral = 0,
        basaLemah = 0,
        basaKuat = 0;
    
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
    
    // Defuzzifikasi
    const crisp = (asamKuat * -1.0 + asamLemah * -0.5 + netral * 0.0 +
        basaLemah * 0.5 + basaKuat * 1.0);
    const sumW = asamKuat + asamLemah + netral + basaLemah + basaKuat;
    
    let finalCrisp = 0;
    if (sumW > 0) finalCrisp = crisp / sumW;
    
    const strength = Math.min(Math.abs(finalCrisp), 1.0);
    
    let action = 'idle';
    if (finalCrisp > 0.08) action = 'dosing-up';
    else if (finalCrisp < -0.08) action = 'dosing-down';
    
    state.fuzzy.strength = strength;
    state.fuzzy.action = action;
    
    console.log(`🧠 Fuzzy | pH: ${ph.toFixed(2)} | error: ${error.toFixed(3)} | action: ${action} | strength: ${(strength * 100).toFixed(0)}%`);
    
    // Execute
    if (state.phMode === 'auto') {
        if (action === 'dosing-up') {
            if (!state.pumps.phUp) {
                publish(TOPICS.controlPhUp, 'ON');
                state.pumps.phUp = true;
            }
            if (state.pumps.phDown) {
                publish(TOPICS.controlPhDown, 'OFF');
                state.pumps.phDown = false;
            }
        } else if (action === 'dosing-down') {
            if (!state.pumps.phDown) {
                publish(TOPICS.controlPhDown, 'ON');
                state.pumps.phDown = true;
            }
            if (state.pumps.phUp) {
                publish(TOPICS.controlPhUp, 'OFF');
                state.pumps.phUp = false;
            }
        } else {
            if (state.pumps.phUp) {
                publish(TOPICS.controlPhUp, 'OFF');
                state.pumps.phUp = false;
            }
            if (state.pumps.phDown) {
                publish(TOPICS.controlPhDown, 'OFF');
                state.pumps.phDown = false;
            }
        }
        renderPumps();
        renderPhPanel();
    }
}

// ==================== PUBLISH ====================
function publish(topic, value) {
    if (!client || !client.connected) {
        toast('⚠️ MQTT tidak terhubung!', 'warning');
        return false;
    }
    try {
        client.publish(topic, value, { qos: 1 });
        console.log('📤', topic, '->', value);
        return true;
    } catch (e) {
        console.error('❌ Publish error:', e);
        return false;
    }
}

// ==================== APPLY PRESET ====================
function applyPreset(key) {
    const p = PLANTS.find(x => x.key === key);
    if (!p) return;
    state.currentPreset = key;
    state.phTarget.min = p.phMin;
    state.phTarget.max = p.phMax;
    
    const msg = JSON.stringify({ phMin: p.phMin, phMax: p.phMax, preset: key });
    publish(TOPICS.controlPreset, msg);
    toast('🌱 Preset ' + p.name + ' (pH ' + p.phMin + '-' + p.phMax + ')', 'success');
    renderPhPanel();
    updateStatus();
}

// ==================== RENDER FUNCTIONS ====================

function updateStatus() {
    const online = state.broker === 'online';
    const status = online ? 'online' : (state.broker === 'connecting' ? 'connecting' : 'offline');
    
    // Sidebar
    if (dom.sidebarDot) dom.sidebarDot.className = 'dot ' + status;
    if (dom.sidebarStatusTitle) dom.sidebarStatusTitle.textContent = online ? 'Terhubung' : (state.broker === 'connecting' ? 'Menghubungkan...' : 'Terputus');
    if (dom.sidebarStatusSub) dom.sidebarStatusSub.textContent = online ? 'MQTT Online' : 'MQTT Offline';
    
    // Header
    if (dom.brokerDot) dom.brokerDot.className = 'pulse-dot ' + status;
    if (dom.brokerStatus) dom.brokerStatus.textContent = online ? 'SYSTEM ONLINE' : (state.broker === 'connecting' ? 'CONNECTING...' : 'SYSTEM OFFLINE');
    if (dom.brokerStatus) dom.brokerStatus.style.color = online ? 'var(--success)' : (state.broker === 'connecting' ? 'var(--warning)' : 'var(--danger)');
    
    // Badges
    if (dom.mqttBadge) {
        dom.mqttBadge.className = 'badge-sm ' + (online ? 'active' : 'inactive');
        dom.mqttBadge.textContent = 'MQTT';
    }
    const espOk = online && state.esp === 'active';
    if (dom.espBadge) {
        dom.espBadge.className = 'badge-sm ' + (espOk ? 'active' : 'inactive');
        dom.espBadge.textContent = 'ESP32';
    }
    
    if (dom.reconnectBtn) {
        dom.reconnectBtn.className = 'btn-reconnect' + (online ? '' : ' danger');
        dom.reconnectBtn.innerHTML = online ? '<i class="fa-solid fa-rotate"></i> Connected' : '<i class="fa-solid fa-rotate"></i> Reconnect';
    }
    
    // Status Air
    const ph = state.values.ph || 0;
    const inRange = ph >= state.phTarget.min && ph <= state.phTarget.max;
    let statusText = 'MENUNGGU',
        icon = 'fa-hourglass-half',
        cls = 'neutral',
        detail = 'Menunggu data...';
    
    if (state.hasData) {
        if (inRange) {
            statusText = 'LAYAK';
            icon = 'fa-check-circle';
            cls = 'good';
            detail = 'Air dalam kondisi baik.';
        } else if (ph < state.phTarget.min) {
            statusText = 'ASAM';
            icon = 'fa-circle-exclamation';
            cls = 'warning';
            detail = 'pH terlalu rendah!';
        } else {
            statusText = 'BASA';
            icon = 'fa-circle-exclamation';
            cls = 'danger';
            detail = 'pH terlalu tinggi!';
        }
    }
    
    if (dom.waterStatus) {
        dom.waterStatus.textContent = statusText;
        dom.waterStatus.className = cls;
    }
    if (dom.statusDetail) dom.statusDetail.textContent = detail;
    if (dom.statusIcon) {
        dom.statusIcon.className = 'status-icon ' + cls;
        dom.statusIcon.innerHTML = '<i class="fa-solid ' + icon + '"></i>';
    }
    if (dom.statusBadge) {
        dom.statusBadge.textContent = statusText;
        dom.statusBadge.className = 'badge ' + (cls === 'good' ? 'active' : '');
    }
    
    // Signal
    if (dom.signalStatus) {
        dom.signalStatus.textContent = online ? '📶 Connected' : '📶 Disconnected';
        dom.signalStatus.style.color = online ? 'var(--success)' : 'var(--danger)';
    }
}

function updateSensor(key, value) {
    const el = document.querySelector(`[data-sensor="${key}"] .val`);
    if (el) {
        const s = SENSORS.find(x => x.key === key);
        el.textContent = value.toFixed(s.dec);
    }
    const badge = document.getElementById('badge_' + key);
    if (badge) {
        const s = SENSORS.find(x => x.key === key);
        const ok = value >= s.idealMin && value <= s.idealMax;
        if (ok) { badge.textContent = 'Normal';
            badge.className = 'badge-param safe'; } else { badge.textContent = 'Warn';
            badge.className = 'badge-param warn'; }
    }
}

function renderSensors() {
    dom.sensorGrid.innerHTML = SENSORS.map(s => `
        <div class="sensor-item" data-sensor="${s.key}">
            <div class="header">
                <span><i class="fa-solid ${s.icon}"></i> ${s.label}</span>
                <span class="badge-param neutral" id="badge_${s.key}">--</span>
            </div>
            <div class="value"><span class="val">--</span> <span class="unit">${s.unit}</span></div>
        </div>
    `).join('');
}

function renderPumps() {
    dom.pumpGrid.innerHTML = PUMPS.map(p => {
        const on = state.pumps[p.key] || false;
        const isPhPump = (p.key === 'phUp' || p.key === 'phDown');
        const disabled = (isPhPump && state.phMode === 'auto') ? 'disabled' : '';
        
        return `
            <div class="pump-item">
                <div class="info">
                    <div class="icon ${on ? 'on' : ''}"><i class="fa-solid ${p.icon}"></i></div>
                    <div>
                        <div class="name">${p.name}</div>
                        <div class="pin">GPIO ${p.pin} ${isPhPump && state.phMode === 'auto' ? '(Auto)' : ''}</div>
                    </div>
                </div>
                <label class="toggle">
                    <input type="checkbox" ${on ? 'checked' : ''} data-pump="${p.key}" ${disabled} />
                    <span class="slider"></span>
                </label>
            </div>
        `;
    }).join('');
    
    dom.pumpGrid.querySelectorAll('[data-pump]').forEach(el => {
        el.addEventListener('change', (e) => {
            const key = e.target.dataset.pump;
            const val = e.target.checked;
            
            if ((key === 'phUp' || key === 'phDown') && state.phMode === 'auto') {
                toast('⚠️ Mode AUTO, pH dikontrol otomatis!', 'warning');
                e.target.checked = state.pumps[key];
                return;
            }
            
            state.pumps[key] = val;
            const pump = PUMPS.find(p => p.key === key);
            if (pump) {
                const t = 'control' + key.charAt(0).toUpperCase() + key.slice(1);
                publish(TOPICS[t], val ? 'ON' : 'OFF');
            }
            renderPumps();
            renderPhPanel();
            const active = Object.values(state.pumps).filter(Boolean).length;
            dom.activePumps.textContent = active;
        });
    });
    
    const active = Object.values(state.pumps).filter(Boolean).length;
    dom.activePumps.textContent = active;
}

function renderPhPanel() {
    const ph = state.values.ph || 0;
    const { min, max } = state.phTarget;
    const inRange = ph >= min && ph <= max;
    const isManual = state.phMode === 'manual';
    const up = state.pumps.phUp;
    const down = state.pumps.phDown;
    const f = state.fuzzy;
    
    const stateCls = inRange ? 'in-range' : ph < min ? 'low' : 'high';
    const stateText = inRange ? 'Dalam rentang' : ph < min ? 'Terlalu asam' : 'Terlalu basa';
    
    const presetOpts = PLANTS.map(p =>
        `<option value="${p.key}" ${state.currentPreset === p.key ? 'selected' : ''}>${p.name} (pH ${p.phMin}-${p.phMax})</option>`
    ).join('');
    
    const current = PLANTS.find(p => p.key === state.currentPreset) || PLANTS[0];
    
    const rangeMin = 3,
        rangeMax = 10;
    const marker = ((ph - rangeMin) / (rangeMax - rangeMin)) * 100;
    const barL = ((min - rangeMin) / (rangeMax - rangeMin)) * 100;
    const barW = ((max - min) / (rangeMax - rangeMin)) * 100;
    
    const modeLabel = isManual ? '🔧 MANUAL' : '🤖 AUTO';
    const modeHint = isManual ?
        'Mode Manual: Anda dapat mengontrol pH Up/Down secara manual.' :
        'Mode Auto: Sistem (Fuzzy Logic) mengatur pH otomatis.';
    
    dom.phPanel.innerHTML = `
        <div class="left">
            <div class="preset-box">
                <label><i class="fa-solid fa-seedling"></i> Preset Tanaman</label>
                <select class="preset-select" id="presetSelect">${presetOpts}</select>
                <div class="preset-info">
                    <span class="emoji">${current.key === 'custom' ? '🎯' : '🌱'}</span>
                    <span class="name">${current.name}</span>
                    <span class="range">Target: ${min.toFixed(1)} - ${max.toFixed(1)}</span>
                    <span class="status-badge ${inRange ? 'ok' : 'adjust'}">${inRange ? '✅ Optimal' : '⚡ Adjust'}</span>
                </div>
            </div>
            
            <div class="ph-readout">
                <span class="val">${ph.toFixed(2)}</span>
                <span class="state ${stateCls}">${stateText}</span>
            </div>
            
            <div>
                <div class="ph-range">
                    <div class="bar" style="left:${Math.max(barL,0)}%;width:${Math.min(barW,100)}%"></div>
                    <div class="marker" style="left:${Math.min(Math.max(marker,0),100)}%"></div>
                </div>
                <div class="ph-range-labels">
                    <span>${rangeMin}</span>
                    <span>Target: ${min.toFixed(1)}-${max.toFixed(1)}</span>
                    <span>${rangeMax}</span>
                </div>
            </div>
            
            <div class="target-box">
                <label><i class="fa-solid fa-pen"></i> Target Manual (override preset)</label>
                <div class="target-row">
                    <input type="number" id="phMin" step="0.1" min="5.5" max="7.0" value="${min.toFixed(1)}" />
                    <span>s/d</span>
                    <input type="number" id="phMax" step="0.1" min="5.5" max="7.0" value="${max.toFixed(1)}" />
                </div>
            </div>
        </div>
        
        <div class="right">
            <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
                <div class="mode-group">
                    <button class="${!isManual ? 'active' : ''}" data-mode="auto">
                        <span class="mode-indicator"></span> Auto (Fuzzy)
                    </button>
                    <button class="${isManual ? 'active' : ''}" data-mode="manual">
                        <span class="mode-indicator"></span> Manual
                    </button>
                </div>
                <span style="font-size:0.7rem;font-weight:700;color:${isManual ? 'var(--warning)' : 'var(--success)'};background:${isManual ? 'var(--warning-bg)' : 'var(--success-bg)'};padding:0.2rem 0.6rem;border-radius:4px;">
                    ${modeLabel}
                </span>
            </div>
            
            <div class="fuzzy-box" style="${isManual ? 'opacity:0.5;' : ''}">
                <div class="title">
                    🧠 Fuzzy Logic 
                    ${isManual ? '(Nonaktif)' : `- ${f.action === 'dosing-up' ? '📈 Naikkan pH' : f.action === 'dosing-down' ? '📉 Turunkan pH' : '⏸️ Idle'}`}
                </div>
                <div class="fuzzy-row">
                    <span class="label">Kekuatan</span>
                    <span class="bar"><span class="fill" style="width:${isManual ? 0 : (f.strength * 100).toFixed(0)}%"></span></span>
                    <span class="pct">${isManual ? '0%' : (f.strength * 100).toFixed(0) + '%'}</span>
                </div>
                <div style="font-size:0.6rem;color:var(--text-muted);margin-top:0.25rem;">
                    Target: ${min.toFixed(1)}-${max.toFixed(1)} | Error: ${(ph - (min+max)/2).toFixed(3)}
                </div>
            </div>
            
            <div class="dose-group">
                <button class="dose-btn ${up ? 'on' : ''}" data-dose="phUp" ${isManual ? '' : 'disabled'}>
                    <i class="fa-solid fa-arrow-up"></i> ${up ? 'Matikan' : 'pH Up'}
                </button>
                <button class="dose-btn ${down ? 'on' : ''}" data-dose="phDown" ${isManual ? '' : 'disabled'}>
                    <i class="fa-solid fa-arrow-down"></i> ${down ? 'Matikan' : 'pH Down'}
                </button>
            </div>
            
            <button class="emergency-btn" id="emergencyOffBtn">
                🛑 MATIKAN SEMUA RELAY
            </button>
            
            <p class="hint">${modeHint}</p>
        </div>
    `;
    
    // ===== EVENTS =====
    
    // Preset Select
    const sel = dom.phPanel.querySelector('#presetSelect');
    if (sel) {
        sel.addEventListener('change', (e) => {
            const key = e.target.value;
            if (key === 'custom') {
                state.currentPreset = 'custom';
                dom.presetBadge.textContent = '🎯 Manual';
                dom.presetBadge.className = 'badge';
                toast('🎯 Mode manual', 'info');
            } else {
                applyPreset(key);
            }
            renderPhPanel();
        });
    }
    
    // Mode buttons
    dom.phPanel.querySelectorAll('[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            console.log('🔄 Mode button clicked:', mode);
            
            state.phMode = mode;
            publish(TOPICS.controlPhMode, mode);
            
            if (mode === 'manual') {
                state.pumps.phUp = false;
                state.pumps.phDown = false;
                publish(TOPICS.controlPhUp, 'OFF');
                publish(TOPICS.controlPhDown, 'OFF');
                dom.presetBadge.textContent = '🔧 Manual';
                dom.presetBadge.className = 'badge';
                toast('🔧 Mode MANUAL', 'warning');
            } else {
                dom.presetBadge.textContent = '🤖 Auto';
                dom.presetBadge.className = 'badge active';
                toast('🤖 Mode AUTO (Fuzzy Logic aktif)', 'success');
                runFuzzyLogic();
            }
            
            renderPhPanel();
            renderPumps();
            updateStatus();
        });
    });
    
    // Dose buttons
    dom.phPanel.querySelectorAll('[data-dose]').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.dose;
            
            if (state.phMode !== 'manual') {
                toast('⚠️ Ganti ke mode manual dulu!', 'warning');
                return;
            }
            
            const next = !state.pumps[key];
            state.pumps.phUp = key === 'phUp' ? next : false;
            state.pumps.phDown = key === 'phDown' ? next : false;
            
            const t = 'control' + key.charAt(0).toUpperCase() + key.slice(1);
            publish(TOPICS[t], next ? 'ON' : 'OFF');
            
            renderPhPanel();
            renderPumps();
        });
    });
    
    // Emergency Off
    const emergencyBtn = dom.phPanel.querySelector('#emergencyOffBtn');
    if (emergencyBtn) {
        emergencyBtn.addEventListener('click', () => {
            if (confirm('⚠️ Yakin ingin mematikan SEMUA relay?')) {
                console.log('🛑 EMERGENCY OFF - Matikan semua relay');
                Object.keys(state.pumps).forEach(key => {
                    state.pumps[key] = false;
                });
                const allPumps = ['aerator', 'sirkulasi', 'phUp', 'phDown', 'nutrisiA', 'nutrisiB'];
                allPumps.forEach(key => {
                    const t = 'control' + key.charAt(0).toUpperCase() + key.slice(1);
                    publish(TOPICS[t], 'OFF');
                });
                toast('🛑 SEMUA RELAY DI MATIKAN!', 'error');
                renderPumps();
                renderPhPanel();
            }
        });
    }
    
    // Manual target
    const minEl = dom.phPanel.querySelector('#phMin');
    const maxEl = dom.phPanel.querySelector('#phMax');
    if (minEl && maxEl) {
        [minEl, maxEl].forEach(el => {
            el.addEventListener('change', () => {
                const mn = parseFloat(minEl.value) || 5.5;
                const mx = parseFloat(maxEl.value) || 6.3;
                state.phTarget = { min: Math.min(mn, mx), max: Math.max(mn, mx) };
                state.currentPreset = 'custom';
                dom.presetBadge.textContent = '🎯 Manual';
                dom.presetBadge.className = 'badge';
                renderPhPanel();
                updateStatus();
            });
        });
    }
}

// ==================== CLOCK ====================
function tick() {
    const now = new Date();
    dom.clock.textContent = now.toLocaleTimeString();
    dom.lastUpdate.textContent = now.toLocaleTimeString();
    
    if (state.broker === 'online') {
        const s = Math.floor((Date.now() - state.startTime) / 1000);
        dom.uptime.textContent =
            String(Math.floor(s / 3600)).padStart(2, '0') + ':' +
            String(Math.floor((s % 3600) / 60)).padStart(2, '0') + ':' +
            String(s % 60).padStart(2, '0');
    }
    dom.pktCount.textContent = state.packets;
}

function updateFooterTime() {
    if (dom.footerTime) {
        dom.footerTime.textContent = new Date().toLocaleString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

// ==================== TOAST ====================
function toast(msg, type = 'info') {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const el = document.createElement('div');
    el.className = 'toast-item ' + type;
    
    let icon = 'ℹ️';
    if (type === 'warning') icon = '⚠️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'info') icon = '📡';
    
    el.innerHTML = `<span class="toast-icon">${icon}</span><span>${msg}</span>`;
    c.appendChild(el);
    
    setTimeout(() => el.remove(), 3500);
}

// ==================== RECONNECT ====================
dom.reconnectBtn.addEventListener('click', () => {
    if (state.broker === 'online') {
        if (client) client.end();
        state.broker = 'offline';
        state.mqttConnected = false;
        updateStatus();
        toast('🔌 Terputus', 'info');
    } else {
        state.attempts = 0;
        brokerIdx = 0;
        dom.connHost.textContent = 'broker.hivemq.com';
        connectMQTT();
    }
});

// ==================== COPY DATA ====================
dom.btnCopyData.addEventListener('click', () => {
    const text = dom.lastMessage.textContent;
    navigator.clipboard.writeText(text).then(() => {
        toast('📋 Data copied to clipboard!', 'success');
    }).catch(() => {
        toast('❌ Failed to copy', 'error');
    });
});

// ==================== INIT RENDER ====================
renderSensors();
renderPumps();
renderPhPanel();
updateStatus();

console.log('✅ Dashboard ready!');
console.log('🌱 Plant Presets:', PLANTS.map(p => p.name).join(', '));
console.log('🔌 6 Relay:', PUMPS.map(p => p.name).join(', '));
console.log('🧠 Fuzzy Logic running in JavaScript!');
console.log('🎯 Mode AUTO = Fuzzy aktif, Mode MANUAL = kontrol manual');
