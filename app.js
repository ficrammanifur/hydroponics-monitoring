/* ==========================================================================
   Hidroponik NFT — Dashboard logic (vanilla JS)
   Simulasi data sensor + status broker/ESP32 + kontrol pH fuzzy.
   Ganti blok SIMULASI dengan klien MQTT (mqtt.js over WSS) untuk data nyata.
   ========================================================================== */

// -------------------------------------------------------------------------
// KONFIGURASI SENSOR
// -------------------------------------------------------------------------
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

// -------------------------------------------------------------------------
// KONFIGURASI POMPA (sesuai pin GPIO firmware ESP32)
// -------------------------------------------------------------------------
const PUMPS = [
  { key: "aerator", name: "Aerator", pin: 12, group: "Aerasi", topic: "hidroponik/pompa/aerator" },
  { key: "sirkulasi1", name: "Sirkulasi 1", pin: 13, group: "Sirkulasi", topic: "hidroponik/pompa/sirkulasi_1" },
  { key: "sirkulasi2", name: "Sirkulasi 2", pin: 11, group: "Sirkulasi", topic: "hidroponik/pompa/sirkulasi_2" },
  { key: "nutrisiA", name: "Nutrisi A", pin: 14, group: "Dosis Nutrisi", topic: "hidroponik/pompa/nutrisi_a" },
  { key: "nutrisiB", name: "Nutrisi B", pin: 17, group: "Dosis Nutrisi", topic: "hidroponik/pompa/nutrisi_b" },
];
const PUMP_GROUP_ORDER = ["Aerasi", "Sirkulasi", "Dosis Nutrisi"];

// -------------------------------------------------------------------------
// PRESET TANAMAN (dari tabel budidaya hidroponik)
// -------------------------------------------------------------------------
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

// -------------------------------------------------------------------------
// STATE
// -------------------------------------------------------------------------
const HISTORY_LEN = 40;
const state = {
  values: { tds: 1000, temp: 24, ph: 6.0 },
  history: { tds: [], temp: [], ph: [] },
  pumps: { aerator: true, sirkulasi1: true, sirkulasi2: false, nutrisiA: false, nutrisiB: false, phUp: false, phDown: false },
  phMode: "auto", // "auto" | "manual"
  phTarget: { min: 5.8, max: 6.3 },
  preset: "custom",
  fuzzy: { asamKuat: 0, asamLemah: 0, netral: 0, basaLemah: 0, basaKuat: 0, action: "idle", strength: 0 },
  broker: "connecting", // "connecting" | "online" | "offline"
  esp: "waiting", // "waiting" | "active" | "inactive"
  lastPacket: 0,
  packets: 0,
  startTime: Date.now(),
};

// seed flat history
SENSORS.forEach((s) => {
  state.history[s.key] = Array.from({ length: HISTORY_LEN }, () => state.values[s.key]);
});

