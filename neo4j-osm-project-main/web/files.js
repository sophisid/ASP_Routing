import {createNodeInNeo4j,loadNodesFromNeo4j,loadVehiclesFromNeo4j,driver,nodesMarkerConf} from "./main.js"
import {createVehicleInNeo4j} from "./vehicleConf.js";
import { deleteAllNodes, deleteAllVehicles } from "./actions.js";
import { showMessage } from "./tools.js";
import * as config from './configApis/config.js';

// Event listener for the "Import Nodes CSV" button
// document.getElementById("importNodesButton").addEventListener("click", () => {
//   // Clear the file input by resetting its value
//   document.getElementById("importNodesFileInput").value = "";
//   // Trigger the click event on the hidden file input element
//   document.getElementById("importNodesFileInput").click();
// });
// Event listener for the "Import Vehicles CSV" button
// document.getElementById("importVehiclesButton").addEventListener("click", () => {
//   // Clear the file input by resetting its value
//   document.getElementById("importVehiclesFileInput").value = "";
//   // Trigger the click event on the hidden file input element
//   document.getElementById("importVehiclesFileInput").click();
// });

// Event listener for the file input element
// document.getElementById("importNodesFileInput").addEventListener("change", handleNodesFileImport);
// // Event listener for the file input element
// document.getElementById("importVehiclesFileInput").addEventListener("change", handleVehiclesFileImport);

// Function to handle the selected CSV file (nodes)
// export function handleNodesFileImport(event) {
//   const file = event.target.files[0];
//   if (file) {
//     const reader = new FileReader();
//     reader.onload = handleNodesFileContents;
//     reader.readAsText(file);
//   }
// }
// Function to handle the selected CSV file (vehicles)
// export function handleVehiclesFileImport(event) {
//   const file = event.target.files[0];
//   if (file) {
//     const reader = new FileReader();
//     reader.onload = handleVehiclesFileContents;
//     reader.readAsText(file);
//   }
// }

// Function to display the confirmation modal to delete all the nodes
function showConfirmationModal() {
  return new Promise((resolve) => {
    const modal             = document.getElementById("confirmationDeleteModal");
    // const modalMessage      = document.getElementById("confirmationModalMessage");
    const confirmDeleteBtn  = document.getElementById("confirmDeleteBtn");
    const cancelDeleteBtn   = document.getElementById("cancelDeleteBtn");

    // modalMessage.textContent = message;
    modal.style.display = "block";

    // Event listener for the confirm delete button
    confirmDeleteBtn.addEventListener("click", () => {
      modal.style.display = "none";
      resolve(true); // Resolve with true when confirmed
    });

    // Event listener for the cancel delete button
    cancelDeleteBtn.addEventListener("click", () => {
      modal.style.display = "none";
      resolve(false); // Resolve with false when canceled
    });
  });
}

// Function to handle the contents of the imported CSV file (nodes)
export async function handleNodesFileContents(event) {
  const csvContent = event.target.result;
  const lines = csvContent.split(/\n/);

  // confirm if user wants to deleted previous nodes before adding new
  // if not, exit
  const confirmed = await showConfirmationModal();
  if (!confirmed) {
    return;
  }
  await deleteAllNodes();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const [name, latitude, longitude, streetName, streetNumber, nodeColor, startTime, rawEndTime] = line.split(",");

    // Trim the endTime and handle "null" or "null\r"
    let endTime = rawEndTime.trim();
    if (endTime === 'null' || endTime === 'null\r' || endTime === 'null\r\n') {
        endTime = null;
    }

    if (name && latitude && longitude) {
      console.log("Extracted data:", name, latitude, longitude);
      createNodeInNeo4j(name, latitude, longitude, streetName, streetNumber, nodeColor, startTime, endTime);
    }
  }
  loadNodesFromNeo4j();
}
// Function to handle the contents of the imported CSV file (vehicles)
export async function handleVehiclesFileContents(event) {
  const csvContent = event.target.result;
  const lines = csvContent.split(/\n/);

  var regex = /("[^"]+"|[^,]+)*,/g;

  await deleteAllVehicles();
  
  try {
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const [vehicleID, capacity, startNode, endNode, startTime, rawEndTime] = line.split(",");

      // Check if rawEndTime is not null or undefined before trimming
      let endTime = rawEndTime ? rawEndTime.trim() : null;
      // Handle "null" string explicitly
      if (endTime === 'null' || endTime === 'null\r' || endTime === 'null\r\n') {
          endTime = null;
      }

      console.log("rawEndTime: ", rawEndTime);
      console.log('endTime: ',endTime);

      if (vehicleID && capacity) {
        console.log("Extracted data:", vehicleID, capacity);
        await createVehicleInNeo4j(
          vehicleID, capacity, 
          ((startNode && startNode  !== "null" && startNode !== null) ? startNode : ""), 
          ((endNode   && endNode    !== "null" && endNode   !== null) ? endNode   : ""), 
          ((startTime && startTime  !== "null" && startTime !== null) ? startTime : null), 
          ((endTime   && endTime    !== "null" && endTime   !== null) ? endTime   : null)
        );
      }
    }
    console.log("All vehicles created successfully");
    showMessage("All vehicles created successfully!", 2);
    loadVehiclesFromNeo4j();  // now load them for the routing service
  } catch (error) {
    console.error("Error creating vehicles:", error);
  }
  // loadVehiclesFromNeo4j(); TODO ?
}

