/************************************************************
 * Multi-Field Filtering Code
 ************************************************************/
import {
  getTextColor,
  showMessage,
  customAlert
} from "./tools.js";

import {
  driver,
  clingoRoutingRetrieval,
  resetNodes,
  sharedData,
  nodesConf,
  availableNodes,
  availableVehicles,
  callPythonforClingoExecution
} from "./main.js";

import * as config from './configApis/config.js';

let originalFieldValues = {};
const maxVehicles = 3;

export async function fetchAllDropdownOptions() {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    const queries = {
      models:             "MATCH (c:cars) RETURN DISTINCT c.model AS value",
      transmissions:      "MATCH (c:cars) RETURN DISTINCT c.transmission AS value",
      drives:             "MATCH (c:cars) RETURN DISTINCT c.drive AS value",
      fuels:              "MATCH (c:cars) RETURN DISTINCT c.fuel AS value",
      stnds:              "MATCH (c:cars) RETURN DISTINCT c.stnd AS value",
      veh_classes:        "MATCH (c:cars) RETURN DISTINCT c.veh_class AS value",
    };
    const dropdownOptions = {};

    for (const [key, query] of Object.entries(queries)) {
      const result = await session.run(query);
      dropdownOptions[key] = result.records.map((record) => record.get("value"));
    }
    return dropdownOptions;
  } catch (error) {
    console.error("Error fetching all dropdown options:", error);
    return {
      models: [],
      transmissions: [],
      drives: [],
      fuels: [],
      stnds: [],
      veh_classes: [],
    };
  } finally {
    await session.close();
  }
}

async function fetchFilteredOptions(filters) {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    const whereClauses = [];
    const params = {};

    if (filters.model) {
      whereClauses.push("c.model = $model");
      params.model = filters.model;
    }
    if (filters.transmission) {
      whereClauses.push("c.transmission = $transmission");
      params.transmission = filters.transmission;
    }
    if (filters.drive) {
      whereClauses.push("c.drive = $drive");
      params.drive = filters.drive;
    }
    if (filters.fuel) {
      whereClauses.push("c.fuel = $fuel");
      params.fuel = filters.fuel;
    }
    if (filters.stnd) {
      whereClauses.push("c.stnd = $stnd");
      params.stnd = filters.stnd;
    }
    if (filters.veh_class) {
      whereClauses.push("c.veh_class = $veh_class");
      params.veh_class = filters.veh_class;
    }

    let whereString = "";
    if (whereClauses.length > 0) {
      whereString = "WHERE " + whereClauses.join(" AND ");
    }

    const query = `
      MATCH (c:cars)
      ${whereString}
      RETURN
        collect(distinct c.model)          AS models,
        collect(distinct c.transmission)   AS transmissions,
        collect(distinct c.drive)          AS drives,
        collect(distinct c.fuel)           AS fuels,
        collect(distinct c.stnd)           AS stnds,
        collect(distinct c.veh_class)      AS veh_classes
    `;

    const result = await session.run(query, params);
    if (result.records.length === 0) {
      return {
        models: [],
        transmissions: [],
        drives: [],
        fuels: [],
        stnds: [],
        veh_classes: [],
      };
    }

    const record = result.records[0];
    return {
      models:         record.get("models")          || [],
      transmissions:  record.get("transmissions")   || [],
      drives:         record.get("drives")          || [],
      fuels:          record.get("fuels")           || [],
      stnds:          record.get("stnds")           || [],
      veh_classes:    record.get("veh_classes")     || [],
    };
  } catch (error) {
    console.error("fetchFilteredOptions -> Error:", error);
    return {
      models: [],
      transmissions: [],
      drives: [],
      fuels: [],
      stnds: [],
      veh_classes: [],
    };
  } finally {
    session.close();
  }
}


function populateDropdown(selectElem, options, placeholder, selectedValue) {
  if (!selectElem) return;
  selectElem.innerHTML = "";

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  selectElem.appendChild(placeholderOption);

  options.forEach((opt) => {
    const optionEl = document.createElement("option");
    optionEl.value = opt;
    optionEl.textContent = opt;
    selectElem.appendChild(optionEl);
  });

  if (selectedValue && options.includes(selectedValue)) {
    selectElem.value = selectedValue;
  } else {
    selectElem.value = "";
  }
}

