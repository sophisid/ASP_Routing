import * as config from './configApis/config.js';
import {
  showMessage,
  getIconClass,
  getSurfaceType,
  checkIfmyNodeNameIsUnique,
  customAlert,
  isMarkerEqual,
} from "./tools.js";
import * as mapConfig from "./mapConfig.js";

import {} from "./vehicleConf.js";
import {} from "./clingoConf.js";

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
          * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

const DISTANCE_THRESHOLD = 0.05; // e.g. 50 meters

function getNearestRoad(lat, lng) {
  const nominatimURL = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
  return fetch(nominatimURL)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data && data.address && data.address.road) {
        return {
          road: data.address.road,
          lat: parseFloat(data.lat),
          lon: parseFloat(data.lon)
        };
      }
      return null;
    })
    .catch(error => {
      console.error("Error fetching nearest road:", error);
      return null;
    });
}


export var driver = neo4j.driver(
  config.neo4jUrl,
  neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword)
);

let currentRoute=[];
let arrow=[];
export const nodesConf = {};
export let availableNodes = [];
export let availableVehicles = [];
export const nodesMarkerConf = {
  nodeMarkers: [],
};
let specificLogOutput = '';
export const sharedData = {};

// Initialize Leaflet map
const map = L.map("map", { zoomControl: false }).setView([35.337539, 25.1640211], 20);
L.control.zoom({ position: "bottomright" }).addTo(map);

const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

export function createNodeInNeo4j(name, latitude, longitude, nodeColor, people) {
  console.log(`[DEBUG] createNodeInNeo4j -> Creating node in UI only: ${name}`);
  
  const iconClass = getIconClass(nodeColor);
  const marker = L.marker([latitude, longitude], {
    icon: mapConfig.redIcon, // or use iconClass if needed
    name,
    nodeColor,
    people: people || 0,
  })
    .addTo(map)
    .bindPopup(`${name} - People waiting: ${people}`)
    .bindTooltip(`<strong>Stop Name:</strong> ${name}`);

  nodesMarkerConf.nodeMarkers.push(marker);
}

// ---------------------------------------------------------
// Load Nodes from Neo4j
// ---------------------------------------------------------
export function loadNodesFromNeo4j() {
  nodesMarkerConf.nodeMarkers = nodesMarkerConf.nodeMarkers.filter(marker => {
    if (marker.options.isStatic) {
      return true;
    } else {
      map.removeLayer(marker);
      return false;
    }
  });

  const session = driver.session({ database: config.neo4jDatabase });
  const fetchNodesQuery = `
    MATCH (n:Node)
    RETURN n.name AS name,
           n.latitude AS latitude,
           n.longitude AS longitude,
           n.nodeColor AS nodeColor,
           n.people AS people
  `;

  session.run(fetchNodesQuery)
    .then(result => {
      const records = result.records;
      const nodes = records.map(rec => ({
        latitude: rec.get("latitude"),
        longitude: rec.get("longitude"),
        name: rec.get("name"),
        nodeColor: rec.get("nodeColor"),
        people: rec.get("people") || 0,
      }));

      nodes.forEach(node => {
        if (!isNaN(node.latitude) && !isNaN(node.longitude)) {
          let icon;
          switch (node.nodeColor) {
            case "yellow": icon = mapConfig.yellowIcon; break;
            case "green":  icon = mapConfig.greenIcon;  break;
            case "orange": icon = mapConfig.orangeIcon; break;
            case "blue":   icon = mapConfig.blueIcon;   break;
            case "violet": icon = mapConfig.violetIcon; break;
            default:       icon = mapConfig.redIcon;    break;
          }

          const marker = L.marker([node.latitude, node.longitude], {
            icon,
            name: node.name,
            nodeColor: node.nodeColor,
            people: node.people,
          })
            .addTo(map)
            .bindPopup(`${node.name} - People waiting: ${node.people}`)
            .bindTooltip(`<strong>Stop Name:</strong> ${node.name}<br/><strong>Waiting:</strong> ${node.people}`);

          // Avoid duplicates
          if (!nodesMarkerConf.nodeMarkers.some(m => isMarkerEqual(m, marker))) {
            nodesMarkerConf.nodeMarkers.push(marker);
          }
        }
      });

      availableNodes = nodes;
    })
    .catch(error => {
      console.error("Error fetching nodes from Neo4j:", error);
    })
    .finally(() => {
      session.close();
    });
}

