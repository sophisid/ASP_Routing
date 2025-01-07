import * as config from './configApis/config.js';
import {showMessage,getIconClass,getSurfaceType,
        checkIfmyNodeNameIsUnique,customAlert,isMarkerEqual} from "./tools.js";
import * as mapConfig from "./mapConfig.js";
import {} from "./vehicleConf.js"
import {} from "./clingoConf.js"

// Function to calculate the distance between two geographical points using the Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in kilometers
  return distance;
}

const DISTANCE_THRESHOLD = 0.05; // Define a threshold distance in kilometers (e.g., 50 meters)
//version 3:23pm
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


// Function to create a Neo4j driver
export var driver = neo4j.driver(
  config.neo4jUrl,
  neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword),
);

let currentRoute=[]; // Store the reference to the current route
let arrow=[];
export const nodesConf = {
  
};
export let availableNodes = [];
export let availableVehicles = [];
export const nodesMarkerConf = {
  nodeMarkers : [],
};
let specificLogOutput = '';     
export const sharedData = {
  
};


//%%% HY567 %%% If you wish to change the map, modify the following setView coordinates.
// Be aware that clingo does not recognize greek and some other characters - if you need to use them in clingo,
// you will have to parse them first; but most probably you will not need them for reasoning (just the ID of 
// nodes will be sufficient)


// const map = L.map("map", { zoomControl: false }).setView([35.338735, 25.144213], 13);
const map = L.map("map", { zoomControl: false }).setView([48.208538, 16.373590], 14);

L.control
  .zoom({
    position: "bottomright",
  })
  .addTo(map);

const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);



// Function to create a node in Neo4j using the provided data
export function createNodeInNeo4j(name, latitude, longitude, nodeColor) { 
  console.log(`Node ${name} was not saved in the database. Only UI update.`);
  
  const iconClass = getIconClass(nodeColor);
  const marker = L.marker([latitude, longitude], {
      icon: mapConfig.redIcon, 
      name: name,
      nodeColor: nodeColor,
  }).addTo(map)
    .bindPopup(name)
    .bindTooltip(`<strong>Stop Name:</strong> ${name}`);
  
  nodesMarkerConf.nodeMarkers.push(marker);
}


// Function to fetch nodes from Neo4j and load them as markers
export function loadNodesFromNeo4j() {
  // Clear existing node markers from the map but exclude static markers
  nodesMarkerConf.nodeMarkers = nodesMarkerConf.nodeMarkers.filter(marker => {
    if (marker.options.isStatic) {
      return true; // Keep static markers
    } else {
      map.removeLayer(marker); // Remove non-static markers
      return false;
    }
  });

  // Fetch nodes from Neo4j
  var session = driver.session({ database: config.neo4jDatabase });


  //%%% HY567 %%% Create a cypher query to retrieve node info and modify the code that follows accordingly.

  const fetchNodesQuery = `

  `;

  session
    .run(fetchNodesQuery)
    .then(result => {
      // Process the result and create markers for each node
      result.records.forEach(record => {
        const latitude = record.get("latitude");
        const longitude = record.get("longitude");
        const name = record.get("name");
        const nodeColor = record.get("nodeColor");
        const vehicleName= record.get("vehicleName");

        const nodes = result.records.map(record => ({
          latitude: record.get("latitude"),
          longitude: record.get("longitude"),
          name: record.get("name"),
          nodeColor: record.get("nodeColor"),
          vehicleName: record.get("vehicleName"),
        }));
        // Check if the latitude and longitude are valid numbers
        if (!isNaN(latitude) && !isNaN(longitude)) {
          let icon;
          if (nodeColor === null) {
            icon = mapConfig.redIcon; 
          } else if (nodeColor === "yellow" ) {
            icon = mapConfig.yellowIcon; 
          } else if ( nodeColor === "green" ) {
            icon = mapConfig.greenIcon; 
          } else if ( nodeColor === "orange") {
            icon = mapConfig.orangeIcon; 
          } else if ( nodeColor === "blue") {
            icon = mapConfig.blueIcon;
          } else if ( nodeColor === "violet") {
            icon = mapConfig.violetIcon;
          } else {
            // Default icon for any other case
            icon = mapConfig.redIcon;
          }
          const formatValue = value => (value !== null && value !==""&& value !=="null" ? value : "-");
          const marker = L.marker([latitude, longitude], {
            icon: icon,
            name: name,
            nodeColor: nodeColor,
            // vehicleName:vehicleName,
            //clickable:!isDisabled, //Sets the marker as disabled if the condition is true
          })
          .addTo(map)
          .bindPopup(name)
          .bindTooltip(
            `<strong>Stop Name:</strong> ${formatValue(name)}<br>`
            // `<strong>vehicle Name:</strong> ${formatValue(vehicleName)}<br>`+
          );

          if (!nodesMarkerConf.nodeMarkers.some(existingMarker => isMarkerEqual(existingMarker, marker))) {
            nodesMarkerConf.nodeMarkers.push(marker);
          }
        }
        availableNodes = nodes;

      });
    })
    .catch(error => {
      console.error("Error fetching nodes from Neo4j:", error);
    })
    .then(() => {
      session.close();
    });
}