function attachMultiFilterListeners(i) {
  const modelSel   = document.getElementById(`model${i}`);
  const transSel   = document.getElementById(`transmission${i}`);
  const driveSel   = document.getElementById(`drive${i}`);
  const fuelSel    = document.getElementById(`fuel${i}`);
  const stndSel    = document.getElementById(`stnd${i}`);
  const vclassSel  = document.getElementById(`veh_class${i}`);
  const clearBtn   = document.getElementById(`clearFiltersBtn${i}`);

  async function onFieldChange() {
    const filters = {
      model:        modelSel.value        || null,
      transmission: transSel.value        || null,
      drive:        driveSel.value        || null,
      fuel:         fuelSel.value         || null,
      stnd:         stndSel.value         || null,
      veh_class:    vclassSel.value       || null,
    };
    const filtered = await fetchFilteredOptions(filters);

    populateDropdown(modelSel,   filtered.models,         "-- Select Model --",           filters.model);
    populateDropdown(transSel,   filtered.transmissions,  "-- Select Transmission --",    filters.transmission);
    populateDropdown(driveSel,   filtered.drives,         "-- Select Drive --",           filters.drive);
    populateDropdown(fuelSel,    filtered.fuels,          "-- Select Fuel --",            filters.fuel);
    populateDropdown(stndSel,    filtered.stnds,          "-- Select Emission Std --",    filters.stnd);
    populateDropdown(vclassSel,  filtered.veh_classes,    "-- Select Vehicle Class --",   filters.veh_class);
  }

  modelSel?.addEventListener("change", onFieldChange);
  transSel?.addEventListener("change", onFieldChange);
  driveSel?.addEventListener("change", onFieldChange);
  fuelSel?.addEventListener("change", onFieldChange);
  stndSel?.addEventListener("change", onFieldChange);
  vclassSel?.addEventListener("change", onFieldChange);

  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      modelSel.value   = "";
      transSel.value   = "";
      driveSel.value   = "";
      fuelSel.value    = "";
      stndSel.value    = "";
      vclassSel.value  = "";

      const allOpts = await fetchAllDropdownOptions();
      populateDropdown(modelSel,   allOpts.models,         "-- Select Model --",           "");
      populateDropdown(transSel,   allOpts.transmissions,  "-- Select Transmission --",    "");
      populateDropdown(driveSel,   allOpts.drives,         "-- Select Drive --",           "");
      populateDropdown(fuelSel,    allOpts.fuels,          "-- Select Fuel --",            "");
      populateDropdown(stndSel,    allOpts.stnds,          "-- Select Emission Std --",    "");
      populateDropdown(vclassSel,  allOpts.veh_classes,    "-- Select Vehicle Class --",   "");
    });
  }
}

