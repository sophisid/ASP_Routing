import * as config from './configApis/config.js';
import neo4j from 'neo4j-driver';
import express from 'express';
import cors from 'cors';
import path from 'path';
import https from 'https';
import fs from 'fs';
import { execFile } from 'child_process';
import { transliterate } from 'inflected';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let childProcess;
let processStoppedByUser = false; // Flag to track if the process was stopped intentionally

const app = express();
// const router = express.Router();

const port = process.env.PORT || 3000;

app.use(cors({
  origin: 'http://localhost:3000', // Replace with the correct frontend URL
  methods: ['GET', 'POST'],       // Allow only certain methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Restrict allowed headers
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/neo4j',router);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
// Function to create a Neo4j driver
export const driver = neo4j.driver(
  config.neo4jUrl,
  neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword)
);

/**
 * Check if the Neo4j database is empty.
 * @returns {Promise<boolean>} True if empty, false otherwise.
 */
async function isDatabaseEmpty() {
  try {
    const session = driver.session();
    const query = 'MATCH (n) RETURN count(n) AS node_count';
    const result = await session.run(query);
    const nodeCount = result.records[0].get('node_count');
    await session.close();
    return nodeCount === 0;
  } catch (error) {
    console.error('Error checking database:', error);
    throw error;
  }
}

/**
 * Run the Python script to populate the Neo4j database.
 * @returns {Promise<void>} Resolves when the script completes.
 */
function populateDatabase() {
  return new Promise((resolve, reject) => {
    const pythonScriptPath = path.join(__dirname, 'load_neo4j.py');
    execFile('python3', [pythonScriptPath], (err, stdout, stderr) => {
      if (err) {
        console.error('Error running Python script:', err);
        reject(err);
        return;
      }
      if (stderr) {
        console.error('Python script stderr:', stderr);
      }
      console.log('Python script output:', stdout);
      resolve();
    });
  });
}

/**
 * Middleware to check if the database is empty and populate it if necessary.
 */
async function checkAndPopulateDatabase(req, res, next) {
  try {
    console.log('Checking if the database is empty...');
    const isEmpty = await isDatabaseEmpty();
    if (isEmpty) {
      console.log('Database is empty. Populating...');
      await populateDatabase();
      console.log('Database populated successfully.');
    } else {
      console.log('Database is not empty. Skipping population.');
    }
    next();
  } catch (error) {
    console.error('Error during database check and population:', error);
    res.status(500).send('Internal server error during database initialization.');
  }
}

// Use the middleware for all routes
app.use(checkAndPopulateDatabase);

// Middleware setup
const publicPath = path.join(__dirname, '..', 'public');

app.use(cors());
app.use(express.json());
// Serve static files from the 'public' directory
app.use(express.static(publicPath));

// Define route to serve the homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'frontend', 'homePage.html'));
});

// Define route to serve the main page
app.get('/mainPage.html', (req, res) => {
  // if `web` is not defined, fix as necessary
  const mainPagePath = path.join(publicPath, 'frontend', 'mainPage.html');
  res.sendFile(mainPagePath);
});