// Event listener for the "Export Nodes CSV" button
// document.getElementById("exportNodesButton").addEventListener("click", exportNodesToCSV);
// // Event listener for the "Export Nodes CSV" button
// document.getElementById("exportVehiclesButton").addEventListener("click", exportVehiclesToCSV);

// Function to fetch nodes from Neo4j and export them as CSV
async function exportNodesToCSV() {
  let session;

  try {
    session = driver.session({ database: config.neo4jDatabase });
    const query = `
      MATCH (n:Node)
      RETURN n.streetName AS streetName, n.latitude AS latitude, n.longitude AS longitude, n.streetNumber AS streetNumber, n.name AS name, n.nodeColor AS nodeColor, n.startTime AS startTime, n.endTime AS endTime
    `;
    const result = await session.run(query);
    const nodes = result.records.map(record => record.toObject());
    const csvContent = processNodesForCSV(nodes);
    downloadCSVFile(csvContent);
  } catch (error) {
    console.error("Error fetching nodes from Neo4j:", error);
  } finally {
    if (session) {
      session.close();
    }
  }
}
// Function to fetch vehicles from Neo4j and export them as CSV
async function exportVehiclesToCSV() {
  let session;

  try {
    session = driver.session({ database: config.neo4jDatabase });
    const query = `
      MATCH (v:Vehicle)
      RETURN v.vehicleID AS vehicleID, v.capacity AS capacity, v.startNode AS startNode, v.endNode as endNode, v.startTime AS startTime, v.endTime AS endTime
    `;
    const result = await session.run(query);
    const vehicles = result.records.map(record => record.toObject());
    const csvContent = processVehiclesForCSV(vehicles);
    downloadCSVFile(csvContent);
  } catch (error) {
    console.error("Error fetching vehicles from Neo4j:", error);
  } finally {
    if (session) {
      session.close();
    }
  }
}

// Function to process nodes and create CSV content
function processNodesForCSV(nodes) {
  let csvContent = "name,latitude,longitude,streetName,streetNumber,nodeColor,startTime,endTime\n";
  for (const node of nodes) {
    const cleanedNodeColor = node.nodeColor.trim(); // Trim whitespace
    csvContent += `${node.name},${node.longitude},${node.latitude},${node.streetName},${node.streetNumber},${cleanedNodeColor},${node.startTime},${node.endTime}\n`;
  }
  return csvContent;
}
// Function to process vehicles and create CSV content
function processVehiclesForCSV(vehicles) {
  let csvContent = "vehicleID,capacity,startNode,endNode,startTime,endTime\n";
  for (const veh of vehicles) {
    csvContent += `${veh.vehicleID},${veh.capacity},${veh.startNode},${veh.endNode},${veh.startTime},${veh.endTime}\n`;
  }
  return csvContent;
}

// Function to trigger the download of the CSV file
function downloadCSVFile(csvContent) {
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (csvContent.includes("vehicleID") ? "vehicles_export.csv" : "nodes_export.csv");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// document.getElementById("saveGeoJSONButton").addEventListener("click", () => {
//   const geojsonFeatures = nodesMarkerConf.nodeMarkers.map(marker => {
//     const { lat, lng } = marker.getLatLng();
//     const streetName = marker.options.streetName || "";
//     const streetNumber = marker.options.streetNumber || "";
//     const name = marker.options.name || "";
//     const nodeColor = marker.options.nodeColor || "";
//     const startTime = marker.options.startTime || "";
//     const endTime = marker.options.endTime || "";
//     return {
//       type: "Feature",
//       geometry: {
//         type: "Point",
//         coordinates: [lng, lat],
//       },
//       properties: {
//         streetName,
//         latitude: lat,
//         longitude: lng,
//         streetNumber,
//         name,
//         nodeColor,
//         startTime,
//         endTime,
//       },
//     };
//   });

//   // Create a GeoJSON FeatureCollection with the features
//   const geojsonFeatureCollection = {
//     type: "FeatureCollection",
//     features: geojsonFeatures,
//   };
//   // Convert the GeoJSON data to a Blob
//   const blob = new Blob([JSON.stringify(geojsonFeatureCollection)], {
//     type: "application/json",
//   });
//   // Create a new File object from the Blob
//   const file = new File([blob], "nodes.geojson");
//   // Use the File API to save the data to the "nodes.geojson" file
//   const a = document.createElement("a");
//   a.href = URL.createObjectURL(file);
//   a.download = file.streetName;
//   document.body.appendChild(a);
//   a.click();
//   document.body.removeChild(a);
//   console.log("File download initiated.");
// });
  