async function generateVehicleConfigFields(numVehicles) {
  const container = document.getElementById("vehicleConfigs");
  container.innerHTML = "";

  const dropdownOptions = await fetchAllDropdownOptions();

  for (let i = 1; i <= numVehicles; i++) {
    const vehicleConfigDiv = document.createElement("div");
    vehicleConfigDiv.className = "vehicle-config";
    vehicleConfigDiv.innerHTML = `
      <div class="separator"></div>
      <div class="label">Vehicle ${i} Configuration:</div>
      <div class="extra-fields">
        <div class="form-group">
          <label for="model${i}">Model:</label>
          <select id="model${i}"><option value="">-- Select Model --</option></select>
        </div>
        <div class="form-group">
          <label for="transmission${i}">Transmission:</label>
          <select id="transmission${i}"><option value="">-- Select Transmission --</option></select>
        </div>
        <div class="form-group">
          <label for="drive${i}">Drive:</label>
          <select id="drive${i}"><option value="">-- Select Drive --</option></select>
        </div>
        <div class="form-group">
          <label for="fuel${i}">Fuel:</label>
          <select id="fuel${i}"><option value="">-- Select Fuel --</option></select>
        </div>
        <div class="form-group">
          <label for="stnd${i}">Emission Std:</label>
          <select id="stnd${i}"><option value="">-- Select Emission Std --</option></select>
        </div>
        <div class="form-group">
          <label for="veh_class${i}">Vehicle Class:</label>
          <select id="veh_class${i}"><option value="">-- Select Vehicle Class --</option></select>
        </div>

        <div class="form-group">
          <label for="price_eur${i}">Price (EUR):</label>
          <input type="range" id="price_eur${i}" min="1000" max="100000" step="1000" value="-1">
        </div>
        <div class="form-group">
          <label for="smartway${i}">SmartWay?:</label>
          <input type="checkbox" id="smartway${i}">
        </div>
        <div class="form-group">
          <button type="button" id="clearFiltersBtn${i}">Clear Filters (Vehicle ${i})</button>
        </div>
      </div>
    `;
    container.appendChild(vehicleConfigDiv);
  }

  for (let i = 1; i <= numVehicles; i++) {
    // Mappings
    populateDropdown(document.getElementById(`model${i}`),         dropdownOptions.models,        "-- Select Model --",         "");
    populateDropdown(document.getElementById(`transmission${i}`),  dropdownOptions.transmissions, "-- Select Transmission --",  "");
    populateDropdown(document.getElementById(`drive${i}`),         dropdownOptions.drives,        "-- Select Drive --",         "");
    populateDropdown(document.getElementById(`fuel${i}`),          dropdownOptions.fuels,         "-- Select Fuel --",          "");
    populateDropdown(document.getElementById(`stnd${i}`),          dropdownOptions.stnds,         "-- Select Emission Std --",  "");
    populateDropdown(document.getElementById(`veh_class${i}`),     dropdownOptions.veh_classes,   "-- Select Vehicle Class --", "");

    attachMultiFilterListeners(i);
  }
}


document.getElementById("openConfigButton").addEventListener("click", function () {
  const modal = document.getElementById("vehicleConfigModal");
  modal.style.display = "block";
  document.getElementById("vehicleConfigs").style.display = "block";

  storeOriginalFieldValues();
  const numVehicles = parseInt(document.getElementById("numVehicles").value) || 0;
  generateVehicleConfigFields(numVehicles);
});

document.getElementById("closeVehicleConfigModal").onclick = closeVehicleConfigModal;
function closeVehicleConfigModal() {
  document.getElementById("vehicleConfigModal").style.display = "none";
}

function storeOriginalFieldValues() {
  originalFieldValues = {};
  const numVehicles = parseInt(document.getElementById("numVehicles").value) || 0;
}

const numVehiclesInput = document.getElementById("numVehicles");
numVehiclesInput.addEventListener("input", function () {
  let num = parseInt(this.value) || 0;
  if (num < 0) num = 0;
  if (num > maxVehicles) num = maxVehicles;
  this.value = num;

  if (num > 0) {
    document.getElementById("vehicleConfigs").style.display = "block";
    generateVehicleConfigFields(num);
  } else {
    document.getElementById("vehicleConfigs").style.display = "none";
  }
});


