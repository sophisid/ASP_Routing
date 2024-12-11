
import {getTextColor,
        showMessage,customAlert} from "./tools.js"
import {driver,clingoRoutingRetrieval,resetNodes,sharedData,nodesConf,availableNodes,availableVehicles,callPythonforClingoExecution} from "./main.js"
import * as config from './configApis/config.js';

let originalFieldValues = {}; // Object to store original field values
let confNumVeh=0;

// Function to generate input fields 
function generateVehicleConfigFields(numVehicles) {
  // Clear any previous vehicle configuration form elements
  document.getElementById("vehicleConfigs").innerHTML = "";

  // Create input fields for each vehicle
  for (let i = 1; i <= numVehicles; i++) {
    const vehicleConfigDiv = document.createElement("div");
    vehicleConfigDiv.className = "vehicle-config";
    vehicleConfigDiv.innerHTML = `
    <div class="separator"></div>
    <div class="label">Vehicle ${i} Configuration:</div>
    <div class="form-group">
      <label for="capacity${i}">
        Total amount to handle:      
        <div class="tooltip">
          <i class="fas fa-info-circle"></i>
          <span class="tooltiptext">
            The capacity of the vehicle determines the maximum load it can handle.
          </span>
        </div>
      </label>
      <input type="number" id="capacity${i}" name="capacity${i}" required min="0" value="1">
    </div>
  `;
  

    document.getElementById("vehicleConfigs").appendChild(vehicleConfigDiv);
  }
}

// opening the vehicle configuration modal
document.getElementById("openConfigButton").addEventListener("click", function () {
  const modal = document.getElementById("vehicleConfigModal");
  modal.style.display = "block";
  // Initially, show the input fields for capacity and time window as editable
  document.getElementById("vehicleConfigs").style.display = "block";
  // Store the original field values
  storeOriginalFieldValues();
  // Retrieve the number of vehicles
  const numVehiclesInput = document.getElementById("numVehicles");
  const numVehicles = parseInt(numVehiclesInput.value);
  // Generate the input fields based on the number of vehicles and available nodes
  generateVehicleConfigFields(numVehicles, availableNodes);
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
    originalFieldValues[`capacity${i}`]         = document.getElementById(`capacity${i}`).value;
  }
}
window.addEventListener("load", function () {
  resetNodes();
  //resetVehicleConfigForm();
  originalFieldValues = {};
});

const numVehiclesInput = document.getElementById("numVehicles");
const maxVehicles = 3; // Set the maximum number of vehicles

// initial function when opening the vehicle config window
numVehiclesInput.addEventListener("input", function () {
  let numVehicles = parseInt(this.value);

  // Check if the number of vehicles exceeds the maximum
  if (numVehicles < 0) {
    numVehicles = 0; // Set to 0 if the value is negative
    this.value = numVehicles; // Update the input field value
  } else if (numVehicles > maxVehicles) {
    numVehicles = maxVehicles; // Limit the number of vehicles to the maximum
    this.value = numVehicles; // Update the input field value
  }
 
  if (numVehicles > 0) {
    // Show the input fields for capacity, time window, and end node selection
    document.getElementById("vehicleConfigs").style.display = "block";
    // Generate the input fields based on the number of vehicles and available nodes
    generateVehicleConfigFields(numVehicles, availableNodes);
  } else {
    // Hide the input fields if the number of vehicles is not valid
    document.getElementById("vehicleConfigs").style.display = "none";
  }
});

let goRoute=0;
let vehicleConfigurations = [];


export async function createVehicleInNeo4j(capacity) {
  const session = driver.session({ database: config.neo4jDatabase });

  try {
    const result = await session.run(
      'MATCH (v:Vehicle) RETURN max(v.vehicleID) AS lastVehicleID'
    );

    let lastVehicleID = result.records[0].get('lastVehicleID');
    lastVehicleID = parseInt(lastVehicleID);
    if (isNaN(lastVehicleID)) lastVehicleID = 0;

    const newVehicleID = lastVehicleID + 1;

    //%%% HY567 %%% Add cypher query for Vehicle creation.
    const createVehicleQuery = `


    `;
    const parameters = {
      vehicleID:    newVehicleID,
      capacity:     parseInt(capacity),
    };

    await session.writeTransaction(async tx => {
      await tx.run(createVehicleQuery, parameters);
    });

    console.log("Vehicle created in Neo4j with ID: ", newVehicleID);

  } catch (error) {
    console.error("Error creating vehicle in Neo4j:", error);
  } finally {
    session.close();
  }
}


async function clearAllVehiclesFromDB() {
  const session = driver.session({ database: config.neo4jDatabase });

  
  

  const deleteAllVehiclesQuery = "";  //%%% HY567 %%% Add cypher query for Vehicle deletion.

  try {
    const result = await session.run(deleteAllVehiclesQuery);
    showMessage("All vehicles deleted successfully", 2);
    console.log("All vehicles deleted from Neo4j:", result.summary.counters.nodesDeleted);
  } catch(error) {
    console.log("Error deleting vehicles from Neo4j:", error);
  } finally {
    session.close();
  }
}

document.getElementById("vehicleConfigForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const numVehicles = parseInt(document.getElementById("numVehicles").value);

  await clearAllVehiclesFromDB();  // Clear previous entries before creating new ones

  for (let i = 1; i <= numVehicles; i++) {
    const capacity = parseInt(document.getElementById(`capacity${i}`).value);
    try {
      await createVehicleInNeo4j(capacity); // Sequentially create vehicles
    } catch (error) {
      console.error("Error creating vehicle:", error);
      return;  // Exit if there's an error to avoid creating inconsistent data
    }
  }

  showMessage("All vehicles created successfully!", 2);
  closeVehicleConfigModal(); // Close the modal after successful submission
});



// Event listener for the "Calculate Route" button (using Clingo)
document.getElementById("findRoutesClingoButton").addEventListener("click", function () {
  console.log("CLINGO FIND ROUTES\n\nconfNumVeh: ", confNumVeh, "\ngoRoute: ", goRoute, "\navailableVehicles: ", availableVehicles);



    //clingoRoutingRetrieval(vehicleConfigurations);
      callPythonforClingoExecution();
      //showMessage("Add call to python+clingo", 2);





});


function closeVehicleConfigModal() {
  document.getElementById("vehicleConfigModal").style.display = "none";
}