export function loadVehiclesFromNeo4j() {
  // Fetch nodes from Neo4j
  var session = driver.session({ database: config.neo4jDatabase });


  //%%% HY567 %%% Create a cypher query to retrieve vehicle info and modify the code that follows accordingly.

  const fetchVehiclesQuery = `
   
  `;
  
  session.run(fetchVehiclesQuery).then(result => {
    // Process result and save vehicles
    result.records.forEach(record => {
      const vehicleID = record.get("vehicleID");
      const capacity  = record.get("capacity");

      const vehicles = result.records.map(record => ({
        vehicleID:    record.get("vehicleID"),
        capacity:     record.get("capacity"),
      }));
      
      // console.log('Loaded vehicles from DB:',vehicles);

      availableVehicles = vehicles;
    })
  }).catch(error => {
    console.error("Error fetching vehicles from Neo4j:", error);
  }).finally(() => {
    session.close();
  })
}


export function updateMarkersOnMap() {
  // Clear the map of existing markers
  map.eachLayer(layer => {
    if (layer instanceof L.Marker) {
      map.removeLayer(layer);
    }
  });
  // Add the remaining markers from the nodeMarkers array
  nodesMarkerConf.nodeMarkers.forEach(marker => {
    marker.addTo(map);
  });
}

// You can also close the modal when clicking outside the modal content
window.onclick = function(event) {
  if (event.target == modal) {
    modal.style.display = 'none';
  }
}

const modal = document.getElementById("customModal");
export let nearestHighway;

function debounce(func, delay) {
  let inDebounce;
  return function() {
    const context = this;
    const args = arguments;
    clearTimeout(inDebounce);
    inDebounce = setTimeout(() => func.apply(context, args), delay);
  };
}

