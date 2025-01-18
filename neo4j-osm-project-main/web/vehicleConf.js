/************************************************************
 * Multi-Field Filtering Code
 * Demonstrates how to filter by Model, Transmission, Drive,
 * Fuel, Emissions Standard, and Vehicle Class, for multiple
 * vehicles. Each dropdown affects the others.
 ************************************************************/

/************************************
 * 1. Imports / Globals
 ************************************/
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

let originalFieldValues = {}; // Object to store original field values
let confNumVeh = 0;

/************************************
 * 2. fetchAllDropdownOptions()
 *    - Returns the unfiltered sets
 *      of all distinct values.
 ************************************/
export async function fetchAllDropdownOptions() {
  const session = driver.session({ database: config.neo4jDatabase });
  
  try {
    const queries = {
      models:              "MATCH (c:cars) RETURN DISTINCT c.Model       AS value",
      transmissions:       "MATCH (c:cars) RETURN DISTINCT c.Trans       AS value",
      driveTypes:          "MATCH (c:cars) RETURN DISTINCT c.Drive       AS value",
      fuelTypes:           "MATCH (c:cars) RETURN DISTINCT c.Fuel        AS value",
      emissionsStandards:  "MATCH (c:cars) RETURN DISTINCT c.Stnd        AS value",
      vehicleClasses:      "MATCH (c:cars) RETURN DISTINCT c.Veh_Class   AS value",
    };

    const dropdownOptions = {};

    for (const [key, query] of Object.entries(queries)) {
      const result = await session.run(query);
      dropdownOptions[key] = result.records.map((record) => record.get("value"));
    }

    console.log("[DEBUG] fetchAllDropdownOptions ->", dropdownOptions);
    return dropdownOptions;
  } catch (error) {
    console.error("[DEBUG] Error fetching all dropdown options:", error);
    return {
      models: [],
      transmissions: [],
      driveTypes: [],
      fuelTypes: [],
      emissionsStandards: [],
      vehicleClasses: [],
    };
  } finally {
    session.close();
  }
}

/************************************
 * 3. fetchFilteredOptions(filters)
 *    - Multi-field filter: Build a
 *      dynamic WHERE clause for any
 *      non-empty fields.
 ************************************/
