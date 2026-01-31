function roundToNearest5(date) {
  const ms = 1000 * 60 * 5;
  return new Date(Math.round(date.getTime() / ms) * ms);
}

function generateTimeOptions(select, start="06:30", end="08:00") {
  select.innerHTML = "";
  let [h, m] = start.split(":").map(Number);
  const endMin = parseInt(end.split(":")[0]) * 60 + parseInt(end.split(":")[1]);

  while (h * 60 + m <= endMin) {
    const t = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    select.appendChild(opt);
    m += 5;
    if (m >= 60) { m = 0; h++; }
  }
}

const timeSelect = document.getElementById("timeSelect");
const dateInput = document.getElementById("dateInput");
const predictBtn = document.getElementById("predictBtn");

if (timeSelect) {
  dateInput.valueAsDate = new Date();
  generateTimeOptions(timeSelect);

  const now = roundToNearest5(new Date());
  const mins = now.getHours()*60 + now.getMinutes();
  if (mins >= 390 && mins <= 480) {
    timeSelect.value =
      `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  }

  predictBtn.onclick = () => {
    document.getElementById("resultBox").classList.remove("hidden");
    document.getElementById("priceRM").textContent = "RM 24.30";
    document.getElementById("priceLabel").textContent = "Average";
    document.getElementById("suggestion").textContent = "Wait until 06:55 AM";
  };

  document.getElementById("seeMoreBtn").onclick = () => {
    const box = document.getElementById("moreInfo");
    box.classList.toggle("hidden");
    document.getElementById("extraInfoTable").innerHTML = `
      <tr><td>Driver ETA</td><td>7 min</td></tr>
      <tr><td>Distance</td><td>21.5 km</td></tr>
      <tr><td>Duration</td><td>34 min</td></tr>
      <tr><td>Route</td><td>LSA_E5</td></tr>
      <tr><td>Weather</td><td>Clear</td></tr>
      <tr><td>Tolls</td><td>No</td></tr>
    `;
  };
}

function addRow() {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><input type="date"></td>
    <td><input type="time"></td>
    <td><input type="number"></td>
    <td><input type="number"></td>
    <td><input type="number"></td>
    <td><input type="number"></td>
    <td><input></td>
    <td><input></td>
    <td><input type="number"></td>
    <td><input type="number"></td>
    <td><select><option>0</option><option>1</option></select></td>
  `;
  document.querySelector("#dataTable tbody").appendChild(row);
}

function predictFromUserData() {
  document.getElementById("userPrediction").classList.remove("hidden");

  document.getElementById("userPredictionTable").innerHTML = `
    <tr><td>fare_standard_RM</td><td>RM 25.10</td></tr>
    <tr><td>driver_est_min</td><td>7</td></tr>
    <tr><td>distance_km</td><td>21.5</td></tr>
    <tr><td>duration_min</td><td>33</td></tr>
    <tr><td>fastest_route</td><td>LSA_E5</td></tr>
    <tr><td>weather</td><td>Clear</td></tr>
    <tr><td>imap_distance_km</td><td>19</td></tr>
    <tr><td>imap_duration_min</td><td>36</td></tr>
    <tr><td>tolls_true_false</td><td>0</td></tr>
  `;
}
