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

async function generateVehicleConfigFields(numVehicles) {
  const container = document.getElementById("vehicleConfigs");
  container.innerHTML = "";

  // Fetch dynamic dropdown options
  const dropdownOptions = await fetchDropdownOptions();

  // Define the extra fields
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
        fieldDiv.innerHTML = `
          <label for="${field.name}${i}">${field.label}:</label>
          <select id="${field.name}${i}" name="${field.name}${i}">
            ${field.options.map(option => `<option value="${option}">${option}</option>`).join("")}
          </select>
        `;
      } else if (field.type === "checkbox") {
        fieldDiv.innerHTML = `
          <label for="${field.name}${i}">${field.label}:</label>
          <input type="checkbox" id="${field.name}${i}" name="${field.name}${i}">
        `;
      } else if (field.type === "range") {
        fieldDiv.innerHTML = `
          <label for="${field.name}${i}">${field.label}:</label>
          <input type="range" id="${field.name}${i}" name="${field.name}${i}" min="${field.min}" max="${field.max}" step="${field.step}">
        `;
      }

      extraFieldsContainer.appendChild(fieldDiv);
    });

    vehicleConfigDiv.appendChild(extraFieldsContainer);
    container.appendChild(vehicleConfigDiv);
  }
}



// Function to fetch dropdown options from Neo4j
export async function fetchDropdownOptions() {
  const session = driver.session({ database: config.neo4jDatabase });
  
  try {
    // Cypher queries to fetch unique values for each dropdown
    const queries = {
      models: "MATCH (c:cars) RETURN DISTINCT c.Model AS value",
      transmissions: "MATCH (c:cars) RETURN DISTINCT c.Trans AS value",
      driveTypes: "MATCH (c:cars) RETURN DISTINCT c.Drive AS value",
      fuelTypes: "MATCH (c:cars) RETURN DISTINCT c.Fuel AS value",
      emissionsStandards: "MATCH (c:cars) RETURN DISTINCT c.Stnd AS value",
      vehicleClasses: "MATCH (c:cars) RETURN DISTINCT c.Veh_Class AS value",
    };

    const dropdownOptions = {};

    for (const [key, query] of Object.entries(queries)) {
      // Run the query to get distinct values
      const result = await session.run(query);
      dropdownOptions[key] = result.records.map((record) => record.get("value"));
    }

    console.log("Fetched dropdown options:", dropdownOptions);
    return dropdownOptions;
  } catch (error) {
    console.error("Error fetching dropdown options from Neo4j:", error);
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


// Opening the vehicle configuration modal
document.getElementById("openConfigButton").addEventListener("click", function () {
  const modal = document.getElementById("vehicleConfigModal");
  modal.style.display = "block";
  // Initially, show the input fields for capacity and other vehicle data
  document.getElementById("vehicleConfigs").style.display = "block";
  // Store the original field values
  storeOriginalFieldValues();
  // Retrieve the number of vehicles
  const numVehiclesInput = document.getElementById("numVehicles");
  const numVehicles = parseInt(numVehiclesInput.value);
  // Generate the input fields
  generateVehicleConfigFields(numVehicles);
});

// Close the Vehicle Configuration modal when clicking the "Close" button
document.getElementById("closeVehicleConfigModal").onclick = closeVehicleConfigModal;

// Function to store original field values
function storeOriginalFieldValues() {
  originalFieldValues = {};
  // Loop through the fields and store their values
  const numVehiclesInput = document.getElementById("numVehicles");
  const numVehicles = parseInt(numVehiclesInput.value);

  for (let i = 1; i <= numVehicles; i++) {
    // In case you want to store them for revert/undo
    // originalFieldValues[`capacity${i}`] = document.getElementById(`capacity${i}`).value;
  }
}

window.addEventListener("load", function () {
  resetNodes();
  originalFieldValues = {};
});

const numVehiclesInput = document.getElementById("numVehicles");
const maxVehicles = 3; // Set the maximum number of vehicles

// Ensure number of vehicles stays between 0 and 3
numVehiclesInput.addEventListener("input", function () {
  let numVehicles = parseInt(this.value);

  if (numVehicles < 0) {
    numVehicles = 0;
    this.value = numVehicles;
  } else if (numVehicles > maxVehicles) {
    numVehicles = maxVehicles;
    this.value = numVehicles;
  }

  if (numVehicles > 0) {
    document.getElementById("vehicleConfigs").style.display = "block";
    generateVehicleConfigFields(numVehicles);
  } else {
    document.getElementById("vehicleConfigs").style.display = "none";
  }
});

let goRoute = 0;
let vehicleConfigurations = [];

// Create Vehicle in Neo4j
export async function createVehicleInNeo4j(vehicleData) {
  const session = driver.session({ database: config.neo4jDatabase });

  try {
    // Retrieve the current max vehicleID
    const result = await session.run(
      'MATCH (v:Vehicle) RETURN max(v.vehicleID) AS lastVehicleID'
    );
    let lastVehicleID = result.records[0].get('lastVehicleID');
    lastVehicleID = parseInt(lastVehicleID);
    if (isNaN(lastVehicleID)) lastVehicleID = 0;

    const newVehicleID = lastVehicleID + 1;

    //%%% HY567 %%% Update the Cypher query below to include any fields you'd like to store:
    // Example: MERGE (v:Vehicle { vehicleID: $vehicleID, capacity: $capacity, id: $id, model: $model, ...})
    // Adjust property names in Neo4j as needed (just keep them consistent).
    const createVehicleQuery = `
      CREATE (v:Vehicle {
          vehicleID: $vehicleID,
          capacity:  $capacity,
          id:        $id,
          model:     $model,
          displ:     $displ,
          cylinders: $cylinders,
          trans:     $trans,
          drive:     $drive,
          fuel:      $fuel,
          Cert_region:       $Cert_region,
          stnd:              $stnd,
          stnd_description:  $stnd_description,
          Underhood_id:      $Underhood_id,
          veh_class:         $veh_class,
          air_pollution_score: $air_pollution_score,
          city_mpg:          $city_mpg,
          hwy_mpg:           $hwy_mpg,
          cmb_mpg:           $cmb_mpg,
          greenhouse_gas_score: $greenhouse_gas_score,
          smartway:          $smartway,
          price:             $price
      })
      RETURN v
    `;

    // Build parameters from vehicleData
    const parameters = {
      vehicleID:  newVehicleID,
      capacity:   parseInt(vehicleData.capacity) || 1,
      id:         vehicleData.id || "",
      model:      vehicleData.model || "",
      displ:      parseFloat(vehicleData.displ) || 0,
      cylinders:  parseInt(vehicleData.cylinders) || 0,
      trans:      vehicleData.trans || "",
      drive:      vehicleData.drive || "",
      fuel:       vehicleData.fuel || "",
      Cert_region:       vehicleData.Cert_region || "",
      stnd:              vehicleData.stnd || "",
      stnd_description:  vehicleData.stnd_description || "",
      Underhood_id:      vehicleData.Underhood_id || "",
      veh_class:         vehicleData.veh_class || "",
      air_pollution_score: parseFloat(vehicleData.air_pollution_score) || 0,
      city_mpg:          parseFloat(vehicleData.city_mpg) || 0,
      hwy_mpg:           parseFloat(vehicleData.hwy_mpg) || 0,
      cmb_mpg:           parseFloat(vehicleData.cmb_mpg) || 0,
      greenhouse_gas_score: parseFloat(vehicleData.greenhouse_gas_score) || 0,
      smartway:          vehicleData.smartway || "",
      price:             parseFloat(vehicleData.price) || 0
    };

    const createResult = await session.writeTransaction(async tx => {
      return tx.run(createVehicleQuery, parameters);
    });

    console.log("Vehicle created in Neo4j with ID: ", newVehicleID);

  } catch (error) {
    console.error("Error creating vehicle in Neo4j:", error);
    throw error;
  } finally {
    session.close();
  }
}

async function clearAllVehiclesFromDB() {
  const session = driver.session({ database: config.neo4jDatabase });

  //%%% HY567 %%% Provide the correct Cypher query to delete all vehicles in your graph:
  const deleteAllVehiclesQuery = `
    MATCH (v:Vehicle)
    DETACH DELETE v
  `;

  try {
    const result = await session.run(deleteAllVehiclesQuery);
    showMessage("All vehicles deleted successfully", 2);
    console.log("All vehicles deleted from Neo4j:", result.summary.counters);
  } catch (error) {
    console.log("Error deleting vehicles from Neo4j:", error);
  } finally {
    session.close();
  }
}

document.getElementById("vehicleConfigForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const numVehicles = parseInt(document.getElementById("numVehicles").value);

  // Clear previous entries before creating new ones
  await clearAllVehiclesFromDB();

  // Loop through each vehicle and gather inputs
  for (let i = 1; i <= numVehicles; i++) {
    const vehicleData = {
      capacity:         document.getElementById(`capacity${i}`).value,
      id:               document.getElementById(`id${i}`).value,
      model:            document.getElementById(`model${i}`).value,
      displ:            document.getElementById(`displ${i}`).value,
      cylinders:        document.getElementById(`cylinders${i}`).value,
      trans:            document.getElementById(`trans${i}`).value,
      drive:            document.getElementById(`drive${i}`).value,
      fuel:             document.getElementById(`fuel${i}`).value,
      Cert_region:      document.getElementById(`Cert_region${i}`).value,
      stnd:             document.getElementById(`stnd${i}`).value,
      stnd_description: document.getElementById(`stnd_description${i}`).value,
      Underhood_id:     document.getElementById(`Underhood_id${i}`).value,
      veh_class:        document.getElementById(`veh_class${i}`).value,
      air_pollution_score: document.getElementById(`air_pollution_score${i}`).value,
      city_mpg:         document.getElementById(`city_mpg${i}`).value,
      hwy_mpg:          document.getElementById(`hwy_mpg${i}`).value,
      cmb_mpg:          document.getElementById(`cmb_mpg${i}`).value,
      greenhouse_gas_score: document.getElementById(`greenhouse_gas_score${i}`).value,
      smartway:         document.getElementById(`smartway${i}`).value,
      price:            document.getElementById(`price${i}`).value,
    };

    try {
      await createVehicleInNeo4j(vehicleData);
    } catch (error) {
      console.error("Error creating vehicle:", error);
      // If there's an error, optionally break out or continue
      return;
    }
  }

  showMessage("All vehicles created successfully!", 2);
  closeVehicleConfigModal(); // Close the modal after successful submission
});

// Event listener for the "Find Routes (Clingo Reasoner)" button
document.getElementById("findRoutesClingoButton").addEventListener("click", function () {
  // call your Clingo solution method here
  callPythonforClingoExecution();
});

function closeVehicleConfigModal() {
  document.getElementById("vehicleConfigModal").style.display = "none";
}