export async function createVehicleInNeo4j(vehicleData) {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    // For auto-increment vehicleID:
    const result = await session.run("MATCH (v:Vehicle) RETURN max(v.vehicleID) AS lastID");
    let lastID = result.records[0].get("lastID");
    lastID = parseInt(lastID);
    if (isNaN(lastID)) lastID = 0;

    const newVehicleID = lastID + 1;
    const createQuery = `
      CREATE (v:Vehicle {
        vehicleID: $vehicleID,
        model:     $model,
        transmission: $transmission,
        drive:     $drive,
        fuel:      $fuel,
        stnd:      $stnd,
        veh_class: $veh_class,
        price_eur: $price_eur,
        smartway:  $smartway,
        air_pollution_score: $air_pollution_score,
        city_mpg:  $city_mpg,
        hwy_mpg:   $hwy_mpg,
        cmb_mpg:   $cmb_mpg,
        greenhouse_gas_score: $greenhouse_gas_score,
        cyl:             $cyl,
        underhood_id:    $underhood_id,
        stnd_description:$stnd_description,
        cert_region:     $cert_region
      })
      RETURN v
    `;
    const params = {
      vehicleID: newVehicleID,
      model: vehicleData.model || null,
      transmission: vehicleData.transmission || null,
      drive: vehicleData.drive || null,
      fuel: vehicleData.fuel || null,
      stnd: vehicleData.stnd || null,
      veh_class: vehicleData.veh_class || null,
      price_eur: vehicleData.price_eur ? parseFloat(vehicleData.price_eur) : null,
      smartway: vehicleData.smartway ? "on" : null,
      air_pollution_score: vehicleData.air_pollution_score ? parseFloat(vehicleData.air_pollution_score) : null,
      city_mpg: vehicleData.city_mpg ? parseFloat(vehicleData.city_mpg) : null,
      hwy_mpg: vehicleData.hwy_mpg ? parseFloat(vehicleData.hwy_mpg) : null,
      cmb_mpg: vehicleData.cmb_mpg ? parseFloat(vehicleData.cmb_mpg) : null,
      greenhouse_gas_score: vehicleData.greenhouse_gas_score ? parseFloat(vehicleData.greenhouse_gas_score) : null,
      cyl: vehicleData.cyl ? parseInt(vehicleData.cyl) : null,
      underhood_id: vehicleData.underhood_id || null,
      stnd_description: vehicleData.stnd_description || null,
      cert_region: vehicleData.cert_region || null,
    };

    await session.run(createQuery, params);
    console.log(`[DEBUG] Vehicle created with ID = ${newVehicleID}`);
  } catch (error) {
    console.error("[DEBUG] Error creating vehicle in Neo4j:", error);
    throw error;
  } finally {
    session.close();
  }
}

async function clearAllVehiclesFromDB() {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    await session.run("MATCH (v:Vehicle) DETACH DELETE v");
    showMessage("All vehicles deleted successfully", 2);
  } catch (error) {
    console.error("[DEBUG] Error deleting vehicles:", error);
  } finally {
    session.close();
  }
}

document.getElementById("vehicleConfigForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const numVehicles = parseInt(document.getElementById("numVehicles").value) || 0;

  // 1) Clear all old Vehicles in DB
  await clearAllVehiclesFromDB();

  // 2) Create new Vehicles from the fields
  for (let i = 1; i <= numVehicles; i++) {
    const vehicleData = {
      model:    document.getElementById(`model${i}`).value,
      transmission: document.getElementById(`transmission${i}`).value,
      drive:    document.getElementById(`drive${i}`).value,
      fuel:     document.getElementById(`fuel${i}`).value,
      stnd:     document.getElementById(`stnd${i}`).value,
      veh_class:document.getElementById(`veh_class${i}`).value,
      price_eur:document.getElementById(`price_eur${i}`).value,
      smartway: document.getElementById(`smartway${i}`).checked, // "on" if checked
      // air_pollution_score: document.getElementById(`air_pollution_score${i}`).value,
      // city_mpg:  document.getElementById(`city_mpg${i}`).value,
      // hwy_mpg:   document.getElementById(`hwy_mpg${i}`).value,
      // cmb_mpg:   document.getElementById(`cmb_mpg${i}`).value,
      // greenhouse_gas_score: document.getElementById(`greenhouse_gas_score${i}`).value,
      // cyl: document.getElementById(`cyl${i}`).value,
      // underhood_id: document.getElementById(`underhood_id${i}`).value,
      // stnd_description: document.getElementById(`stnd_description${i}`).value,
      // cert_region: document.getElementById(`cert_region${i}`).value,
    };
    console.log(`[DEBUG] Creating vehicle ${i}:`, vehicleData);

    try {
      await createVehicleInNeo4j(vehicleData);
    } catch (err) {
      console.error("[DEBUG] Error creating vehicle:", err);
      return; // or continue
    }
  }

  showMessage("All vehicles created successfully!", 2);
  closeVehicleConfigModal();
});
