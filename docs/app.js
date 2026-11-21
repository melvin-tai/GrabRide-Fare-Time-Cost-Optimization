"use strict";

/* =========================================================
   Configuration
   ========================================================= */

// Booking window the model was trained on (minutes after midnight).
const WINDOW_START = 6 * 60 + 30; // 06:30
const WINDOW_END = 8 * 60;        // 08:00
const STEP = 5;

// Mean absolute error of the random forest on the held-out test set (notebook).
const MODEL_MAE = 6.32;

// Optional forecast server (backend/app.py), e.g. "http://127.0.0.1:8000".
// Leave empty to use the reference forecast below.
// When set, the page calls:  GET {FARE_API}/predict-window?date=YYYY-MM-DD
// and expects JSON:          [{ "time": "06:45", "price": 24.44 }, ...]
const FARE_API = "";

// The trained model's forecast for Thursday 4 Dec 2025 (backend /predict-window).
// 06:45 onwards matches recommend_booking_time("2025-12-04", "06:45") in the notebook.
const REFERENCE_FORECAST = {
  date: "2025-12-04",
  prices: {
    "06:30": 24.30, "06:35": 24.30, "06:40": 24.30,
    "06:45": 24.44, "06:50": 24.63, "06:55": 25.23, "07:00": 26.41,
    "07:05": 26.14, "07:10": 26.04, "07:15": 26.24, "07:20": 26.45,
    "07:25": 26.89, "07:30": 26.44, "07:35": 25.96, "07:40": 25.92,
    "07:45": 26.04, "07:50": 26.09, "07:55": 25.89, "08:00": 25.88,
  },
};

// price_label() thresholds: 33rd / 67th percentiles of the 143 logged fares
// (backend /model-info).
const MODEL_THRESHOLDS = { low: 25.0, high: 42.28 };


/* =========================================================
   Small helpers
   ========================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const pad = (n) => String(n).padStart(2, "0");
const fmtTime = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const rm = (v) => `RM ${v.toFixed(2)}`;

function parseTime(str) {
  const m = /^\s*(\d{1,2}):(\d{2})/.exec(String(str || ""));
  if (!m) return null;
  const h = +m[1], mm = +m[2];
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

function windowSlots() {
  const out = [];
  for (let m = WINDOW_START; m <= WINDOW_END; m += STEP) out.push(m);
  return out;
}

function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseISODate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

function longDate(str) {
  const d = parseISODate(str);
  return d
    ? d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric" })
    : str;
}

function labelFor(price, t) {
  if (price <= t.low) return "Cheap";
  if (price <= t.high) return "Average";
  return "Pricey";
}

function chip(level) {
  return `<span class="chip" data-level="${level}">${level}</span>`;
}

function fillTimeSelect(select, preferred) {
  select.innerHTML = windowSlots()
    .map((m) => `<option value="${m}">${fmtTime(m)}</option>`)
    .join("");
  select.value = String(preferred);
}

// Current time rounded to 5 minutes if it's inside the window, else 06:30.
function defaultReadyTime() {
  const now = new Date();
  const mins = Math.round((now.getHours() * 60 + now.getMinutes()) / STEP) * STEP;
  return mins >= WINDOW_START && mins <= WINDOW_END ? mins : WINDOW_START;
}

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

/* =========================================================
   Recommendation + timeline (shared by both pages)
   ========================================================= */

// slots: [{ min, price|null }]. Returns the cheapest priced slot at or after `ready`.
function pickBest(slots, ready) {
  let best = null;
  for (const s of slots) {
    if (s.price == null || s.min < ready) continue;
    if (!best || s.price < best.price - 1e-9) best = s;
  }
  return best;
}

function slotPosition(min) {
  const count = windowSlots().length;
  const index = (min - WINDOW_START) / STEP;
  return ((index + 0.5) / count) * 100;
}

/**
 * Draws the bar timeline and the readout under it.
 * opts: { slots, ready, best, thresholds, title }
 */
