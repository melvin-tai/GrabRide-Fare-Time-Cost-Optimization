const timeSelect = document.getElementById("timeSelect");
const dateInput = document.getElementById("dateInput");
const predictBtn = document.getElementById("predictBtn");

const resultBox = document.getElementById("resultBox");
const priceRM = document.getElementById("priceRM");
const priceLabel = document.getElementById("priceLabel");
const suggestion = document.getElementById("suggestion");

const seeMoreBtn = document.getElementById("seeMoreBtn");
const moreInfo = document.getElementById("moreInfo");
const extraInfoTable = document.getElementById("extraInfoTable");

function roundToNearest5(date) {
  const ms = 1000 * 60 * 5;
  return new Date(Math.round(date.getTime() / ms) * ms);
}

function generateTimeOptions(start = "06:30", end = "08:00") {
  timeSelect.innerHTML = "";

  let [h, m] = start.split(":").map(Number);
  const endMin = parseInt(end.split(":")[0]) * 60 + parseInt(end.split(":")[1]);

  while (h * 60 + m <= endMin) {
    const t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    timeSelect.appendChild(opt);
    m += 5;
    if (m >= 60) { m = 0; h++; }
  }
}

function autoSelectTime() {
  const now = new Date();
  const rounded = roundToNearest5(now);
  const minutes = rounded.getHours() * 60 + rounded.getMinutes();

  if (minutes >= 390 && minutes <= 480) {
    timeSelect.value =
      String(rounded.getHours()).padStart(2, "0") + ":" +
      String(rounded.getMinutes()).padStart(2, "0");
  }
}

predictBtn.onclick = () => {
  resultBox.classList.remove("hidden");

  priceRM.textContent = "RM 24.30";
  priceLabel.textContent = "Average";
  suggestion.textContent = "Wait until 06:55 AM";
};

seeMoreBtn.onclick = () => {
  moreInfo.classList.toggle("hidden");

  extraInfoTable.innerHTML = `
    <tr><td>Driver ETA</td><td>7 min</td></tr>
    <tr><td>Distance</td><td>21.5 km</td></tr>
    <tr><td>Duration</td><td>34 min</td></tr>
    <tr><td>Route</td><td>LSA_E5</td></tr>
    <tr><td>Weather</td><td>Clear</td></tr>
    <tr><td>Tolls</td><td>No</td></tr>
  `;
};

dateInput.valueAsDate = new Date();
generateTimeOptions();
autoSelectTime();
