
import {driver} from "./main.js"
import * as config from './configApis/config.js';

// Function to display a message in the message window
export function showMessage(message,durationInSeconds) {
  var popupModal = document.getElementById('popupModal');
  var popupMessageContent = document.getElementById('popupMessageContent');
  // Set the message content
  popupMessageContent.innerHTML = message;
  // Show the pop-up modal
  popupModal.style.display = 'block';
  // Automatically close the modal after the specified duration
  setTimeout(function () {
    popupModal.style.display = 'none';
  }, durationInSeconds * 1000); // Convert seconds to milliseconds
}
// Function to determine the icon class based on nodeColor
export function getIconClass(nodeColor) {
  if (nodeColor === 'yellow') {
    return 'icon-yellow';
  } else if (nodeColor === 'green') {
    return 'icon-green';
  } else if (nodeColor === 'orange') {
    return 'icon-orange';
  } else {
    return 'icon-red'; // Default icon class if color is null or other values
  }
}
// Function to get surface information using the Overpass API
export function getSurfaceType(latitude, longitude) {
  const overpassURL = `https://overpass-api.de/api/interpreter?data=[out:json];way(around:1,${latitude},${longitude})[highway][surface];out;`;

  return fetch(overpassURL)
    .then(response => response.json())
    .then(data => {
      if (data && data.elements.length > 0) {
        const way = data.elements[0];
        const surfaceType = way.tags.surface;
        const highwayType = way.tags.highway;

        if ((surfaceType && (surfaceType.toLowerCase().includes("asphalt") || surfaceType.toLowerCase().includes("paving_stones")||surfaceType.toLowerCase().includes("paving_stones")))||(highwayType)) {
          return 1;
        } else{
          return null;
        }
      } else {
        return null;
      }
    })
    .catch(error => {
      console.error("Error fetching surface type:", error);
      return null;
    });
}

export async function checkIfmyNodeNameIsUnique(name) {
  var session = driver.session({ database: config.neo4jDatabase });
  const checkQuery = `
    MATCH (n:Node {name: $name})
    RETURN COUNT(n) AS count
  `;
  try {
    const result = await session.run(checkQuery, { name: name });
    const count = result.records[0].get("count").toNumber();
    return count; // Return the count directly
  } catch (error) {
    console.error("Error checking name uniqueness:", error);
    return -1; // Return a value indicating an error
  } finally {
    session.close();
  }
}
export function isMarkerEqual(marker1, marker2) {
  // Compare markers based on your criteria
  return (
    marker1.options.name === marker2.options.name &&
    marker1.options.latitude === marker2.options.latitude &&
    marker1.options.longitude === marker2.options.longitude
    // Remove the trailing comma after the last condition
  );
}

export function getTextColor(vehicleNumber) {
  switch (vehicleNumber) {
    case 1:
      return '#ffffff'; 
    case 2:
      return '#ffffff'; 
    case 3:
      return '#ffffff'; 
    default:
      return ''; // Default text color for other values of i
  }
}


export  function customAlert(message) {
  // Get the custom warning elements
  const customWarning = document.getElementById('customWarning');
  const customWarningMessage = document.getElementById('customWarningMessage');
  const customWarningCloseButton = document.getElementById('customWarningCloseButton');
  // Set the message
  customWarningMessage.innerText = message;
  // Display the custom warning
  customWarning.style.display = 'flex';
  // Close the warning when OK button is clicked
  customWarningCloseButton.addEventListener('click', function() {
    customWarning.style.display = 'none';
  });
}