// =========================================================================
// FUZZY LOGIC — kendali pH
// Input  : error = pH terukur - pH target tengah
// Fuzzy sets (segitiga/trapesium) mengelompokkan kondisi larutan:
//   Asam Kuat | Asam Lemah | Netral | Basa Lemah | Basa Kuat
// Rules  : defuzzifikasi (weighted average) -> aksi & kekuatan dosing
// =========================================================================
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
  const e = ph - center; // error: negatif = terlalu asam, positif = terlalu basa

  // Derajat keanggotaan tiap himpunan fuzzy (satuan pH)
  const asamKuat = shoulderLeft(e, -1.0, -0.5);
  const asamLemah = triangle(e, -0.7, -0.3, -0.05);
  const netral = triangle(e, -0.15, 0, 0.15);
  const basaLemah = triangle(e, 0.05, 0.3, 0.7);
  const basaKuat = shoulderRight(e, 0.5, 1.0);

  // Basis aturan (Sugeno sederhana): tiap himpunan -> nilai keluaran
  //   + = perlu NAIKKAN pH (pompa pH Up / KOH)
  //   - = perlu TURUNKAN pH (pompa pH Down / asam)
  const rules = [
    { w: asamKuat, out: 1.0 },   // sangat asam  -> naikkan kuat
    { w: asamLemah, out: 0.5 },  // agak asam    -> naikkan lembut
    { w: netral, out: 0.0 },     // pas          -> diam
    { w: basaLemah, out: -0.5 }, // agak basa    -> turunkan lembut
    { w: basaKuat, out: -1.0 },  // sangat basa  -> turunkan kuat
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

// -------------------------------------------------------------------------
// STATUS SENSOR
// -------------------------------------------------------------------------
function sensorStatus(cfg, v) {
  if (v < cfg.idealMin || v > cfg.idealMax) {
    const span = cfg.idealMax - cfg.idealMin;
    const dist = v < cfg.idealMin ? cfg.idealMin - v : v - cfg.idealMax;
    return dist > span * 0.35 ? "crit" : "warn";
  }
  return "ok";
}
const STATUS_TEXT = { ok: "Ideal", warn: "Perhatian", crit: "Kritis" };

// =========================================================================
// RENDER — SENSOR CARDS
// =========================================================================
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
    const v = state.values[s.key];
    const st = sensorStatus(s, v);
    const data = state.history[s.key];
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

// =========================================================================
// RENDER — pH PANEL
// =========================================================================
function renderPhPanel() {
  const panel = document.getElementById("phPanel");
  const ph = state.values.ph;
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

function clamp(v, a, b) {
  if (isNaN(v)) return a;
  return Math.max(a, Math.min(b, v));
}

// =========================================================================
// RENDER — PUMPS
// =========================================================================
function renderPumps() {
  const container = document.getElementById("pumpGroups");
  container.innerHTML = PUMP_GROUP_ORDER.map((group) => {
    const rows = PUMPS.filter((p) => p.group === group)
      .map((p) => {
        const on = state.pumps[p.key];
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

// =========================================================================
// ACTIONS
// =========================================================================
function togglePump(key, val) {
  state.pumps[key] = val;
  publish(PUMPS.find((p) => p.key === key)?.topic, val ? "ON" : "OFF");
  renderPumps();
}
function setPhMode(mode) {
  state.phMode = mode;
  if (mode === "manual") {
    state.pumps.phUp = false;
    state.pumps.phDown = false;
  }
  renderPhPanel();
}
function togglePhManual(pump) {
  const next = !state.pumps[pump];
  state.pumps.phUp = pump === "phUp" ? next : false;
  state.pumps.phDown = pump === "phDown" ? next : false;
  publish("hidroponik/pompa/" + pump, next ? "ON" : "OFF");
  renderPhPanel();
}
function applyPreset(key) {
  state.preset = key;
  const p = PLANT_PRESETS.find((x) => x.key === key);
  if (p) state.phTarget = { min: p.phMin, max: p.phMax };
  renderPhPanel();
}

// Placeholder publish -> ganti dengan client.publish() MQTT sungguhan
function publish(topic, payload) {
  if (!topic) return;
  console.log("[v0] publish", topic, payload);
}

// =========================================================================
// STATUS BROKER & ESP32
// =========================================================================
function renderConnStatus() {
  const bDot = document.getElementById("brokerDot");
  const bTxt = document.getElementById("brokerStatus");
  const eDot = document.getElementById("espDot");
  const eTxt = document.getElementById("espStatus");
  const reBtn = document.getElementById("reconnectBtn");

  bDot.className = "dot " + (state.broker === "online" ? "online" : state.broker === "connecting" ? "connecting" : "offline");
  bTxt.textContent = state.broker === "online" ? "Terhubung" : state.broker === "connecting" ? "Menghubungkan…" : "Terputus";

  const espOk = state.broker === "online" && state.esp === "active";
  eDot.className = "dot " + (espOk ? "online" : state.esp === "waiting" ? "connecting" : "offline");
  eTxt.textContent = !state.broker || state.broker !== "online" ? "Tidak ada sinyal" : espOk ? "Aktif" : state.esp === "waiting" ? "Menunggu…" : "Tidak aktif";

  reBtn.textContent = state.broker === "online" ? "Putuskan Koneksi" : "Sambungkan Ulang";
  reBtn.classList.toggle("reconnect", state.broker !== "online");

  document.body.classList.toggle("offline", state.broker !== "online");
}

function connectBroker() {
  state.broker = "connecting";
  state.esp = "waiting";
  renderConnStatus();
  // Simulasi handshake TLS ke broker EMQX
  setTimeout(() => {
    state.broker = "online";
    state.startTime = Date.now();
    renderConnStatus();
  }, 1400);
}
function disconnectBroker() {
  state.broker = "offline";
  state.esp = "inactive";
  renderConnStatus();
}

// =========================================================================
// LOOP SIMULASI  (mensimulasikan publish sensor tiap 2 dtk dari ESP32)
// Ganti dengan handler pesan MQTT: client.on('message', ...)
// =========================================================================
const INITIAL = { tds: 1000, temp: 24, ph: 6.0 };
const STEP = { tds: 18, temp: 0.15, ph: 0.05 };

function tick() {
  if (state.broker !== "online") return;

  // ESP32 dianggap aktif jika broker online (di dunia nyata: cek heartbeat/LWT)
  state.esp = "active";
  state.lastPacket = Date.now();
  state.packets += 1;

  // 1) Tentukan aksi pH
  const ph = state.values.ph;
  const { min, max } = state.phTarget;
  const fuzzy = fuzzyPhController(ph, min, max);
  state.fuzzy = fuzzy;

  let action;
  if (state.phMode === "auto") {
    action = fuzzy.action;
    state.pumps.phUp = action === "dosing-up";
    state.pumps.phDown = action === "dosing-down";
  } else {
    action = state.pumps.phUp ? "dosing-up" : state.pumps.phDown ? "dosing-down" : "idle";
  }

  // 2) Perbarui pembacaan sensor
  SENSORS.forEach((s) => {
    const noise = (Math.random() - 0.5) * STEP[s.key] * 2;
    if (s.key === "ph") {
      // kekuatan dosis dari fuzzy mempengaruhi laju perubahan pH
      const strength = state.phMode === "auto" ? fuzzy.strength : 1;
      const dose = action === "dosing-up" ? 0.09 * strength : action === "dosing-down" ? -0.09 * strength : 0;
      const naturalDrift = 0.012; // pH cenderung naik perlahan
      let v = ph + dose + naturalDrift + noise * 0.4;
      state.values.ph = clampSensor(s, v);
    } else {
      const drift = (INITIAL[s.key] - state.values[s.key]) * 0.05;
      let v = state.values[s.key] + drift + noise;
      state.values[s.key] = clampSensor(s, v);
    }
    state.history[s.key] = state.history[s.key].slice(1).concat(state.values[s.key]);
  });

  renderSensors();
  renderPhPanel();
  renderPumps();
  renderConnStatus();
}
function clampSensor(s, v) {
  return Math.max(s.scaleMin, Math.min(s.scaleMax, v));
}

// =========================================================================
// CLOCK & UPTIME
// =========================================================================
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

// =========================================================================
// INIT
// =========================================================================
document.getElementById("reconnectBtn").addEventListener("click", () => {
  state.broker === "online" ? disconnectBroker() : connectBroker();
});

renderSensors();
renderPhPanel();
renderPumps();
renderConnStatus();
connectBroker();

setInterval(tick, 2000);
setInterval(tickClock, 1000);
tickClock();