async function fetchFilteredOptions(filters) {
  // filters is an object like:
  // { model, trans, drive, fuel, stnd, veh_class }
  console.log("[DEBUG] fetchFilteredOptions ->", filters);

  const session = driver.session({ database: config.neo4jDatabase });
  try {
    // Build WHERE clauses
    const whereClauses = [];
    const params = {};

    if (filters.model) {
      whereClauses.push("c.Model = $model");
      params.model = filters.model;
    }
    if (filters.trans) {
      whereClauses.push("c.Trans = $trans");
      params.trans = filters.trans;
    }
    if (filters.drive) {
      whereClauses.push("c.Drive = $drive");
      params.drive = filters.drive;
    }
    if (filters.fuel) {
      whereClauses.push("c.Fuel = $fuel");
      params.fuel = filters.fuel;
    }
    if (filters.stnd) {
      whereClauses.push("c.Stnd = $stnd");
      params.stnd = filters.stnd;
    }
    if (filters.veh_class) {
      whereClauses.push("c.Veh_Class = $veh_class");
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
        collect(distinct c.Model)         AS models,
        collect(distinct c.Trans)         AS transmissions,
        collect(distinct c.Drive)         AS driveTypes,
        collect(distinct c.Fuel)          AS fuelTypes,
        collect(distinct c.Stnd)          AS emissionsStandards,
        collect(distinct c.Veh_Class)     AS vehicleClasses
    `;

    console.log("[DEBUG] fetchFilteredOptions -> Cypher query:\n", query);
    console.log("[DEBUG] fetchFilteredOptions -> params:", params);

    const result = await session.run(query, params);
    console.log("[DEBUG] result.records:", result.records);

    if (result.records.length > 0) {
      const record = result.records[0];
      return {
        models: record.get("models"),
        transmissions: record.get("transmissions"),
        driveTypes: record.get("driveTypes"),
        fuelTypes: record.get("fuelTypes"),
        emissionsStandards: record.get("emissionsStandards"),
        vehicleClasses: record.get("vehicleClasses"),
      };
    }
    // If no records matched
    return {
      models: [],
      transmissions: [],
      driveTypes: [],
      fuelTypes: [],
      emissionsStandards: [],
      vehicleClasses: [],
    };
  } catch (error) {
    console.error("[DEBUG] fetchFilteredOptions -> Error:", error);
    return {
      models: [],
      transmissions: [],
      driveTypes: [],
      fuelTypes: [],
      emissionsStandards: [],
      vehicleClasses: [],
    };
  } finally {
    session.close();
  }
}

/************************************
 * 4. populateDropdown (with selected)
 ************************************/
function populateDropdown(selectElem, options, placeholder, selectedValue) {
  if (!selectElem) return;

  selectElem.innerHTML = "";

  // placeholder
  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  selectElem.appendChild(placeholderOption);

  // add new options
  options.forEach((opt) => {
    const optionEl = document.createElement("option");
    optionEl.value = opt;
    optionEl.textContent = opt;
    selectElem.appendChild(optionEl);
  });

  // if the previously selectedValue is still valid, reselect it
  if (selectedValue && options.includes(selectedValue)) {
    selectElem.value = selectedValue;
  } else {
    // reset to placeholder
    selectElem.value = "";
  }
}

/************************************
 * 5. attachMultiFilterListeners(i)
 *    - For each vehicle, attach an
 *      event listener to *all* fields
 ************************************/
function attachMultiFilterListeners(i) {
  // Grab references to the fields
  const modelSelect    = document.getElementById(`model${i}`);
  const transSelect    = document.getElementById(`transmission${i}`);
  const driveSelect    = document.getElementById(`drive${i}`);
  const fuelSelect     = document.getElementById(`fuel${i}`);
  const stndSelect     = document.getElementById(`stnd${i}`);
  const vehClassSelect = document.getElementById(`veh_class${i}`);
  const clearBtn       = document.getElementById(`clearFiltersBtn${i}`);

  // Single callback for ANY field change
  async function onFieldChange() {
    console.log(`[DEBUG] onFieldChange -> vehicle ${i}`);

    // Build the current filters object
    const filters = {
      model:      modelSelect.value || null,
      transmission:      transSelect.value || null,
      drive:      driveSelect.value || null,
      fuel:       fuelSelect.value || null,
      stnd:       stndSelect.value || null,
      veh_class:  vehClassSelect.value || null,
    };

    // Fetch new possible values
    const filtered = await fetchFilteredOptions(filters);
    console.log(`[DEBUG] fetchFilteredOptions -> vehicle ${i}:`, filtered);

    // Re-populate all fields (retain current selection if still valid)
    populateDropdown(modelSelect,    filtered.models,              "-- Select Model --",           filters.model);
    populateDropdown(transSelect,    filtered.transmissions,       "-- Select Transmission --",    filters.transmission);
    populateDropdown(driveSelect,    filtered.driveTypes,          "-- Select Drive Type --",      filters.drive);
    populateDropdown(fuelSelect,     filtered.fuelTypes,           "-- Select Fuel Type --",       filters.fuel);
    populateDropdown(stndSelect,     filtered.emissionsStandards,  "-- Select Emissions Standard --", filters.stnd);
    populateDropdown(vehClassSelect, filtered.vehicleClasses,      "-- Select Vehicle Class --",   filters.veh_class);
  }

  // Attach the same handler to all 6 dropdowns
  modelSelect?.addEventListener("change", onFieldChange);
  transSelect?.addEventListener("change", onFieldChange);
  driveSelect?.addEventListener("change", onFieldChange);
  fuelSelect?.addEventListener("change", onFieldChange);
  stndSelect?.addEventListener("change", onFieldChange);
  vehClassSelect?.addEventListener("change", onFieldChange);

  // "Clear Filters" button
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      console.log(`[DEBUG] Clear Filters clicked for vehicle ${i}`);

      // Reset all fields to empty
      modelSelect.value    = "";
      transSelect.value    = "";
      driveSelect.value    = "";
      fuelSelect.value     = "";
      stndSelect.value     = "";
      vehClassSelect.value = "";

      // Now fetch the unfiltered results
      const allOptions = await fetchAllDropdownOptions();
      console.log(`[DEBUG] Re-populating vehicle ${i} with unfiltered data (Clear Button)`, allOptions);

      // Re-populate each field with all possible values
      populateDropdown(modelSelect,    allOptions.models,             "-- Select Model --",            "");
      populateDropdown(transSelect,    allOptions.transmissions,      "-- Select Transmission --",     "");
      populateDropdown(driveSelect,    allOptions.driveTypes,         "-- Select Drive Type --",       "");
      populateDropdown(fuelSelect,     allOptions.fuelTypes,          "-- Select Fuel Type --",        "");
      populateDropdown(stndSelect,     allOptions.emissionsStandards, "-- Select Emissions Standard --", "");
      populateDropdown(vehClassSelect, allOptions.vehicleClasses,     "-- Select Vehicle Class --",    "");
    });
  }
}

/************************************
 * 6. generateVehicleConfigFields()
 *    - Dynamically create the fields
 *      for each vehicle, then attach
 *      listeners.
 ************************************/
async function generateVehicleConfigFields(numVehicles) {
  const container = document.getElementById("vehicleConfigs");
  container.innerHTML = "";

  // Fetch all possible (unfiltered) options
  const dropdownOptions = await fetchAllDropdownOptions();

  // Fields to generate
  const extraFields = [
    { label: "Model", name: "model", type: "dropdown", options: dropdownOptions.models },
    { label: "Transmission", name: "trans", type: "dropdown", options: dropdownOptions.transmissions },
    { label: "Drive Type", name: "drive", type: "dropdown", options: dropdownOptions.driveTypes },
    { label: "Fuel Type", name: "fuel", type: "dropdown", options: dropdownOptions.fuelTypes },
    { label: "Emissions Standard", name: "stnd", type: "dropdown", options: dropdownOptions.emissionsStandards },
    { label: "Vehicle Class", name: "veh_class", type: "dropdown", options: dropdownOptions.vehicleClasses },
    { label: "Price", name: "price", type: "range", min: 1000, max: 100000, step: 1000 },
    { label: "SmartWay?", name: "smartway", type: "checkbox" },
  ];

  for (let i = 1; i <= numVehicles; i++) {
    const vehicleConfigDiv = document.createElement("div");
    vehicleConfigDiv.className = "vehicle-config";

    vehicleConfigDiv.innerHTML = `
      <div class="separator"></div>
      <div class="label">Vehicle ${i} Configuration:</div>
    `;

    const extraFieldsContainer = document.createElement("div");
    extraFieldsContainer.className = "extra-fields";

    extraFields.forEach((field) => {
      const fieldDiv = document.createElement("div");
      fieldDiv.className = "form-group";

      if (field.type === "dropdown") {
        const dropdownHTML = `
          <label for="${field.name}${i}">${field.label}:</label>
          <select id="${field.name}${i}" name="${field.name}${i}">
            <option value="">-- Select ${field.label} --</option>
            ${field.options.map((opt) => `<option value="${opt}">${opt}</option>`).join("")}
          </select>
        `;
        fieldDiv.innerHTML = dropdownHTML;
      } else if (field.type === "checkbox") {
        fieldDiv.innerHTML = `
          <label for="${field.name}${i}">${field.label}:</label>
          <input type="checkbox" id="${field.name}${i}" name="${field.name}${i}">
        `;
      } else if (field.type === "range") {
        fieldDiv.innerHTML = `
          <label for="${field.name}${i}">${field.label}:</label>
          <input type="range"
                 id="${field.name}${i}"
                 name="${field.name}${i}"
                 min="${field.min}"
                 max="${field.max}"
                 step="${field.step}"
                 value="">
        `;
      }

      extraFieldsContainer.appendChild(fieldDiv);
    });

    // Clear button
    const clearButtonDiv = document.createElement("div");
    clearButtonDiv.className = "form-group";
    clearButtonDiv.innerHTML = `
      <button type="button" id="clearFiltersBtn${i}">Clear Filters (Vehicle ${i})</button>
    `;
    extraFieldsContainer.appendChild(clearButtonDiv);

    vehicleConfigDiv.appendChild(extraFieldsContainer);
    container.appendChild(vehicleConfigDiv);
  }

  // Attach listeners for each vehicle
  for (let i = 1; i <= numVehicles; i++) {
    attachMultiFilterListeners(i);
  }
}

/************************************
 * 7. Modal & Initialization
 ************************************/
// "Open Config" button => show modal & generate fields
document.getElementById("openConfigButton").addEventListener("click", function () {
  const modal = document.getElementById("vehicleConfigModal");
  modal.style.display = "block";
  document.getElementById("vehicleConfigs").style.display = "block";

  // Store original values if needed
  storeOriginalFieldValues();

  const numVehiclesInput = document.getElementById("numVehicles");
  const numVehicles = parseInt(numVehiclesInput.value) || 0;

  generateVehicleConfigFields(numVehicles);
});

// "Close" modal button
document.getElementById("closeVehicleConfigModal").onclick = closeVehicleConfigModal;
function closeVehicleConfigModal() {
  document.getElementById("vehicleConfigModal").style.display = "none";
}

// Optional function to store original field values
function storeOriginalFieldValues() {
  originalFieldValues = {};
  const numVehiclesInput = document.getElementById("numVehicles");
  const numVehicles = parseInt(numVehiclesInput.value);

  for (let i = 1; i <= numVehicles; i++) {
    // e.g.:
    // originalFieldValues[`capacity${i}`] = ...
  }
}

/************************************
 * 8. numVehicles input (0..3)
 ************************************/
const numVehiclesInput = document.getElementById("numVehicles");
const maxVehicles = 3;

numVehiclesInput.addEventListener("input", function () {
  let numVehicles = parseInt(this.value) || 0;
  if (numVehicles < 0) {
    numVehicles = 0;
    this.value = 0;
  } else if (numVehicles > maxVehicles) {
    numVehicles = maxVehicles;
    this.value = maxVehicles;
  }

  if (numVehicles > 0) {
    document.getElementById("vehicleConfigs").style.display = "block";
    generateVehicleConfigFields(numVehicles);
  } else {
    document.getElementById("vehicleConfigs").style.display = "none";
  }
});

/************************************
 * 9. On page load
 ************************************/
window.addEventListener("load", function () {
  resetNodes();
  originalFieldValues = {};
});

/************************************
 * 10. Create Vehicle in Neo4j
 ************************************/
export async function createVehicleInNeo4j(vehicleData) {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    // Find current max vehicleID
    const result = await session.run(
      "MATCH (v:Vehicle) RETURN max(v.vehicleID) AS lastVehicleID"
    );
    let lastVehicleID = result.records[0].get("lastVehicleID");
    lastVehicleID = parseInt(lastVehicleID);
    if (isNaN(lastVehicleID)) lastVehicleID = 0;

    const newVehicleID = lastVehicleID + 1;

    // Optional fields => handle null if empty
    const createVehicleQuery = `
      CREATE (v:Vehicle {
        vehicleID: $vehicleID,
        capacity:  $capacity,
        id:        $id,
        model:     $model,
        display:   $display,
        cyl:       $cyl,
        transmission: $transmission,
        drive:     $drive,
        fuel:      $fuel,
        cert_region: $Cert_region,
        stnd:      $stnd,
        stnd_description: $stnd_description,
        underhood_id: $underhood_id,
        veh_class:  $veh_class,
        air_pollution_score: $air_pollution_score,
        city_mpg:   $city_mpg,
        hwy_mpg:    $hwy_mpg,
        cmb_mpg:    $cmb_mpg,
        greenhouse_gas_score: $greenhouse_gas_score,
        smartway:   $smartway,
        price_eur:  $price_eur
      })
      RETURN v
    `;

    const parameters = {
      vehicleID: newVehicleID,
      capacity: parseInt(vehicleData.capacity) || 1,
      id: vehicleData.id || null,
      model: vehicleData.model || null,
      display: vehicleData.display ? parseFloat(vehicleData.display) : null,
      cyl: vehicleData.cyl ? parseInt(vehicleData.cyl) : null,
      transmission: vehicleData.transmission || null,
      drive: vehicleData.drive || null,
      fuel: vehicleData.fuel || null,
      cert_region: vehicleData.cert_region || null,
      stnd: vehicleData.stnd || null,
      stnd_description: vehicleData.stnd_description || null,
      underhood_id: vehicleData.underhood_id || null,
      veh_class: vehicleData.veh_class || null,
      air_pollution_score: vehicleData.air_pollution_score
        ? parseFloat(vehicleData.air_pollution_score)
        : null,
      city_mpg: vehicleData.city_mpg
        ? parseFloat(vehicleData.city_mpg)
        : null,
      hwy_mpg: vehicleData.hwy_mpg
        ? parseFloat(vehicleData.hwy_mpg)
        : null,
      cmb_mpg: vehicleData.cmb_mpg
        ? parseFloat(vehicleData.cmb_mpg)
        : null,
      greenhouse_gas_score: vehicleData.greenhouse_gas_score
        ? parseFloat(vehicleData.greenhouse_gas_score)
        : null,
      smartway: vehicleData.smartway === "on" ? "on" : null,
      price_eur: vehicleData.price_eur ? parseFloat(vehicleData.price_eur) : null,
    };

    const createResult = await session.writeTransaction(async (tx) => {
      return tx.run(createVehicleQuery, parameters);
    });

    console.log("[DEBUG] Vehicle created in Neo4j with ID:", newVehicleID);
  } catch (error) {
    console.error("[DEBUG] Error creating vehicle in Neo4j:", error);
    throw error;
  } finally {
    session.close();
  }
}

/************************************
 * 11. clearAllVehiclesFromDB
 ************************************/
async function clearAllVehiclesFromDB() {
  const session = driver.session({ database: config.neo4jDatabase });
  const deleteAllVehiclesQuery = `
    MATCH (v:Vehicle)
    DETACH DELETE v
  `;
  try {
    const result = await session.run(deleteAllVehiclesQuery);
    showMessage("All vehicles deleted successfully", 2);
    console.log("[DEBUG] All vehicles deleted from Neo4j:", result.summary.counters);
  } catch (error) {
    console.log("[DEBUG] Error deleting vehicles from Neo4j:", error);
  } finally {
    session.close();
  }
}

/************************************
 * 12. Form Submission
 ************************************/
document
  .getElementById("vehicleConfigForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();
    const numVehicles = parseInt(document.getElementById("numVehicles").value) || 0;

    // Clear all old Vehicles in DB
    await clearAllVehiclesFromDB();

    // Create new Vehicles
    for (let i = 1; i <= numVehicles; i++) {
      const vehicleData = {
        capacity:          document.getElementById(`capacity${i}`)?.value ?? "",
        id:                document.getElementById(`id${i}`)?.value ?? "",
        model:             document.getElementById(`model${i}`)?.value ?? "",
        display:           document.getElementById(`display${i}`)?.value ?? "",
        cyl:               document.getElementById(`cyl${i}`)?.value ?? "",
        transmission:      document.getElementById(`transmission${i}`)?.value ?? "",
        drive:             document.getElementById(`drive${i}`)?.value ?? "",
        fuel:              document.getElementById(`fuel${i}`)?.value ?? "",
        cert_region:       document.getElementById(`cert_region${i}`)?.value ?? "",
        stnd:              document.getElementById(`stnd${i}`)?.value ?? "",
        stnd_description:  document.getElementById(`stnd_description${i}`)?.value ?? "",
        underhood_id:      document.getElementById(`underhood_id${i}`)?.value ?? "",
        veh_class:         document.getElementById(`veh_class${i}`)?.value ?? "",
        air_pollution_score:    document.getElementById(`air_pollution_score${i}`)?.value ?? "",
        city_mpg:          document.getElementById(`city_mpg${i}`)?.value ?? "",
        hwy_mpg:           document.getElementById(`hwy_mpg${i}`)?.value ?? "",
        cmb_mpg:           document.getElementById(`cmb_mpg${i}`)?.value ?? "",
        greenhouse_gas_score:   document.getElementById(`greenhouse_gas_score${i}`)?.value ?? "",
        // Checkbox => "on" if checked
        smartway: document.getElementById(`smartway${i}`)?.checked ? "on" : "",
        // Range => price
        price_eur: document.getElementById(`price_eur${i}`)?.value ?? "",
      };

      console.log(`[DEBUG] Creating vehicle ${i} ->`, vehicleData);

      try {
        await createVehicleInNeo4j(vehicleData);
      } catch (error) {
        console.error("[DEBUG] Error creating vehicle:", error);
        // Decide whether to continue or break
        return;
      }
    }

    showMessage("All vehicles created successfully!", 2);
    closeVehicleConfigModal(); // Hide the modal
  });