// ---------------------------------------------------------
// Load Vehicles from Neo4j
// ---------------------------------------------------------
export function loadVehiclesFromNeo4j() {
  return new Promise((resolve, reject) => {
    const session = driver.session({ database: config.neo4jDatabase });
    const fetchVehiclesQuery = `MATCH (v:Vehicle) RETURN v`;

    session.run(fetchVehiclesQuery)
      .then(result => {
        if (!result.records.length) {
          console.log("No vehicles found in the database.");
          // Optionally call /checkonload
          fetch('http://localhost:3000/neo4j/checkonload')
            .then(response => {
              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
              }
              return response.json();
            })
            .then(() => {
              resolve([]); 
            })
            .catch(error => {
              console.error("Error in checkonload:", error);
              reject(error);
            });
        } else {
          const vehicles = result.records.map(record => {
            const node = record.get("v");
            // Retrieve relevant properties
            const { vehicleID, capacity, model, price } = node.properties;
            return { vehicleID, capacity, model, price };
          });
          console.log("[DEBUG] Loaded vehicles from DB:", vehicles);
          resolve(vehicles);
        }
      })
      .catch(error => {
        console.error("Error fetching vehicles from Neo4j:", error);
        reject(error);
      })
      .finally(() => {
        session.close();
      });
  });
}

// ---------------------------------------------------------
// updateMarkersOnMap()
// ---------------------------------------------------------
export function updateMarkersOnMap() {
  // Remove all markers from the map
  map.eachLayer(layer => {
    if (layer instanceof L.Marker) {
      map.removeLayer(layer);
    }
  });
  // Re-add markers from nodeMarkers
  nodesMarkerConf.nodeMarkers.forEach(marker => {
    marker.addTo(map);
  });
}

// ---------------------------------------------------------
// Creating a Node on Map Click with Debounce
// ---------------------------------------------------------
const modal = document.getElementById("customModal");
export let nearestHighway;

function debounce(func, delay) {
  let inDebounce;
  return function(...args) {
    clearTimeout(inDebounce);
    inDebounce = setTimeout(() => func.apply(this, args), delay);
  };
}