function renderTimeline(root, opts) {
  const { slots, ready, best, thresholds } = opts;
  const priced = slots.filter((s) => s.price != null);
  const lo = Math.min(...priced.map((s) => s.price));
  const hi = Math.max(...priced.map((s) => s.price));
  const BASE = 18; // % height given to the cheapest bar, so it's never invisible
  const heightFor = (p) => (hi - lo < 0.005 ? 60 : BASE + (100 - BASE) * ((p - lo) / (hi - lo)));

  const bars = slots.map((s) => {
    const classes = ["tl-bar"];
    let label;
    if (s.price == null) {
      classes.push("is-empty");
      label = `${fmtTime(s.min)}, no forecast`;
    } else {
      if (s.min < ready) classes.push("is-past");
      if (best && s.min === best.min) classes.push("is-best");
      label = `${fmtTime(s.min)}, ${rm(s.price)}, ${labelFor(s.price, thresholds)}`;
    }
    const h = s.price == null ? 0 : heightFor(s.price);
    return `<button type="button" class="${classes.join(" ")}" data-min="${s.min}" aria-label="${label}">
      <span style="height:${h.toFixed(1)}%"></span></button>`;
  }).join("");

  // A tick every 15 minutes, centred under its slot; the quarter-past ones hide on narrow screens.
  const ticks = [];
  for (let m = WINDOW_START; m <= WINDOW_END; m += 15) {
    const minor = m % 30 !== 0 ? " minor" : "";
    ticks.push(`<span class="tick${minor}" style="left:${slotPosition(m)}%">${fmtTime(m)}</span>`);
  }
  const readyPos = slotPosition(ready) - (50 / slots.length); // left edge of the slot
  const flip = readyPos > 70;

  root.innerHTML = `
    <div class="tl-head">
      <h3>${opts.title}</h3>
      <div class="tl-legend" aria-hidden="true">
        <span><i class="k-best"></i>Cheapest</span>
        <span><i class="k-slot"></i>Other slots</span>
        <span><i class="k-past"></i>Before you're ready</span>
      </div>
    </div>
    <div class="tl-plot">
      <div class="tl-yaxis" aria-hidden="true">
        ${priced.length ? `<span style="bottom:100%">${rm(hi)}</span>` : ""}
        ${priced.length && hi - lo >= 0.005 ? `<span style="bottom:${(BASE + 100) / 2}%">${rm((lo + hi) / 2)}</span>` : ""}
        ${priced.length && hi - lo >= 0.005 ? `<span style="bottom:${BASE}%">${rm(lo)}</span>` : ""}
      </div>
      <div class="tl-area">
        <div class="tl-grid" aria-hidden="true">
          <i style="bottom:100%"></i>
          ${hi - lo >= 0.005 ? `<i style="bottom:${(BASE + 100) / 2}%"></i><i style="bottom:${BASE}%"></i>` : ""}
        </div>
        <div class="tl-bars" role="group" aria-label="Forecast fare for each 5-minute slot">
          ${bars}
          <div class="tl-ready${flip ? " flip" : ""}" style="left:${readyPos}%" aria-hidden="true"><span>Ready ${fmtTime(ready)}</span></div>
        </div>
        <div class="tl-axis" aria-hidden="true">${ticks.join("")}</div>
        <p class="tl-readout" aria-live="polite"></p>
      </div>
    </div>`;

  const readout = $(".tl-readout", root);
  const bySlot = new Map(slots.map((s) => [s.min, s]));

  function show(min) {
    root.querySelectorAll(".tl-bar.is-active").forEach((b) => b.classList.remove("is-active"));
    const s = bySlot.get(min);
    if (!s) { readout.textContent = ""; return; }
    const btn = root.querySelector(`.tl-bar[data-min="${min}"]`);
    if (btn) btn.classList.add("is-active");
    if (s.price == null) {
      readout.innerHTML = `<strong>${fmtTime(min)}</strong><span class="delta">No forecast for this slot</span>`;
      return;
    }
    let delta = "";
    if (best && s.min !== best.min) {
      const d = s.price - best.price;
      delta = Math.abs(d) < 0.005
        ? `Same as ${fmtTime(best.min)}`
        : `${rm(Math.abs(d))} ${d > 0 ? "more" : "less"} than ${fmtTime(best.min)}`;
      if (s.min < ready) delta += ", but before you're ready";
    } else if (best) {
      delta = "Cheapest slot once you're ready";
    }
    readout.innerHTML = `<strong>${fmtTime(min)}</strong><span>${rm(s.price)}</span>${chip(labelFor(s.price, thresholds))}<span class="delta">${delta}</span>`;
  }

  const resting = best ? best.min : ready;
  show(resting);

  const barsEl = $(".tl-bars", root);
  barsEl.addEventListener("pointerover", (e) => {
    const b = e.target.closest(".tl-bar");
    if (b) show(+b.dataset.min);
  });
  barsEl.addEventListener("pointerleave", () => show(resting));
  barsEl.addEventListener("focusin", (e) => {
    const b = e.target.closest(".tl-bar");
    if (b) show(+b.dataset.min);
  });
  barsEl.addEventListener("focusout", (e) => {
    if (!barsEl.contains(e.relatedTarget)) show(resting);
  });
  barsEl.addEventListener("click", (e) => {
    const b = e.target.closest(".tl-bar");
    if (b) show(+b.dataset.min);
  });
}

