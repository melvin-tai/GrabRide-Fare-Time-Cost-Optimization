const addRowBtn = document.getElementById("addRowBtn");
const dataTable = document.getElementById("dataTable").getElementsByTagName("tbody")[0];
const predictBtn = document.getElementById("predictBtn");

addRowBtn.onclick = () => {
  const firstRow = dataTable.rows[0];
  const newRow = firstRow.cloneNode(true);

  Array.from(newRow.querySelectorAll("input")).forEach(i => i.value = "");
  Array.from(newRow.querySelectorAll("select")).forEach(s => s.selectedIndex = 0);

  dataTable.appendChild(newRow);
};

predictBtn.onclick = () => {
  const rows = Array.from(dataTable.rows).map(r => {
    return Array.from(r.cells).map(c => {
      const input = c.querySelector("input, select");
      return input ? input.value : null;
    });
  });

  console.log("User Data:", rows);
  const userPrediction = document.getElementById("userPrediction");
  const table = document.getElementById("userPredictionTable");

  table.innerHTML = "<tr><th>Fare Prediction [RM]</th><td>24</td></tr><tr><th>ETA [min]</th><td>7</td></tr>";
  userPrediction.classList.remove("hidden");
};