map.on("click", debounce(function(e) {
  const { lat, lng } = e.latlng;
  console.log(`Map clicked at: ${lat}, ${lng}`);

  getSurfaceType(lat, lng)
    .catch(err => {
      console.warn("Surface Type not found:", err);
      return null;
    })
    .then(() => getNearestRoad(lat, lng))
    .then(nearestRoadData => {
      if (!nearestRoadData) {
        customAlert("Stop creation is only allowed on roads.");
        return;
      }

      const nearestRoad = nearestRoadData.road;
      const adjustedLat = nearestRoadData.lat;
      const adjustedLng = nearestRoadData.lon;

      const distance = calculateDistance(lat, lng, adjustedLat, adjustedLng);
      console.log(`Distance to nearest road: ${distance.toFixed(3)} km`);

      if (distance <= DISTANCE_THRESHOLD) {
        // Show the modal
        modal.style.display = "block";
        // nearestHighwaySpan is presumably an element in your HTML
        nearestHighwaySpan.textContent = `at "${nearestRoad}"`;

        // Modal inputs
        const nameInput = document.getElementById("name");
        const peopleInput = document.getElementById("peopleCount");
        const colorInput = document.getElementById("color");
        const createNodeButton = document.getElementById("createNodeButton");

        createNodeButton.onclick = function() {
          const name = nameInput.value.trim();
          const people = parseInt(peopleInput.value) || 0;
          const nodeColor = colorInput.value.trim();

          if (!name) {
            customAlert("Please fill the stop name.");
            return;
          }
          closeModal(modal);

          // Reverse geocode once more if needed
          fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${adjustedLat}&lon=${adjustedLng}&zoom=18&addressdetails=1`)
            .then(response => response.json())
            .then(data => {
              if (data && data.address) {
                const session = driver.session({ database: config.neo4jDatabase });
                const storeNodeQuery = `
                  MERGE (n:Node {
                    latitude: $latitude,
                    longitude: $longitude,
                    name: $nodeName,
                    nodeColor: $nodeColor,
                    people: $people
                  })
                `;
                session.run(storeNodeQuery, {
                  latitude: adjustedLat,
                  longitude: adjustedLng,
                  nodeName: name,
                  nodeColor,
                  people,
                })
                  .then(() => {
                    console.log(`Node created in Neo4j: ${name}`);
                    L.marker([adjustedLat, adjustedLng], { icon: mapConfig.redIcon })
                      .addTo(map)
                      .bindPopup(`Street: ${nearestRoad}<br>Node: ${name}<br>Color: ${nodeColor}<br>People: ${people}`);
                  })
                  .catch(error => {
                    console.error("Error creating node in Neo4j:", error);
                  })
                  .finally(() => {
                    session.close();
                  });
              } else {
                customAlert("No address info found here. Node creation is not allowed.");
              }
            })
            .catch(error => {
              console.error("Error fetching address data:", error);
            });
        };

        // Close button
        const closeButton = document.getElementsByClassName("close")[0];
        closeButton.onclick = function() {
          nameInput.value = "";
          colorInput.value = "";
          closeModal(modal);
        };
      } else {
        customAlert("Stop creation is only allowed within 50 meters of a road.");
      }
    })
    .catch(error => {
      console.error("Error processing road data:", error);
    });
}, 250));

function closeModal(m) {
  m.style.display = "none";
}

// ---------------------------------------------------------
// Clingo Execution Helpers
// ---------------------------------------------------------
export function callPythonforClingoExecution() {
  showMessage("Do not execute Python Script from here. Run it as a standalone program!", 2);
}

export function createRelationshipsBetweenNodes(nodes) {
  if (!nodes || nodes.length < 2) {
    console.error("At least two nodes are required to create relationships.");
    return;
  }
  const session = driver.session({ database: config.neo4jDatabase });
  const promises = [];

  for (let i = 0; i < nodes.length - 1; i++) {
    const currentNode = nodes[i];
    const nextNode = nodes[i + 1];
    const relationshipQuery = `
      MATCH (a:Node {name: $currentNodeName}), (b:Node {name: $nextNodeName})
      MERGE (a)-[r:CONNECTED_TO {vehicleName: $vehicleName}]->(b)
      RETURN r
    `;
    const params = {
      currentNodeName: currentNode.node.name,
      nextNodeName: nextNode.node.name,
      vehicleName: currentNode.vehicleName,
    };
    promises.push(session.run(relationshipQuery, params));
  }

  Promise.all(promises)
    .then(results => {
      console.log("Relationships created successfully:", results.length);
    })
    .catch(error => {
      console.error("Error creating relationships:", error);
    })
    .finally(() => {
      session.close();
    });
}

// The modal for Clingo timeout
var clingoTimeoutWindow = document.getElementById("clingoTimeoutModal");

export function clingoRoutingRetrieval(vehicleConfig) {
  const visitedNodes = [];
  console.log("[DEBUG] clingoRoutingRetrieval -> vehicleConfig:", vehicleConfig);

  const busStops = nodesMarkerConf.nodeMarkers.map((marker, idx) => ({
    id: idx + 2,
    latitude: marker.getLatLng().lat,
    longitude: marker.getLatLng().lng,
    name: marker.options.name,
  }));

  clingoTimeoutWindow.style.display = "block";

  // If you want to pass the vehicleConfig to the server:
  const queryParams = new URLSearchParams();
  queryParams.append("vehicleConfig", JSON.stringify(vehicleConfig));

  fetch(`http://localhost:3000/neo4j/runPythonScript`)
    .then(response => {
      if (!response.ok) {
        if (response.status === 404) throw new Error('404, Not Found');
        if (response.status === 500) throw new Error('500, Internal Server Error');
        if (response.status === 504) throw new Error('504, Clingo script timed out!');
        throw new Error(response.status);
      }
      clingoTimeoutWindow.style.display = "none";
      return response.json();
    })
    .then(data => {
      console.log("[DEBUG] Clingo route data:", data);
    })
    .catch(error => {
      clingoTimeoutWindow.style.display = "none";
      if (error.message.includes('Clingo retrieval process stopped')) {
        console.log('User manually stopped Clingo script.');
        customAlert('Clingo script execution was stopped by the user.');
      } else {
        console.error(`Error calling 'runPythonScript': ${error}`);
        customAlert(`Error calling 'runPythonScript': ${error}`);
      }
    });
}

// Stop Clingo logic
document.getElementById("clingoStopBtn").addEventListener("click", function() {
  fetch('http://localhost:3000/neo4j/stopPythonScript')
    .then(response => response.text())
    .then(data => {
      console.log(data);
      document.getElementById('clingoTimeoutModal').style.display = 'none';
      customAlert("Clingo retrieval stopped successfully!", 2);
    })
    .catch(error => {
      console.error('Error stopping Clingo script:', error);
      customAlert('Error stopping script. Please try again.', 2);
    });
});

// ---------------------------------------------------------
// 11) resetNodes()
// ---------------------------------------------------------
export function resetNodes() {
  const session = driver.session({ database: config.neo4jDatabase });

  const deleteAllNodesQuery = `MATCH (n:Node) DETACH DELETE n`;
  const deleteAllRelationshipsQuery = `MATCH ()-[r]->() DELETE r`;
  const updateNodeColorQuery = `
    MATCH (n:Node)
    SET n.nodeColor = 'red'
    REMOVE n.vehicleName
  `;

  session.run(deleteAllNodesQuery)
    .then(() => {
      console.log("All (Node) deleted successfully.");
      return session.run(deleteAllRelationshipsQuery);
    })
    .then(() => {
      console.log("All relationships deleted successfully.");
      return session.run(updateNodeColorQuery);
    })
    .then(() => {
      console.log("Node colors updated to red and vehicleName removed.");
      return loadVehiclesFromNeo4j();
    })
    .then(() => {
      console.log("Vehicles reloaded successfully.");
    })
    .catch(error => {
      console.error("Error during resetNodes:", error);
      customAlert("Error setting up Neo4j driver. Check your configurations.");
    })
    .finally(() => {
      session.close();
    });
}

// ---------------------------------------------------------
// 12) Closing Custom Modals
// ---------------------------------------------------------
document.getElementById('closeCustomModal').addEventListener('click', function () {
  var customModal = document.getElementById('customModal');
  customModal.style.display = 'none';
});

document.getElementById('closeVehicleConfigModal').addEventListener('click', function () {
  var vehicleConfigModal = document.getElementById('vehicleConfigModal');
  vehicleConfigModal.style.display = 'none';
});

// ---------------------------------------------------------
// 13) Page Load: Button Groups
// ---------------------------------------------------------
document.addEventListener("DOMContentLoaded", function () {
  const actionsButton      = document.getElementById("actions-button");
  const findRoutesButton   = document.getElementById("findroutes-button");
  const actionsButtonGroup = document.getElementById("actions-button-group");
  const findRoutesButtonGroup = document.getElementById("findroutes-button-group");

  actionsButton.addEventListener("mouseenter", () => {
    actionsButtonGroup.style.display = "block";
  });
  actionsButtonGroup.addEventListener("mouseleave", () => {
    actionsButtonGroup.style.display = "none";
  });

  findRoutesButton.addEventListener("mouseenter", () => {
    findRoutesButtonGroup.style.display = "block";
  });
  findRoutesButtonGroup.addEventListener("mouseleave", () => {
    findRoutesButtonGroup.style.display = "none";
  });
  resetNodes();
});

const actionsButtonGroup = document.getElementById('actions-button-group');
document.getElementById('deleteAllNodesButton').addEventListener('click', () => {
  actionsButtonGroup.style.display = 'none';
  // Possibly call resetNodes() or do something else
});

const findRoutesButtonGroup = document.getElementById('findroutes-button-group');
document.getElementById('findRoutesClingoButton').addEventListener('click', async () => {
  findRoutesButtonGroup.style.display = 'none';
  try {
    const vehicles = await loadVehiclesFromNeo4j();
    clingoRoutingRetrieval(vehicles);
  } catch (error) {
    console.error("Error loading vehicles:", error);
  }
});