// -----------------------------------------------------------------------------------
// Helpers used by route logic
const simplifyRouteData = (data) => {
  const vehicles = {};
  const vehiclesStartEnd = {};

  console.log('-------------------------------------\nBEFORE DATA SIMPLIFICATION:\n', data);

  data.forEach((entry) => {
    const vehicleName = entry.nodeA.vehicleName;

    if (!vehicles[vehicleName] && vehicleName !== undefined) {
      vehicles[vehicleName] = [];
    }
    if (!vehiclesStartEnd[vehicleName]) {
      vehiclesStartEnd[vehicleName] = {};
    }

    if (entry.relationshipType === 'START_TO_ROUTE') {
      vehiclesStartEnd[entry.nodeB.vehicleName] = {
        ...vehiclesStartEnd[entry.nodeB.vehicleName],
        routeStartName: entry.nodeA.name,
      };
      if (entry.nodeA.name === entry.nodeB.name) {
        vehiclesStartEnd[entry.nodeB.vehicleName] = {
          ...vehiclesStartEnd[entry.nodeB.vehicleName],
          routeStartServed: true
        };
      } else {
        vehiclesStartEnd[entry.nodeB.vehicleName] = {
          ...vehiclesStartEnd[entry.nodeB.vehicleName],
          routeStartServed: false
        };
      }
    } else if (entry.relationshipType === 'ROUTE_TO_END') {
      vehiclesStartEnd[entry.nodeA.vehicleName] = {
        ...vehiclesStartEnd[entry.nodeA.vehicleName],
        routeEndName: entry.nodeB.name,
        routeEnd: {
          name: entry.nodeB.name,
          latitude: entry.nodeB.latitude,
          longitude: entry.nodeB.longitude
        }
      };
      if (entry.nodeA.name === entry.nodeB.name) {
        vehiclesStartEnd[entry.nodeA.vehicleName] = {
          ...vehiclesStartEnd[entry.nodeA.vehicleName],
          routeEndServed: true
        };
      } else {
        vehiclesStartEnd[entry.nodeA.vehicleName] = {
          ...vehiclesStartEnd[entry.nodeA.vehicleName],
          routeEndServed: false
        };
      }
    } else {
      // check if a stop with the same name already exists
      const stopExists = (vehicle, stopName) => {
        return vehicle.some((stop) => stop.name === stopName);
      };
      // Add nodeA if it doesn't already exist
      if (!stopExists(vehicles[vehicleName], entry.nodeA.name)) {
        vehicles[vehicleName].push({
          name: entry.nodeA.name,
          latitude: entry.nodeA.latitude,
          longitude: entry.nodeA.longitude
        });
      }
      // Add nodeB if it doesn't already exist and is different from nodeA
      if (
        entry.nodeA.name !== entry.nodeB.name &&
        !stopExists(vehicles[vehicleName], entry.nodeB.name)
      ) {
        vehicles[vehicleName].push({
          name: entry.nodeB.name,
          latitude: entry.nodeB.latitude,
          longitude: entry.nodeB.longitude
        });
      }
    }
  });

  Object.keys(vehicles).map((vehicleName) => {
    console.log(
      '----------------------------vehicles---------------------------',
      vehicleName,
      '\n',
      vehicles[vehicleName]
    );

    if (!vehiclesStartEnd[vehicleName]) {
      return vehicles; // skip if no start/end data for this vehicle
    }
    console.log('vehicles[vehicleName][0].name:\t', vehicles[vehicleName][0].name);

    // Add the routeStart at the beginning if not first stop as well
    if (
      vehicles[vehicleName].length > 0 &&
      vehicles[vehicleName][0].name !== vehiclesStartEnd[vehicleName].routeStartName
    ) {
      vehicles[vehicleName].unshift(vehiclesStartEnd[vehicleName].routeStart);
    }

    let lastEntry = vehicles[vehicleName][vehicles[vehicleName].length - 1];
    if (lastEntry.name !== vehiclesStartEnd[vehicleName].routeEndName) {
      vehicles[vehicleName].push(vehiclesStartEnd[vehicleName].routeEnd);
    }
  });

  const simplifiedData = Object.keys(vehicles).map((vehicleName) => ({
    vehicleName,
    stops: vehicles[vehicleName]
  }));

  return simplifiedData;
};

const logRouteName = (req, res, next) => {
  if (req.path !== '/favicon.ico') {
    // avoid double logging
    console.log(
      `-----------------------------------------------------------------------------------------------------------------\n-------> ROUTE: ${req.path}\t\t${new Date().toString()}`
    );
  }
  next();
};

const sortMatrix = (matrix) => {
  return matrix.sort((a, b) => {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    if (parseInt(a[2], 10) < parseInt(b[2], 10)) return -1;
    if (parseInt(a[2], 10) > parseInt(b[2], 10)) return 1;
    return 0;
  });
};

const groupMatrixByVehicle = (matrix) => {
  return matrix.reduce((acc, row) => {
    const vehicle = row[0];
    if (!acc[vehicle]) {
      acc[vehicle] = [];
    }
    acc[vehicle].push(row);
    return acc;
  }, {});
};

