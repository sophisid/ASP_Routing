import {nodesMarkerConf,driver,resetNodes,updateMarkersOnMap,sharedData,
  loadNodesFromNeo4j,loadVehiclesFromNeo4j,nodesConf} from "./main.js"
import {showMessage} from './tools.js';
import * as config from './configApis/config.js';


// Event listener for the "Delete All Nodes" button
// document.getElementById("deleteAllNodesButton").addEventListener("click", deleteAllNodesWithConfirmation);
document.getElementById("deleteAllNodesButton").addEventListener("click", openDeleteNodeConfirmationPopup);

function openDeleteNodeConfirmationPopup() {
document.getElementById("deleteNodeConfirmationPopup").style.display = "block";
}
function closeDeleteNodeConfirmationPopup() {
document.getElementById("deleteNodeConfirmationPopup").style.display = "none";
}
// Delete node confirmation
document.getElementById("confirmNodeDeleteAction").onclick = function() {
deleteAllNodes();
closeDeleteNodeConfirmationPopup(); // Close popup
};

// Close the modal when the user clicks the close button or cancel button
document.querySelector(".custom-close-button").onclick = closeDeleteNodeConfirmationPopup;
document.getElementById("cancelNodeDeleteAction").onclick = closeDeleteNodeConfirmationPopup;
// Event listener to open the Node Deletion modal
document.getElementById("deleteAllNodesButton").addEventListener("click", function() {
  document.getElementById("deleteNodeConfirmationPopup").style.display = "block";
});

// Event listener to open the Vehicle Deletion modal
document.getElementById("deleteAllVehiclesButton").addEventListener("click", function() {
  document.getElementById("deleteConfirmationPopup").style.display = "block";
});

// Event listener for the close button on the Node Deletion modal
document.querySelector("#deleteNodeConfirmationPopup .custom-close-button").addEventListener("click", function() {
  document.getElementById("deleteNodeConfirmationPopup").style.display = "none";
});

// Event listener for the close button on the Vehicle Deletion modal
document.querySelector("#deleteConfirmationPopup .custom-close-button").addEventListener("click", function() {
  document.getElementById("deleteConfirmationPopup").style.display = "none";
});

// Function to delete all nodes from the map and Neo4j database
export async function deleteAllNodes() {
console.log("Starting deleteAllNodes function");

// Remove all markers from the map
nodesMarkerConf.nodeMarkers.forEach(marker => marker.remove());
nodesMarkerConf.nodeMarkers.length = 0;

const session = driver.session({ database: config.neo4jDatabase });
 // Cypher query for deleting Nodes
const deleteAllNodesQuery = "MATCH (n:Node) DETACH DELETE n";

try {
const result = await session.run(deleteAllNodesQuery);
showMessage("All stops deleted successfully", 2);
console.log("All nodes deleted from Neo4j:", result.summary.counters.nodesDeleted);

resetNodes();          // Clear available nodes
loadNodesFromNeo4j();   // Refresh nodes and map markers
} catch (error) {
console.error("Error deleting nodes from Neo4j:", error);
} finally {
session.close();
}
}

// Functions to open and close the custom modal
function openDeleteConfirmationPopup() {
document.getElementById("deleteConfirmationPopup").style.display = "block";
}

function closeDeleteConfirmationPopup() {
document.getElementById("deleteConfirmationPopup").style.display = "none";
}

// Event listener for the "Delete All Vehicles" button to open the modal
document.getElementById('deleteAllVehiclesButton').addEventListener("click", openDeleteConfirmationPopup);

// Close the modal when the user clicks the close button or cancel button
document.querySelector(".custom-close-button").onclick = closeDeleteConfirmationPopup;
document.getElementById("cancelDeleteAction").onclick = closeDeleteConfirmationPopup;

// Confirm deletion and close the modal
document.getElementById("confirmDeleteAction").onclick = function() {
deleteAllVehicles();
closeDeleteConfirmationPopup();
};


export async function deleteAllVehicles() {
// Delete all vehicles from Neo4j database
const session = driver.session({ database: config.neo4jDatabase });

//Cypher query for deleting Vehicle
//const deleteAllVehiclesQuery = "";
try {
//const result = await session.run(deleteAllVehiclesQuery);
showMessage("All vehicles deleted successfully", 2);
// console.log("All vehicles deleted from Neo4j:", result.summary.counters.nodesDeleted);
//resetVehicleConfigForm();
} catch(error) {
console.log("Error deleting vehicles from Neo4j:", error);
} finally {
session.close();
}
}