function renderSlotTable(table, { slots, ready, best, thresholds }) {
  const rows = slots.map((s) => {
    const cls = [best && s.min === best.min ? "is-best" : "", s.min < ready ? "is-past" : ""].join(" ").trim();
    if (s.price == null) {
      return `<tr class="${cls}"><td>${fmtTime(s.min)}</td><td class="num">No forecast</td><td></td><td class="num"></td></tr>`;
    }
    const diff = best ? s.price - best.price : 0;
    const vs = !best ? "" : Math.abs(diff) < 0.005 ? "Cheapest" : `+${rm(diff)}`;
    return `<tr class="${cls}"><td>${fmtTime(s.min)}${s.min < ready ? " (before ready)" : ""}</td>
      <td class="num">${rm(s.price)}</td><td>${labelFor(s.price, thresholds)}</td><td class="num">${vs}</td></tr>`;
  }).join("");
  table.innerHTML = `<thead><tr><th scope="col">Time</th><th scope="col" class="num">Forecast fare</th>
    <th scope="col">Price level</th><th scope="col" class="num">Compared with cheapest</th></tr></thead><tbody>${rows}</tbody>`;
}

/**
 * Fills the big answer block.
 * extra: { caveat?: (savings) => string, firstPricedNote?: string }
 */
function renderAnswer({ slots, ready, best, thresholds, margin, caveat, emptyTitle, emptyNote }) {
  const answer = $("#answer");
  const time = $("#answerTime");
  const kicker = $("#answerKicker");
  const fare = $("#answerFare");
  const note = $("#answerNote");
  const extra = $("#answerCaveat");

  if (!best) {
    answer.classList.add("is-empty");
    kicker.textContent = "";
    time.textContent = emptyTitle;
    fare.innerHTML = "";
    note.textContent = emptyNote;
    extra.textContent = "";
    return;
  }

  answer.classList.remove("is-empty");
  kicker.textContent = "Book at";
  time.textContent = fmtTime(best.min);
  fare.innerHTML = `<span class="fare">${rm(best.price)}</span>`
    + (margin ? `<span class="error-margin">± ${rm(margin)} typical error</span>` : "")
    + chip(labelFor(best.price, thresholds));

  const readySlot = slots.find((s) => s.min === ready);
  extra.textContent = "";
  if (best.min === ready) {
    note.textContent = "Book now. Every later slot until 08:00 is forecast to cost the same or more.";
  } else if (readySlot && readySlot.price != null) {
    const saving = readySlot.price - best.price;
    note.textContent = `Waiting until ${fmtTime(best.min)} instead of booking at ${fmtTime(ready)} saves about ${rm(saving)}.`;
    if (caveat) extra.textContent = caveat(saving);
  } else {
    note.textContent = `There's no forecast for ${fmtTime(ready)}. ${fmtTime(best.min)} is the cheapest slot after that, up to 08:00.`;
  }
}

/* =========================================================
   Page: Forecast (index.html)
   ========================================================= */