map.on("click", debounce(function (e) {
  const { lat, lng } = e.latlng;
  console.log(`Map clicked at: ${lat}, ${lng}`); // Log click coordinates
  
  getSurfaceType(lat, lng)
    .then(data => {
      console.log("Surface Type API Response:", data); // Log the response data

      // Proceed with getting the nearest road even if surface type data is null
      return getNearestRoad(lat, lng);
    })
    .then(nearestRoadData => {
      console.log('Nearest road data:', nearestRoadData); // Log the nearest road data
      if (nearestRoadData) {
        const nearestRoad = nearestRoadData.road;
        const adjustedLat = nearestRoadData.lat;
        const adjustedLng = nearestRoadData.lon;

        // Calculate the distance between the clicked point and the nearest road
        const distance = calculateDistance(lat, lng, adjustedLat, adjustedLng);
        console.log(`Distance to nearest road: ${distance} km`);

        if (distance <= DISTANCE_THRESHOLD) {
          // Show the modal immediately
          modal.style.display = "block";

          // Update the nearestHighwaySpan content asynchronously
          nearestHighwaySpan.textContent = `at "${nearestRoad}"`;


        //%%% HY567 %%% Extend below accordingly, if you add more fields in the "create a stop.." popup.


        // Get the modal input fields
        const nameInput = document.getElementById("name");
        const colorInput = document.getElementById("color");
        const createNodeButton = document.getElementById("createNodeButton");

        createNodeButton.onclick = function () {
          const name = nameInput.value.trim();
          const nodeColor = colorInput.value.trim();

      // Check if the name is provided
      if (!name) {
        customAlert("Please fill the stop name.");
        return;
      }

  // Close the modal after validation
  closeModal(modal);

  // Fetch additional data asynchronously
  fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${adjustedLat}&lon=${adjustedLng}&zoom=18&addressdetails=1`)
    .then(response => response.json())
    .then(data => {
      if (data && data.address) {
        const nearestHighway = data.address.road;
        const roadNumber = data.address.house_number || "";

        let icon = mapConfig.redIcon; // Default icon if no color is provided
        if (nodeColor === "yellow") icon = mapConfig.yellowIcon;
        else if (nodeColor === "green") icon = mapConfig.greenIcon;
        else if (nodeColor === "orange") icon = mapConfig.orangeIcon;
        else if (nodeColor === "blue") icon = mapConfig.blueIcon;
        else if (nodeColor === "violet") icon = mapConfig.violetIcon;

     

             const session = driver.session({ database: config.neo4jDatabase });

             //%%% HY567 %%% Modify the following cypher query for node creation.

             const storeNodeQuery = `
               MERGE (n:Node {latitude: $latitude, longitude: $longitude, name: $nodeName, nodeColor: $nodeColor})
             `;
             session.run(storeNodeQuery, {
               latitude: adjustedLat,
               longitude: adjustedLng,
               nodeName: name,
               nodeColor: nodeColor
             })
               .then(() => {
                 //loadNodesFromNeo4j();
                 console.log("Node created in Neo4j with name:", name);
                 L.marker([adjustedLat, adjustedLng], { icon: icon })
                   .addTo(map)
                   .bindPopup(`Street: ${nearestHighway}<br>Road Number: ${roadNumber}<br>Name: ${name}<br>Node Color: ${nodeColor}`);
               })
               .catch(error => {
                 console.error("Error creating node:", error);
               })
               .finally(() => {
                 session.close();
               });



      } else {
        customAlert("No address information found at this location. Node creation is not allowed.");
      }
    })
    .catch(error => {
      console.error("Error fetching address data:", error);
    });
};

          const closeButton = document.getElementsByClassName("close")[0];
          closeButton.onclick = function () {
            // Reset the input fields
            nameInput.value = "";
            colorInput.value = "";
            // Close the modal
            closeModal(modal);
          };

          // Function to close the modal
          function closeModal(modal) {
            modal.style.display = "none";
          }
        } else {
          customAlert("Stop creation is only allowed within 50 meters of a road.");
        }
      } else {
        customAlert("Stop creation is only allowed on roads.");
      }
    })
    .catch(error => {
      console.error("Error:", error);
    });
}));




var clingoTimeoutWindow = document.getElementById("clingoTimeoutModal");





  //%%% HY567 %%% Use this function to call the python script that executes the clingo code

export function callPythonforClingoExecution () {

    // showMessage("Do not execute Python Script from here. Run it as a standalone program!", 2);

  


}






export function clingoRoutingRetrieval (vehicleConfig) {
  // //show loading spinner
  // document.getElementById('loadingSpinner').style.display = 'block';

  const visitedNodes = []; // Declare an array to store visited nodes
  
  console.log(vehicleConfig);

  const busStops = nodesMarkerConf.nodeMarkers.map((marker, index) => ({
    id: index + 2, 
    latitude: marker.getLatLng().lat,
    longitude: marker.getLatLng().lng,
    name: marker.options.name,
  }));

  clingoTimeoutWindow.style.display = "block";

  fetch('http://localhost/neo4j/runPythonScript')
    .then(response => {
      if(!response.ok) {
        if (response.status === 404) throw new Error('404, Not Found');
        if (response.status === 500) throw new Error('500, Internal Server Error');
        if (response.status === 504) throw new Error('504, Clingo script execution timed out!')
        // For any other server error
        throw new Error(response.status);
      }
      clingoTimeoutWindow.style.display = "none";
      return response.json();
    })
    .then(data => {
      console.log("Found matrix with optimal routes: ",data);
      // display none spiner
      // document.getElementById('loadingSpinner').style.display = 'none';
      const earliestTimeInMinutes = data.earliestTimeInMinutes;

      for (const vehicle in data.groupedMatrix) {
        const routeCoordinates = [];
        if (data.groupedMatrix.hasOwnProperty(vehicle)) {
        
          data.groupedMatrix[vehicle].map(stopEntry => {
            const isServed = (stopEntry.includes("NotServed") ? "NotServed" : "Served");
            const visitedNode = busStops.find(node => (node.name).toLowerCase().replace(/\s/g, '') === stopEntry[1]);
            // console.log('visitedNode: ',visitedNode);

            visitedNodes.push({
              node: visitedNode,
              vehicleName: vehicle, // Add the vehicleName to the visitedNodes array
              isServed,
            });
            routeCoordinates.push([visitedNode.latitude, visitedNode.longitude]);
          })
        }
        drawRoute(routeCoordinates, vehicle);
        console.log(`Optimized Job By Clingo for ${vehicle} is:`, data.groupedMatrix[vehicle]);
      }
      
      // filter out the non served nodes before saving into DB
      // Create a copy of visitedNodes without "NotServed" entries
      console.log('VISITED NODES B4 FILTERING:',visitedNodes);
      let filteredVisitedNodes = visitedNodes.filter(node => node.isServed !== "NotServed");
      console.log('visited nodes after filtering out the NotServed: ',filteredVisitedNodes);
      createRelationshipsBetweenNodes(filteredVisitedNodes);
      //loadNodesFromNeo4j();
      clingoTimeoutWindow.style.display = "none";

    })
    .catch(error => {
      clingoTimeoutWindow.style.display = "none";
      console.log(error.message)
      if (error.message.includes('Clingo retrieval process stopped')) {
        console.log('User manually stopped the Clingo script.');
        customAlert('The Clingo script execution was stopped by the user.');
      } else {
        console.error(`An error occurred when calling the 'runPythonScript' service: ${error}`);
        customAlert(`An error occurred when calling the 'runPythonScript' service: ${error}`);
      }

    });
}

document.getElementById("clingoStopBtn").addEventListener("click", function () {
  fetch('http://localhost/neo4j/stopPythonScript')
    .then(response => {
      console.log('Response:', response);  // Log the response object
      console.log('Content-Type:', response.headers.get('Content-Type')); // Check Content-Type
      return response.text();
    })
    .then(data => {
      console.log(data);  // Log the response from the server
      // Optionally hide the modal or give feedback to the user
      document.getElementById('clingoTimeoutModal').style.display = 'none';
      customAlert("Clingo answer set retrieval stopped successfully!",2);
    })
    .catch(error => {
      console.error('Error stopping script:', error);
      customAlert('Error stopping script. Please try again.', 2);
    });
})








export function resetNodes() {
  const session = driver.session({ database: config.neo4jDatabase });
  for(let i=0; i<=currentRoute.length; i++){
    if (currentRoute[i] && arrow[i]) {
    map.removeLayer(currentRoute[i]);
    map.removeLayer(arrow[i]);
    }
  }
  // Define a query to delete all relationships from nodes
  const deleteAllRelationshipsQuery = `
    MATCH ()-[r]->()
    DELETE r
  `;
  // Define a query to update node colors to red
  const updateNodeColorQuery = `
    MATCH (n:Node)
      SET n.nodeColor = 'red'
      REMOVE n.vehicleName
  `;
  session
    .run(deleteAllRelationshipsQuery)
    .then(result => {
      // console.log('Deleted all relationships from nodes');
      // Close the session after deleting relationships
      session.close()
        .then(() => {
          // console.log('Session closed');
          // Create a new session for the next transaction
          const newSession = driver.session({ database: config.neo4jDatabase });
          // Run the second transaction to update node colors
          newSession
          .run(updateNodeColorQuery)
            .then(result => {
              // console.log('Updated node colors to red');
              //loadNodesFromNeo4j();
              // also load any available vehicles in db
              loadVehiclesFromNeo4j();
              // Close the new session
              newSession.close()
              .then(() => {
                  // console.log('New session closed');
                })
                .catch(error => {
                  console.error('Error closing new session:', error);
                });
            })
            .catch(error => {
              console.error('Error updating node colors:', error);
            });
        })
        .catch(error => {
          console.error('Error closing session:', error);
        });
    })
    .catch(error => {
      customAlert("Error setting up Neo4j driver .Please check your configurations. ");
      console.error('Error deleting relationships:', error);
    });
}



// JavaScript code to close the custom modal
document.getElementById('closeCustomModal').addEventListener('click', function () {
  var customModal = document.getElementById('customModal');
  customModal.style.display = 'none';
});

// JavaScript code to close the vehicle configuration modal
document.getElementById('closeVehicleConfigModal').addEventListener('click', function () {
  var vehicleConfigModal = document.getElementById('vehicleConfigModal');
  vehicleConfigModal.style.display = 'none';
});

document.addEventListener("DOMContentLoaded", function () {
  const actionsButton         = document.getElementById("actions-button");
  const findRoutesButton      = document.getElementById('findroutes-button');
  const actionsButtonGroup    = document.getElementById("actions-button-group");
  const findRoutesButtonGroup = document.getElementById('findroutes-button-group');

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
  function toggleButtonGroup(group) {
    const isVisible = group.style.display === "block";
    group.style.display = isVisible ? "none" : "block";
  }
  function closeButtonGroup(group) {
    group.style.display = "none";
  }
 
  //displayStaticNode();

});

// Get references to the button groups
const actionsButtonGroup    = document.getElementById('actions-button-group');
const findRoutesButtonGroup = document.getElementById('findroutes-button-group');

document.getElementById('deleteAllNodesButton').addEventListener('click', () => {
  actionsButtonGroup.style.display = 'none'; // Hide the actions-button-group
});


document.getElementById('findRoutesClingoButton').addEventListener('click', () => {
  findRoutesButtonGroup.style.display = 'none';
  clingoRoutingRetrieval({});
});

//document.addEventListener('DOMContentLoaded', function() {
//  const homeContainer = document.getElementById('home-container');

  // Toggle the display property of the home button container
//  function toggleHomeButton(show) {
//    homeContainer.style.display = show ? 'block' : 'none';
//  }

  // Uncomment to show the home button
//  toggleHomeButton(true);
//});