// extract the matrix of the optimal answer set from the clingo results and sort it by vehicle and timepoint
const extractMatrixFromClingoAS = (output) => {
  const match = output.match(/Optimal:\s+True\s+([\s\S]*?)SAT/);

  if (match) {
    const dataSection = match[1];
    const matrixMatch = dataSection.match(/\[\[.*?\]\]/);
    if (matrixMatch) {
      try {
        const matrix = JSON.parse(matrixMatch[0].replace(/'/g, '"')); // Replace single quotes with double quotes for JSON parsing
        return { matrix };
      } catch (error) {
        console.error('Error parsing matrix:', error);
      }
    }
  }
  return { matrix: null };
};

// -----------------------------------------------------------------------------------
// Define routes
const router = express.Router();
app.use('/neo4j', router);
// Use the logging middleware for all routes
router.use(logRouteName);

// 1) load nodes from neo4j and return them as a simple json object
router.get('/loadNodes', async (req, res) => {
  try {
    const session = driver.session({ database: config.neo4jDatabase });
    // Example query: fetch nodes of type cars
    const fetchNodesQuery = `
      MATCH (n:cars)
      RETURN n.Model AS Model, 
             n.Fuel AS Fuel, 
             n.Air_Pollution_Score AS Air_Pollution_Score, 
             n.Greenhouse_Gas_Score AS Greenhouse_Gas_Score, 
             n.Price_EUR AS Price_EUR
    `;

    session
      .run(fetchNodesQuery)
      .then((result) => {
        const nodes = result.records.map((record) => ({
          Model: record.get('Model'),
          Fuel: record.get('Fuel'),
          Air_Pollution_Score: record.get('Air_Pollution_Score'),
          Cmb_MPG: record.get('Cmb_MPG'), // This property might need to be updated if it exists
          Greenhouse_Gas_Score: record.get('Greenhouse_Gas_Score'),
          Price_EUR: record.get('Price_EUR')
        }));
        console.log('--> #nodes:', nodes.length);
        res.json(nodes);
      })
      .catch((error) => {
        console.error('Error fetching nodes from Neo4j:', error);
        res.status(500).send('Failed to load nodes.');
      })
      .then(() => {
        session.close();
      });
  } catch (error) {
    console.error('Error loading nodes:', error);
    res.status(500).send('Failed to load nodes.');
  }
});

// 2) load vehicles from neo4j and return them as a simple json object
router.get('/loadVehicles', async (req, res) => {
  try {
    const session = driver.session({ database: config.neo4jDatabase });

    // Example query: fetch same data as in loadNodes, or adjust for 'vehicles'
    const fetchVehiclesQuery = `
      MATCH (n:cars)
      RETURN n.Model AS Model, 
             n.Fuel AS Fuel, 
             n.Air_Pollution_Score AS Air_Pollution_Score, 
             n.Greenhouse_Gas_Score AS Greenhouse_Gas_Score, 
             n.Price_EUR AS Price_EUR
    `;

    session
      .run(fetchVehiclesQuery)
      .then((result) => {
        const vehicles = result.records.map((record) => ({
          Model: record.get('Model'),
          Fuel: record.get('Fuel'),
          Air_Pollution_Score: record.get('Air_Pollution_Score'),
          Cmb_MPG: record.get('Cmb_MPG'),
          Greenhouse_Gas_Score: record.get('Greenhouse_Gas_Score'),
          Price_EUR: record.get('Price_EUR')
        }));
        res.json(vehicles);
      })
      .catch((error) => {
        console.error('Error fetching vehicles from Neo4j:', error);
        res.status(500).send('Failed to load vehicles.');
      })
      .then(() => {
        session.close();
      });
  } catch (error) {
    console.error('Error loading vehicles:', error);
    res.status(500).send('Failed to load vehicles.');
  }
});

// 3) A sample route that queries OpenRouteService to get multiple alternative routes
router.post('/getOurRoutes', async (req, res) => {
  const { locations, car } = req.body; // Expecting `locations` from the frontend

  if (!locations || locations.length < 2) {
    return res.status(400).send('At least two locations are required to calculate routes.');
  }

  // Construct the payload for ORS
  const payload = JSON.stringify({
    coordinates: locations,
    alternative_routes: {
      target_count: 10, // Number of alternative routes
      share_factor: 0.6, // Degree of similarity to the main route
      weight_factor: 1.2 // Allowing less optimal alternatives
    },
    format: 'json', // Response format
    instructions: true // Include turn-by-turn instructions
  });

  const options = {
    hostname: 'api.openrouteservice.org',
    path: '/v2/directions/driving-car',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
      Authorization: config.ORS_Key // Your ORS API Key
    }
  };

  try {
    const orsResponse = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(responseData));
            } catch (err) {
              reject(new Error('Failed to parse ORS response'));
            }
          } else {
            reject(new Error(`ORS request failed with status ${res.statusCode}: ${responseData}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(payload);
      req.end();
    });

    const { routes } = orsResponse;

    // Analyze routes for stops, tollway distance, and elevation changes
    const analyzedRoutes = await Promise.all(
      routes.map(async (route, index) => {
        const decodedPolyline = decodePolyline(route.geometry);
        const elevationData = await getElevationData(route.geometry);
        const totalStops = route.way_points.length - 2; // Excluding start and end
        const tollwayDistance = calculateTollwayDistance(route.segments);
        const elevationChanges = calculateElevationChanges(elevationData);

        return {
          routeIndex: index,
          distance: route.summary.distance, // Distance in meters
          duration: route.summary.duration, // Duration in seconds
          tollwayDistance, // Total distance of tollways
          totalStops, // Number of stops along the route
          elevationChanges, // Elevation change information
          geometry: route.geometry, // Encoded polyline for mapping
          instructions: route.segments.flatMap((segment) =>
            segment.steps.map((step) => ({
              instruction: step.instruction,
              distance: step.distance, // Distance for this step
              duration: step.duration // Duration for this step
            }))
          )
        };
      })
    );

    res.json({ routes: analyzedRoutes });
  } catch (error) {
    console.error('Error fetching routes with alternatives from ORS:', error.message);
    res.status(500).send('Failed to fetch routes with alternatives from OpenRouteService.');
  }
});

// Helper to decode polyline
function decodePolyline(encoded) {
  const polyline = require('@mapbox/polyline'); // Install @mapbox/polyline if not installed
  return polyline.decode(encoded);
}

// Helper to fetch elevation data
async function getElevationData(encodedGeometry) {
  const elevationPayload = JSON.stringify({
    format_in: 'encodedpolyline',
    geometry: encodedGeometry
  });

  const options = {
    hostname: 'api.openrouteservice.org',
    path: '/elevation/line',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(elevationPayload),
      Authorization: config.ORS_Key // Your ORS API Key
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const data = JSON.parse(responseData);
            resolve(data.geometry);
          } catch (err) {
            reject(new Error('Failed to parse elevation data response'));
          }
        } else {
          reject(
            new Error(`Elevation data request failed with status ${res.statusCode}: ${responseData}`)
          );
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(elevationPayload);
    req.end();
  });
}

// Helper to calculate tollway distance
function calculateTollwayDistance(segments) {
  let totalTollwayDistance = 0;
  segments.forEach((segment) => {
    segment.steps.forEach((step) => {
      if (step.attributes && step.attributes.includes('tollway')) {
        totalTollwayDistance += step.distance;
      }
    });
  });
  return totalTollwayDistance;
}

// Helper to calculate elevation changes
function calculateElevationChanges(elevationData) {
  let totalElevationGain = 0;
  let totalElevationLoss = 0;

  for (let i = 1; i < elevationData.length; i++) {
    const diff = elevationData[i][2] - elevationData[i - 1][2];
    if (diff > 0) {
      totalElevationGain += diff;
    } else {
      totalElevationLoss -= diff;
    }
  }

  return {
    totalElevationGain,
    totalElevationLoss
  };
}

// 4) load relationships between nodes from the Neo4j db to retrieve the routes
router.get('/getRoutes', async (req, res) => {
  let nodeNames = [];

  async function loadNodeNames() {
    try {
      const session = driver.session({ database: config.neo4jDatabase });
      const fetchNodeNamesQuery = `
        MATCH (n:Node)
        RETURN n.name AS name, n.latitude AS latitude, n.longitude AS longitude
      `;
      const result = await session.run(fetchNodeNamesQuery);
      nodeNames = result.records.map((record) => {
        return {
          name: record.get('name'),
          latitude: record.get('latitude'),
          longitude: record.get('longitude')
        };
      });
      await session.close();
    } catch (error) {
      console.error('Error loading nodes:', error);
      res.status(500).send('Failed to load nodes.');
    }
  }

  try {
    await loadNodeNames();

    const session = driver.session({ database: config.neo4jDatabase });
    // For demonstration, user must define `retrieveAllNodeRelationships`:
    const retrieveAllNodeRelationships = `
      // TODO: MATCH your relationships & return them.
      // Example:
      // MATCH (a:Node)-[r]-(b:Node) RETURN a, b, type(r) as type(r)
    `;
    const relationships = [];

    const result = await session.run(retrieveAllNodeRelationships);
    result.records.map((record) => {
      const a = record.get('a');
      const b = record.get('b');
      const relationshipType = record.get('type(r)');

      const nodeAProperties = {
        name: a.properties.name,
        vehicleName: a.properties.vehicleName,
        latitude: a.properties.latitude,
        longitude: a.properties.longitude
      };
      const nodeBProperties = {
        name: b.properties.name,
        vehicleName: b.properties.vehicleName,
        latitude: b.properties.latitude,
        longitude: b.properties.longitude
      };

      relationships.push({
        nodeA: nodeAProperties,
        nodeB: nodeBProperties,
        relationshipType
      });
    });

    // Let's simplify the json - GROUP BY vehicleName
    const simplifiedData = simplifyRouteData(relationships);

    // extract all stops that are currently assigned to vehicles
    const assignedStops = new Set();
    simplifiedData.forEach((vehicle) => {
      vehicle.stops.forEach((stop) => {
        assignedStops.add(stop.name);
      });
    });

    // (Optional) filter nodeNames to find those not included into any route, etc.
    const missingNodesSet = new Set(nodeNames.map((node) => node.name));

    simplifiedData.forEach((vehicle) => {
      if (!vehicle.routeStartServed && vehicle.stops.length > 0) {
        const firstStop = vehicle.stops[0];
        if (!assignedStops.has(firstStop.name)) {
          missingNodesSet.add(firstStop.name);
        }
      }
    });

    // Remove served nodes from missingNodesSet
    assignedStops.forEach((stopName) => {
      missingNodesSet.delete(stopName);
    });

    // Convert missingNodesSet back to array of node objects
    const missingNodes = nodeNames.filter((node) => missingNodesSet.has(node.name));

    // create new object for all the unassigned stops
    const unassignedVehicle = {
      vehicleName: 'unassigned',
      stops: missingNodes
    };

    simplifiedData.push(unassignedVehicle);

    res.json(simplifiedData);
    await session.close();
  } catch (error) {
    console.log('Error loading all node relationships from Neo4j:', error);
    res.status(500).send('Failed to load all node relationships.');
  }
});

// 5) Example route to retrieve a solution from ORS optimization - incomplete
router.get('/getRoutesFromORS', async (req, res) => {
  let locations, stopNames, storedNodes, vehicleConfig;

  async function loadNodes() {
    try {
      const session = driver.session({ database: config.neo4jDatabase });
      const fetchNodesQuery = `
        MATCH (n:Node)
        RETURN n.latitude AS latitude, 
               n.longitude AS longitude, 
               n.name AS name
      `;
      const result = await session.run(fetchNodesQuery);
      const nodes = result.records.map((record) => ({
        latitude: record.get('latitude'),
        longitude: record.get('longitude'),
        name: record.get('name')
      }));
      storedNodes = nodes;

      locations = storedNodes.map((node) => [node.longitude, node.latitude]);
      stopNames = storedNodes.map((node) => node.name); // Extract node names

      console.log(
        '-------Loaded Nodes:\n--------nodes:',
        nodes,
        '\n--------locations:',
        locations,
        '\n--------stopNames:',
        stopNames
      );

      await session.close();
    } catch (error) {
      console.error('Error loading nodes:', error);
      res.status(500).send('Failed to load nodes.');
    }
  }
  await loadNodes();

  // load the vehicles next and setup vehicleConfig for the API
  async function loadVehicles() {
    try {
      const session = driver.session({ database: config.neo4jDatabase });
      const fetchVehiclesQuery = `
        // e.g.: MATCH (v:Vehicle) RETURN v.vehicleID as vehicleID, v.capacity as capacity
      `;
      const result = await session.run(fetchVehiclesQuery);
      const vehicles = result.records.map((record) => ({
        vehicleID: record.get('vehicleID'),
        capacity: record.get('capacity')
      }));

      vehicleConfig = vehicles.map((v) => {
        return {
          id: v.vehicleID, // Store the original vehicle ID from your configuration
          profile: 'driving-car',
          capacity: [v.capacity]
        };
      });
    } catch (error) {
      console.error('Error loading vehicles:', error);
      res.status(500).send('Failed to load vehicles.');
    }
  }
  await loadVehicles();

  console.log('-------------vehicle config for optimization API:', vehicleConfig);

  const busStops = storedNodes.map((node, index) => ({
    id: index + 2,
    latitude: node.latitude,
    longitude: node.longitude,
    name: node.name
  }));

  // You would build the "jobs" param as required by ORS optimization, etc.
  // ...
  res.send('Not implemented yet.');
});

// -----------------------------------------------------------------------------------
// (A) Utility: Haversine formula
function deg2rad(deg) {
  return deg * (Math.PI / 180);
}
function computeHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance; // meters
}

// (B) Compute pairwise distances for an array of stops
function computeAllDistances(stops) {
  const distances = [];
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const nodeA = stops[i];
      const nodeB = stops[j];
      const distMeters = computeHaversineDistance(
        nodeA.latitude,
        nodeA.longitude,
        nodeB.latitude,
        nodeB.longitude
      );
      const distRounded = Math.round(distMeters);

      distances.push({
        from: nodeA.name,
        to: nodeB.name,
        distance: distRounded
      });
      // If you want symmetrical distance, push the reverse too:
      distances.push({
        from: nodeB.name,
        to: nodeA.name,
        distance: distRounded
      });
    }
  }
  return distances;
}

// (C) Load stops & vehicles from DB
async function loadStopsFromNeo4j() {
  try {
    const session = driver.session({ database: config.neo4jDatabase });

    const fetchStopsQuery = `
      MATCH (n:Node)
      RETURN n.name AS name, 
             n.latitude AS latitude, 
             n.longitude AS longitude, 
             n.demand AS demand
    `;
    const result = await session.run(fetchStopsQuery);

    const stops = result.records.map((record) => ({
      name: record.get('name'),
      latitude: record.get('latitude'),
      longitude: record.get('longitude'),
      demand: record.get('demand') || 0 // Default to 0 if demand is not set
    }));

    await session.close();
    return stops;
  } catch (error) {
    console.error('Error loading stops from Neo4j:', error);
    throw new Error('Failed to load stops from Neo4j.');
  }
}

async function loadVehiclesFromNeo4j() {
  try {
    const session = driver.session({ database: config.neo4jDatabase });
    const fetchVehiclesQuery = `
      MATCH (v:Vehicle)
      RETURN v.vehicleName AS vehicleName, 
             v.capacity AS capacity
    `;
    const result = await session.run(fetchVehiclesQuery);

    const vehicles = result.records.map((record) => ({
      vehicleName: record.get('vehicleName'),
      capacity: record.get('capacity')
    }));

    await session.close();
    return vehicles;
  } catch (error) {
    console.error('Error loading vehicles from Neo4j:', error);
    throw new Error('Failed to load vehicles from Neo4j.');
  }
}

// 6) The retrieveASPrules route - fix with computeAllDistances
router.get('/retrieveASPrules', async (req, res) => {
  try {
    // 1. Load stops from DB
    const nodes = await loadStopsFromNeo4j();
    // 2. Load vehicles from DB
    const vehicles = await loadVehiclesFromNeo4j();

    // 3. Build ASP facts
    let aspFacts = '';

    // (a) Create a `node(...)` fact for each stop
    nodes.forEach((node) => {
      // Optionally transliterate the name to remove accents
      const nodeName = transliterate(node.name || '')
        .toLowerCase()
        .replace(/\s+/g, '');
      aspFacts += `node(${nodeName}).\n`;
      aspFacts += `latitude(${nodeName}, ${node.latitude}).\n`;
      aspFacts += `longitude(${nodeName}, ${node.longitude}).\n`;
      if (node.demand) {
        aspFacts += `demand(${nodeName}, ${node.demand}).\n`;
      }
    });

    // (b) Create a `vehicle(...)` fact for each vehicle
    vehicles.forEach((v) => {
      const vehicleID = transliterate(v.vehicleName || '')
        .toLowerCase()
        .replace(/\s+/g, '');
      aspFacts += `vehicle(${vehicleID}).\n`;
      if (v.capacity) {
        aspFacts += `capacity(${vehicleID}, ${v.capacity}).\n`;
      }
      // If you have more properties, e.g. v.fuel, etc.:
      // aspFacts += `fuel(${vehicleID}, "${v.fuel}").\n`;
      // ...
    });

    // (c) Distances: compute via Haversine & create distance(A,B,C).
    const allDistances = computeAllDistances(nodes);
    for (const dist of allDistances) {
      const fromName = transliterate(dist.from || '')
        .toLowerCase()
        .replace(/\s+/g, '');
      const toName = transliterate(dist.to || '')
        .toLowerCase()
        .replace(/\s+/g, '');
      aspFacts += `distance(${fromName}, ${toName}, ${dist.distance}).\n`;
    }

    // 4. Return the ASP facts as plain text
    return res.type('text/plain').send(aspFacts);
  } catch (err) {
    console.error('Error building ASP facts:', err);
    res.status(500).send('Error building ASP facts');
  }
});

// 7) run the python script that gets the results for each route from clingo
router.get('/runPythonScript', async (req, res) => {
  try {
    // path to your python script & main .lp file
    const scriptPath = path.join(__dirname, 'clingoFiles', 'nemoClingoRouting.py');
    const lpFilePath = path.join(__dirname, 'clingoFiles', 'nemoRouting4AdoXX.lp');

    childProcess = execFile('python3', [scriptPath, lpFilePath], { timeout: 70000 }, (err, stdout, stderr) => {
      if (err) {
        console.error('Clingo execution error222:', err);
        if (err.killed) {
          return res.status(504).send('Clingo script timed out.');
        }
        return res.status(500).send(err.message);
      }
      if (stderr) {
        console.error('Stderr from python script:', stderr);
      }
      // stdout presumably has the route facts as a list
      console.log('Python script output:', stdout);

      let routeData;
      try {
        routeData = JSON.parse(stdout);
      } catch (parseError) {
        console.error('Could not parse JSON from stdout. Falling back...');
        routeData = [];
      }

      // Return as JSON to your UI
      res.json({ routeData });
    });
  } catch (error) {
    console.error('Error in /runPythonScript:', error);
    res.status(500).send('Error in runPythonScript');
  }
});

// 8) kill the /runPythonScript
router.get('/stopPythonScript', (req, res) => {
  if (childProcess) {
    processStoppedByUser = true;
    childProcess.kill('SIGINT'); // Sending SIGINT to stop the process gracefully
    console.log('Child process to retrieve CLINGO results stopped.', res.statusCode);
    res.send('Clingo retrieval process stopped');
  } else {
    res.status(404).send('No process is running');
  }
});

// 9) delete all nodes from db
router.delete('/deleteAllNodes', async (req, res) => {
  try {
    const session = driver.session({ database: config.neo4jDatabase });
    // Write the Cypher query to delete all nodes from the Neo4j database
    const deleteAllNodesQuery = `
      MATCH (n)
      DETACH DELETE n
    `;
    await session.run(deleteAllNodesQuery);
    await session.close();
    res.status(200).json({ message: 'All nodes deleted successfully' });
  } catch (error) {
    console.error('Error deleting nodes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 10) delete all vehicles from db
router.delete('/deleteAllVehicles', async (req, res) => {
  try {
    const session = driver.session({ database: config.neo4jDatabase });
    // Write the Cypher query to delete all vehicles from the Neo4j database
    // Adjust if your vehicles are labeled :Vehicle or something else
    const deleteAllVehiclesQuery = `
      MATCH (v:Vehicle)
      DETACH DELETE v
    `;
    await session.run(deleteAllVehiclesQuery);
    await session.close();
    res.status(200).json({ message: 'All vehicles deleted successfully' });
  } catch (error) {
    console.error('Error deleting vehicles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// -----------------------------------------------------------------------------------
// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