async function loadModelForecast(dateStr) {
  if (FARE_API) {
    try {
      const res = await fetch(`${FARE_API.replace(/\/$/, "")}/predict-window?date=${encodeURIComponent(dateStr)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      const prices = {};
      rows.forEach((r) => { prices[r.time] = Number(r.price); });
      return { source: "api", prices };
    } catch (err) {
      return { source: "reference", prices: REFERENCE_FORECAST.prices, failed: true };
    }
  }
  return { source: "reference", prices: REFERENCE_FORECAST.prices };
}

function initForecastPage() {
  const dateInput = $("#dateInput");
  const timeSelect = $("#timeSelect");
  const timeline = $("#timeline");
  const sourceNote = $("#sourceNote");
  const slotTable = $("#slotTable");

  dateInput.value = toISODate(new Date());
  fillTimeSelect(timeSelect, defaultReadyTime());

  let requestId = 0;

  async function update() {
    const id = ++requestId;
    const dateStr = dateInput.value || toISODate(new Date());
    const ready = +timeSelect.value;
    const forecast = await loadModelForecast(dateStr);
    if (id !== requestId) return; // a newer update started

    const slots = windowSlots().map((min) => {
      const p = forecast.prices[fmtTime(min)];
      return { min, price: typeof p === "number" && !Number.isNaN(p) ? p : null };
    });
    const best = pickBest(slots, ready);
    const view = { slots, ready, best, thresholds: MODEL_THRESHOLDS };

    renderAnswer({
      ...view,
      margin: MODEL_MAE,
      caveat: (saving) => saving < MODEL_MAE
        ? `That's less than the model's typical error of ${rm(MODEL_MAE)}, so treat the two times as a near tie.`
        : "",
      emptyTitle: "No Forecast Left",
      emptyNote: `There are no forecast slots between ${fmtTime(ready)} and 08:00. Pick an earlier time.`,
    });

    renderTimeline(timeline, {
      ...view,
      title: "Forecast Fare By Time",
    });
    renderSlotTable(slotTable, view);

    if (forecast.source === "api") {
      sourceNote.textContent = `Forecast for ${longDate(dateStr)} from the live model.`;
    } else {
      const prefix = forecast.failed ? "The forecast server didn't respond, so this" : "This";
      sourceNote.textContent = `${prefix} is the notebook model's forecast for ${longDate(REFERENCE_FORECAST.date)}. `
        + "It shows how fares move with the time of day; date-specific forecasts need the model server.";
    }
  }

  dateInput.addEventListener("change", update);
  timeSelect.addEventListener("change", update);
  update();
}

/* =========================================================
   Page: Your rides (user-data.html)
   ========================================================= */

const RIDES_KEY = "grabride-fare-optimizer.rides.v1";

// Notebook CSV columns, in order, mapped to the fields used here.
const COLUMNS = [
  { key: "date", csv: "date" },
  { key: "time", csv: "time" },
  { key: "fare", csv: "fare_standard_RM" },
  { key: "eta", csv: "driver_est_min" },
  { key: "distance", csv: "distance_km" },
  { key: "duration", csv: "duration_min" },
  { key: "route", csv: "fastest_route" },
  { key: "weather", csv: "weather" },
  { key: "navDistance", csv: "imap_distance_km" },
  { key: "navDuration", csv: "imap_duration_min" },
  { key: "tolls", csv: "tolls_true_false" },
];

// First five rows of GrabRide_Data.csv, as shown in the notebook.
const EXAMPLE_RIDES = [
  ["2025-11-24", "06:30", 48, 8, 16.8, 24],
  ["2025-11-24", "06:35", 50, 7, 16.8, 26],
  ["2025-11-24", "06:40", 51, 9, 16.8, 28],
  ["2025-11-24", "06:45", 51, 8, 16.8, 31],
  ["2025-11-24", "06:50", 51, 9, 16.8, 32],
].map(([date, time, fare, eta, distance, duration]) => ({
  date, time, fare: String(fare), eta: String(eta), distance: String(distance), duration: String(duration),
  route: "LBP_E10", weather: "Rainy", navDistance: "", navDuration: "", tolls: "",
}));

const blankRide = () => Object.fromEntries(COLUMNS.map((c) => [c.key, ""]));

function normaliseDate(raw) {
  const s = String(raw || "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); // m/d/Y, as in the notebook
  if (m) return `${m[3]}-${pad(+m[1])}-${pad(+m[2])}`;
  return "";
}

function normaliseTime(raw) {
  const min = parseTime(raw);
  return min == null ? "" : fmtTime(min);
}

function normaliseTolls(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (["1", "1.0", "true", "yes"].includes(s)) return "1";
  if (["0", "0.0", "false", "no"].includes(s)) return "0";
  return "";
}

function normaliseWeather(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s.startsWith("rain")) return "Rainy";
  if (s.startsWith("clear")) return "Clear";
  return "";
}

// A ride the forecast can use: needs date, time and a positive fare.
function usableRide(r) {
  const min = parseTime(r.time);
  const fare = parseFloat(r.fare);
  const date = parseISODate(r.date);
  if (min == null || !date || !(fare > 0)) return null;
  return { min, fare, weekday: date.getDay(), weather: r.weather };
}

function quantile(sorted, q) {
  // Linear interpolation, matching pandas' default.
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const BANDWIDTH = 12;       // minutes; how quickly a ride's influence fades
const MIN_WEIGHT = 0.12;    // below this a slot has no ride within ~25 minutes
const OTHER_DAY_WEIGHT = 0.35;

function forecastFromRides(rides, { day, weather }) {
  let pool = rides;
  if (weather !== "any") pool = pool.filter((r) => r.weather === weather);
  return windowSlots().map((min) => {
    let sw = 0, swf = 0;
    for (const r of pool) {
      const dt = (r.min - min) / BANDWIDTH;
      let w = Math.exp(-0.5 * dt * dt);
      if (day !== "any" && r.weekday !== +day) w *= OTHER_DAY_WEIGHT;
      sw += w; swf += w * r.fare;
    }
    // Coverage is judged on time distance alone, so a day preference never blanks a slot.
    const nearest = pool.reduce((m, r) => Math.min(m, Math.abs(r.min - min)), Infinity);
    const covered = Math.exp(-0.5 * (nearest / BANDWIDTH) ** 2) >= MIN_WEIGHT;
    return { min, price: covered && sw > 0 ? swf / sw : null };
  });
}

function parseCSV(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!lines.length) return { error: "That file is empty." };
  const split = (line) => line.split(",").map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const index = {};
  COLUMNS.forEach((c) => { index[c.key] = header.indexOf(c.csv.toLowerCase()); });
  if (index.date < 0 || index.time < 0 || index.fare < 0) {
    return { error: "Couldn't find the date, time and fare_standard_RM columns. Use the same headers as the notebook's GrabRide_Data.csv." };
  }
  const rides = lines.slice(1).map((line) => {
    const cells = split(line);
    const get = (k) => (index[k] >= 0 ? cells[index[k]] ?? "" : "");
    const clean = (v) => (/^nan$/i.test(v) ? "" : v);
    return {
      date: normaliseDate(get("date")),
      time: normaliseTime(get("time")),
      fare: clean(get("fare")),
      eta: clean(get("eta")),
      distance: clean(get("distance")),
      duration: clean(get("duration")),
      route: clean(get("route")),
      weather: normaliseWeather(get("weather")),
      navDistance: clean(get("navDistance")),
      navDuration: clean(get("navDuration")),
      tolls: normaliseTolls(clean(get("tolls"))),
    };
  });
  return { rides };
}

function toCSV(rides) {
  const esc = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v);
  const header = COLUMNS.map((c) => c.csv).join(",");
  const rows = rides.map((r) => COLUMNS.map((c) => {
    let v = r[c.key] ?? "";
    if (c.key === "date" && v) {
      const [y, m, d] = v.split("-");
      v = `${+m}/${+d}/${y}`; // notebook format: %m/%d/%Y
    }
    if (c.key === "time" && v) {
      const [h, mm] = v.split(":");
      v = `${+h}:${mm}`; // notebook format: H:MM
    }
    return esc(String(v));
  }).join(","));
  return [header, ...rows].join("\n") + "\n";
}

function initRidesPage() {
  const body = $("#rideBody");
  const table = $("#rideTable");
  const empty = $("#emptyState");
  const status = $("#status");
  const clearBtn = $("#clearBtn");
  const daySelect = $("#daySelect");
  const weatherSelect = $("#weatherSelect");
  const timeSelect = $("#timeSelect");
  const fileInput = $("#importFile");

  let rides = store.get(RIDES_KEY, []);
  if (!Array.isArray(rides)) rides = [];

  fillTimeSelect(timeSelect, defaultReadyTime());

  function say(msg, isError = false) {
    status.textContent = msg;
    status.classList.toggle("is-error", isError);
  }

  function save() { store.set(RIDES_KEY, rides); }

  const cell = {
    date: (v) => `<input type="date" data-k="date" value="${v}" aria-label="Date">`,
    time: (v) => `<input type="time" step="300" data-k="time" value="${v}" aria-label="Time">`,
    fare: (v) => `<input type="number" inputmode="decimal" min="0" step="0.01" data-k="fare" value="${v}" aria-label="Fare in RM" placeholder="0.00">`,
    eta: (v) => `<input type="number" inputmode="numeric" min="0" data-k="eta" value="${v}" aria-label="Driver arrives in, minutes">`,
    distance: (v) => `<input type="number" inputmode="decimal" min="0" step="0.1" data-k="distance" value="${v}" aria-label="Distance in km">`,
    duration: (v) => `<input type="number" inputmode="numeric" min="0" data-k="duration" value="${v}" aria-label="Duration in minutes">`,
    route: (v) => `<input type="text" list="routeList" data-k="route" value="${escapeAttr(v)}" aria-label="Fastest route" placeholder="LSA_E5">`,
    weather: (v) => `<select data-k="weather" aria-label="Weather">
        <option value=""${v === "" ? " selected" : ""}>Not noted</option>
        <option value="Clear"${v === "Clear" ? " selected" : ""}>Clear</option>
        <option value="Rainy"${v === "Rainy" ? " selected" : ""}>Rainy</option></select>`,
    navDistance: (v) => `<input type="number" inputmode="decimal" min="0" step="0.1" data-k="navDistance" value="${v}" aria-label="Navigation app distance in km">`,
    navDuration: (v) => `<input type="number" inputmode="numeric" min="0" data-k="navDuration" value="${v}" aria-label="Navigation app duration in minutes">`,
    tolls: (v) => `<select data-k="tolls" aria-label="Tolls">
        <option value=""${v === "" ? " selected" : ""}>Not noted</option>
        <option value="0"${v === "0" ? " selected" : ""}>No</option>
        <option value="1"${v === "1" ? " selected" : ""}>Yes</option></select>`,
  };

  function escapeAttr(v) {
    return String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function renderTable() {
    body.innerHTML = rides.map((r, i) => `<tr data-i="${i}">
      ${COLUMNS.map((c) => `<td>${cell[c.key](c.key === "route" ? r[c.key] : escapeAttr(r[c.key]))}</td>`).join("")}
      <td><button type="button" class="remove" data-remove="${i}" aria-label="Remove ride ${i + 1}">Remove</button></td>
    </tr>`).join("");
    const none = rides.length === 0;
    table.hidden = none;
    empty.hidden = !none;
    clearBtn.hidden = none;
  }

  function updateForecast() {
    const usable = rides.map(usableRide).filter(Boolean);
    const inWindow = usable.filter((r) => r.min >= WINDOW_START - 15 && r.min <= WINDOW_END + 15);
    const ready = +timeSelect.value;
    const day = daySelect.value;
    const weather = weatherSelect.value;
    const timeline = $("#timeline");
    const slotTable = $("#slotTable");
    const sourceNote = $("#sourceNote");

    const pool = weather === "any" ? inWindow : inWindow.filter((r) => r.weather === weather);

    if (inWindow.length < 3 || pool.length === 0) {
      const needed = 3 - inWindow.length;
      renderAnswer({
        slots: [], ready, best: null, thresholds: MODEL_THRESHOLDS,
        emptyTitle: inWindow.length < 3 ? "Not Enough Rides Yet" : `No ${weather} Rides`,
        emptyNote: inWindow.length < 3
          ? `Add ${needed} more ride${needed === 1 ? "" : "s"} with a date, a time between 06:30 and 08:00, and a fare.`
          : `None of your rides are marked ${weather.toLowerCase()}. Pick "Any weather" or log the weather on some rides.`,
      });
      timeline.innerHTML = "";
      slotTable.innerHTML = "";
      sourceNote.textContent = usable.length > inWindow.length
        ? `${usable.length - inWindow.length} ride${usable.length - inWindow.length === 1 ? " is" : "s are"} outside the 06:30 to 08:00 window and not used.`
        : "";
      return;
    }

    const fares = inWindow.map((r) => r.fare).sort((a, b) => a - b);
    const thresholds = { low: quantile(fares, 0.33), high: quantile(fares, 0.67) };
    const slots = forecastFromRides(inWindow, { day, weather });
    const best = pickBest(slots, ready);
    const view = { slots, ready, best, thresholds };

    renderAnswer({
      ...view,
      caveat: () => "",
      emptyTitle: "No Forecast Left",
      emptyNote: `None of your rides were logged near ${fmtTime(ready)} or later. Pick an earlier time or log rides later in the morning.`,
    });

    if (slots.some((s) => s.price != null)) {
      renderTimeline(timeline, {
        ...view,
        title: "Your Forecast By Time",
      });
      renderSlotTable(slotTable, view);
    } else {
      timeline.innerHTML = "";
      slotTable.innerHTML = "";
    }

    const parts = [`Based on ${pool.length} of your ride${pool.length === 1 ? "" : "s"}`];
    if (weather !== "any") parts[0] += ` marked ${weather.toLowerCase()}`;
    parts[0] += ".";
    parts.push(`Cheap means ${rm(thresholds.low)} or less; pricey means over ${rm(thresholds.high)}.`);
    const gaps = slots.filter((s) => s.price == null).length;
    if (gaps) parts.push(`${gaps} slot${gaps === 1 ? " has" : "s have"} no ride nearby, so ${gaps === 1 ? "it's" : "they're"} left blank.`);
    if (pool.length < 10) parts.push("With fewer than 10 rides, treat this as a rough guide.");
    sourceNote.textContent = parts.join(" ");
  }

  let timer;
  function scheduleForecast() {
    clearTimeout(timer);
    timer = setTimeout(updateForecast, 200);
  }

  body.addEventListener("input", (e) => {
    const field = e.target.closest("[data-k]");
    if (!field) return;
    const i = +field.closest("tr").dataset.i;
    rides[i][field.dataset.k] = field.value;
    if (field.dataset.k === "fare") {
      field.setAttribute("aria-invalid", field.value !== "" && !(parseFloat(field.value) > 0) ? "true" : "false");
    }
    save();
    scheduleForecast();
  });
  body.addEventListener("change", (e) => {
    if (e.target.matches("select[data-k]")) {
      const i = +e.target.closest("tr").dataset.i;
      rides[i][e.target.dataset.k] = e.target.value;
      save();
      scheduleForecast();
    }
  });

  body.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    const i = +btn.dataset.remove;
    rides.splice(i, 1);
    save();
    renderTable();
    updateForecast();
    say(`Removed ride ${i + 1}.`);
    const next = body.querySelector(`[data-remove="${Math.min(i, rides.length - 1)}"]`);
    (next || $("#addRide")).focus();
  });

  $("#addRide").addEventListener("click", () => {
    const last = rides[rides.length - 1];
    const ride = blankRide();
    // Carry the date over and step the time by 5 minutes, since fares are usually logged in a run.
    if (last) {
      ride.date = last.date;
      const min = parseTime(last.time);
      if (min != null) ride.time = fmtTime(Math.min(min + STEP, 23 * 60 + 55));
      ride.route = last.route;
      ride.weather = last.weather;
    } else {
      ride.date = toISODate(new Date());
      ride.time = fmtTime(defaultReadyTime());
    }
    rides.push(ride);
    save();
    renderTable();
    updateForecast();
    const fare = body.querySelector(`tr[data-i="${rides.length - 1}"] [data-k="fare"]`);
    if (fare) fare.focus();
    say("Added a ride. Enter the fare you saw.");
  });

  $("#loadExample").addEventListener("click", () => {
    rides = EXAMPLE_RIDES.map((r) => ({ ...r }));
    save();
    renderTable();
    updateForecast();
    say("Loaded 5 rides from the notebook's dataset (a rainy Monday). Add more to cover the rest of the morning.");
  });

  $("#importBtn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    const result = parseCSV(await file.text());
    if (result.error) { say(result.error, true); return; }
    rides = rides.concat(result.rides);
    save();
    renderTable();
    updateForecast();
    const skipped = result.rides.filter((r) => !usableRide(r)).length;
    say(`Imported ${result.rides.length} ride${result.rides.length === 1 ? "" : "s"} from ${file.name}.`
      + (skipped ? ` ${skipped} ${skipped === 1 ? "is" : "are"} missing a date, time or fare.` : ""));
  });

  $("#exportBtn").addEventListener("click", () => {
    if (!rides.length) { say("There are no rides to export yet.", true); return; }
    const blob = new Blob([toCSV(rides)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "GrabRide_Data.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    say(`Exported ${rides.length} ride${rides.length === 1 ? "" : "s"} as GrabRide_Data.csv.`);
  });

  clearBtn.addEventListener("click", () => {
    if (!confirm(`Clear all ${rides.length} rides from this browser? Export them first if you want a copy.`)) return;
    rides = [];
    save();
    renderTable();
    updateForecast();
    say("Cleared all rides.");
  });

  [daySelect, weatherSelect, timeSelect].forEach((el) => el.addEventListener("change", updateForecast));

  renderTable();
  updateForecast();
}

/* =========================================================
   Boot
   ========================================================= */

const page = document.body.dataset.page;
if (page === "forecast") initForecastPage();
if (page === "rides") initRidesPage();
