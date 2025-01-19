// mainServer.js
import express from 'express';
import neo4j from 'neo4j-driver';
import cors from 'cors';
import path from 'path';
import https from 'https';
import fs from 'fs';
import { execFile } from 'child_process';
import { transliterate } from 'inflected';
import polylineLib from '@mapbox/polyline'; // decode polylines

// If using ES modules, we need these to emulate __dirname
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// If your config is in ../configApis/config.js, adjust the path accordingly:
import * as config from './configApis/config.js';

// ----------------------------------------------------------------------------
// Create Express server
const app = express();
const port = process.env.PORT || 3000;

let childProcess = null;
let processStoppedByUser = false; // Flag to track if the process was stopped intentionally

// ----------------------------------------------------------------------------
// Neo4j Driver
export const driver = neo4j.driver(
  config.neo4jUrl,
  neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword)
);

// ----------------------------------------------------------------------------
// Optional: If you have a script that checks if your DB is empty and populates it:
async function isDatabaseEmpty() {
  try {
    const session = driver.session({ database: config.neo4jDatabase });
    const query = 'MATCH (n) RETURN count(n) AS node_count';
    const result = await session.run(query);
    const nodeCount = result.records[0].get('node_count').toNumber();
    console.log('Node count:', nodeCount);
    await session.close();
    return nodeCount === 0;
  } catch (error) {
    console.error('Error checking database:', error);
    throw error;
  }
}

function populateDatabase() {
  return new Promise((resolve, reject) => {
    const pythonScriptPath = path.join(__dirname, '..', '..', 'initcars', 'load_neo4j.py');
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

// ----------------------------------------------------------------------------
// Middleware

// Enable CORS so that requests from localhost:8000 are allowed
app.use(
  cors({
    origin: 'http://localhost:8000', // or ['http://localhost:8000', ...] if you have multiple origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());

// If your static frontend is in `../../frontend` relative to this file:
const publicPath = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(publicPath));

// Use optional DB-check middleware:
app.use(checkAndPopulateDatabase);

// ----------------------------------------------------------------------------
// Serve main pages
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'homePage.html'));
});

app.get('/mainPage.html', (req, res) => {
  res.sendFile(path.join(publicPath, 'mainPage.html'));
});

// ----------------------------------------------------------------------------
// Helpers for route logic
function logRouteName(req, res, next) {
  if (req.path !== '/favicon.ico') {
    console.log(`\n-------------------------------------\nROUTE: ${req.path}  ${new Date().toString()}`);
  }
  next();
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

function computeHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // meters
}

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
        distance: distRounded,
      });
      distances.push({
        from: nodeB.name,
        to: nodeA.name,
        distance: distRounded,
      });
    }
  }
  return distances;
}

// ----------------------------------------------------------------------------
// Create Router for /neo4j
const router = express.Router();
app.use('/neo4j', router);
router.use(logRouteName);

// ----------------------------------------------------------------------------
// Neo4j session helpers
async function loadStopsFromNeo4j() {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    const fetchStopsQuery = `
      MATCH (n:Node)
      RETURN n.name AS name, 
             n.latitude AS latitude, 
             n.longitude AS longitude, 
             n.demand AS demand
    `;
    const result = await session.run(fetchStopsQuery);
    return result.records.map((record) => ({
      name: record.get('name'),
      latitude: record.get('latitude'),
      longitude: record.get('longitude'),
      demand: record.get('demand') || 0,
    }));
  } catch (error) {
    console.error('Error loading stops from Neo4j:', error);
    throw new Error('Failed to load stops from Neo4j.');
  } finally {
    await session.close();
  }
}

async function loadVehiclesFromNeo4j() {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    const fetchVehiclesQuery = `
      MATCH (v:Vehicle)
      RETURN v.vehicleName AS vehicleName, 
              v.model AS model,
              v.fuel AS fuel,
              v.air_pollution_score AS air_pollution_score,
              v.display AS display,
              v.cyl AS cyl,
              v.drive AS drive,
              v.stnd AS stnd,
              v.stnd_description AS stnd_description,
              v.cert_region AS cert_region,
              v.transmission AS transmission,
              v.underhood_id AS underhood_id,
              v.veh_class AS veh_class,
              v.city_mpg AS city_mpg,
              v.hwy_mpg AS hwy_mpg,
              v.cmb_mpg AS cmb_mpg,
              v.greenhouse_gas_score AS greenhouse_gas_score,
              v.smartway AS smartway,
              v.price_eur AS price_eur
    `;

    const result = await session.run(fetchVehiclesQuery);
    return result.records.map((record) => ({
      vehicleName: record.get('vehicleName'),
      model: record.get('model'),
      cert_region: record.get('cert_region'),
      transmission: record.get('transmission'),
      fuel: record.get('fuel'),
      drive: record.get('drive'),
      price: record.get('price_eur'),
      air_pollution_score: record.get('air_pollution_score'),
      smartway: record.get('smartway'),
      greenhouse_gas_score: record.get('greenhouse_gas_score'),
      city_mpg: record.get('city_mpg'),
      hwy_mpg: record.get('hwy_mpg'),
      cmb_mpg: record.get('cmb_mpg'),
      display: record.get('display'),
      stnd: record.get('stnd'),
      stnd_description: record.get('stnd_description'),
      veh_class: record.get('veh_class'),
      underhood_id: record.get('underhood_id'),
      cyl: record.get('cyl'),
      
      
    }));
  } catch (error) {
    console.error('Error loading vehicles from Neo4j:', error);
    throw new Error('Failed to load vehicles from Neo4j.');
  } finally {
    await session.close();
  }
}

// ----------------------------------------------------------------------------
// create a router /checkonload that will call the function checkAndPopulateDatabase
router.get('/checkonload', 
  async (req, res) => {
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
      res.status(200).json({ message: 'Database check and population completed' });
    }
    catch (error) {
      console.error('Error during database check and population:', error);
      res.status(500).send('Internal server error during database initialization.');
    }
  }
);

// ----------------------------------------------------------------------------
// 1) Example route: loadNodes
router.get('/loadNodes', async (req, res) => {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    const fetchNodesQuery = `
      MATCH (n:cars)
      RETURN  n.vehicleName AS vehicleName, 
              n.model AS model,
              n.fuel AS fuel,
              n.air_pollution_score AS air_pollution_score,
              n.display AS display,
              n.cyl AS cyl,
              n.drive AS drive,
              n.stnd AS stnd,
              n.stnd_description AS stnd_description,
              n.cert_region as cert_region
              n.transmission AS transmission,
              n.underhood_id AS underhood_id,
              n.veh_class AS veh_class,
              n.city_mpg AS city_mpg,
              n.hwy_mpg AS hwy_mpg,
              n.cmb_mpg AS cmb_mpg,
              n.greenhouse_gas_score AS greenhouse_gas_score,
              n.smartway AS smartway,
              n.price_eur AS price_eur
        
    `;
    const result = await session.run(fetchNodesQuery);
    const nodes = result.records.map((record) => ({
      vehicleName: record.get('vehicleName'),
      model: record.get('model'),
      cert_region: record.get('cert_region'),
      transmission: record.get('transmission'),
      fuel: record.get('fuel'),
      drive: record.get('drive'),
      price: record.get('price_eur'),
      air_pollution_score: record.get('air_pollution_score'),
      smartway: record.get('smartway'),
      greenhouse_gas_score: record.get('greenhouse_gas_score'),
      city_mpg: record.get('city_mpg'),
      hwy_mpg: record.get('hwy_mpg'),
      cmb_mpg: record.get('cmb_mpg'),
      display: record.get('display'),
      stnd: record.get('stnd'),
      stnd_description: record.get('stnd_description'),
      veh_class: record.get('veh_class'),
      underhood_id: record.get('underhood_id'),
      cyl: record.get('cyl'),
    }));
    console.log('--> #nodes:', nodes.length);
    res.json(nodes);
  } catch (error) {
    console.error('Error fetching nodes:', error);
    res.status(500).send('Failed to load nodes.');
  } finally {
    await session.close();
  }
});

// 2) Example route: loadVehicles
router.get('/loadVehicles', async (req, res) => {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    const fetchVehiclesQuery = `
      MATCH (n:cars)
      RETURN v.vehicleName AS vehicleName, 
              v.model AS model,
              v.fuel AS fuel,
              v.air_pollution_score AS air_pollution_score,
              v.display AS display,
              v.cyl AS cyl,
              v.drive AS drive,
              v.stnd AS stnd,
              v.stnd_description AS stnd_description,
              v.cert_region AS cert_region,
              v.transmission AS transmission,
              v.underhood_id AS underhood_id,
              v.veh_class AS veh_class,
              v.city_mpg AS city_mpg,
              v.hwy_mpg AS hwy_mpg,
              v.cmb_mpg AS cmb_mpg,
              v.greenhouse_gas_score AS greenhouse_gas_score,
              v.smartway AS smartway,
              v.price_eur AS price_eur
    `;
    const result = await session.run(fetchVehiclesQuery);
    const vehicles = result.records.map((record) => ({
      vehicleName: record.get('vehicleName'),
      model: record.get('model'),
      transmission: record.get('transmission'),
      cert_region: record.get('cerd_region'),
      fuel: record.get('fuel'),
      drive: record.get('drive'),
      price: record.get('price_eur'),
      air_pollution_score: record.get('air_pollution_score'),
      smartway: record.get('smartway'),
      greenhouse_gas_score: record.get('greenhouse_gas_score'),
      city_mpg: record.get('city_mpg'),
      hwy_mpg: record.get('hwy_mpg'),
      cmb_mpg: record.get('cmb_mpg'),
      display: record.get('display'),
      stnd: record.get('stnd'),
      stnd_description: record.get('stnd_description'),
      veh_class: record.get('veh_class'),
      underhood_id: record.get('underhood_id'),
      cyl: record.get('cyl'),
    }));
    res.json(vehicles);
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    res.status(500).send('Failed to load vehicles.');
  } finally {
    await session.close();
  }
});

// 3) Example route: getOurRoutes (OpenRouteService with alternatives)
router.post('/getOurRoutes', async (req, res) => {
  const { locations, car } = req.body;

  if (!locations || locations.length < 2) {
    return res.status(400).send('At least two locations are required.');
  }

  const payload = JSON.stringify({
    coordinates: locations,
    alternative_routes: {
      target_count: 10,
      share_factor: 0.6,
      weight_factor: 1.2,
    },
    format: 'json',
    instructions: true,
  });

  const options = {
    hostname: 'api.openrouteservice.org',
    path: '/v2/directions/driving-car',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
      Authorization: config.ORS_Key,
    },
  };

  try {
    const orsResponse = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let responseData = '';
        response.on('data', (chunk) => {
          responseData += chunk;
        });
        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            try {
              resolve(JSON.parse(responseData));
            } catch (err) {
              reject(new Error('Failed to parse ORS response'));
            }
          } else {
            reject(new Error(`ORS request failed: ${response.statusCode} - ${responseData}`));
          }
        });
      });
      request.on('error', (err) => reject(err));
      request.write(payload);
      request.end();
    });

    const { routes } = orsResponse;
    const analyzedRoutes = await Promise.all(
      routes.map(async (route, index) => {
        const decoded = polylineLib.decode(route.geometry);
        // If you want elevation data, see your code logic...
        const totalStops = route.way_points.length - 2; // Excluding start/end
        const tollwayDistance = 0; // Your logic for tollway
        const elevationChanges = { totalElevationGain: 0, totalElevationLoss: 0 };

        return {
          routeIndex: index,
          distance: route.summary.distance,
          duration: route.summary.duration,
          tollwayDistance,
          totalStops,
          elevationChanges,
          geometry: route.geometry,
          instructions: route.segments.flatMap((segment) =>
            segment.steps.map((step) => ({
              instruction: step.instruction,
              distance: step.distance,
              duration: step.duration,
            }))
          ),
        };
      })
    );

    res.json({ routes: analyzedRoutes });
  } catch (error) {
    console.error('Error fetching ORS routes:', error.message);
    res.status(500).send('Failed to fetch routes with alternatives.');
  }
});

// 4) Example route: getRoutes (loading relationships from Neo4j)
router.get('/getRoutes', async (req, res) => {
  // Example query: adjust to your actual relationships
  const retrieveAllNodeRelationships = `
    MATCH (a:Node)-[r]->(b:Node)
    RETURN a AS a, b AS b, type(r) AS relType
  `;

  const session = driver.session({ database: config.neo4jDatabase });
  try {
    // Load all nodes first if you want names:
    const fetchNodeNamesQuery = `
      MATCH (n:Node)
      RETURN n.name AS name, n.latitude AS latitude, n.longitude AS longitude
    `;
    const nodeResult = await session.run(fetchNodeNamesQuery);
    const nodeNames = nodeResult.records.map((rec) => ({
      name: rec.get('name'),
      latitude: rec.get('latitude'),
      longitude: rec.get('longitude'),
    }));

    // Then load relationships
    const relResult = await session.run(retrieveAllNodeRelationships);
    const relationships = relResult.records.map((record) => {
      const a = record.get('a');
      const b = record.get('b');
      const relationshipType = record.get('relType');
      return {
        nodeA: {
          name: a.properties.name,
          vehicleName: a.properties.vehicleName,
          latitude: a.properties.latitude,
          longitude: a.properties.longitude,
        },
        nodeB: {
          name: b.properties.name,
          vehicleName: b.properties.vehicleName,
          latitude: b.properties.latitude,
          longitude: b.properties.longitude,
        },
        relationshipType,
      };
    });

    // If you have a simplifyRouteData, call it here...
    res.json(relationships);
  } catch (error) {
    console.error('Error loading node relationships:', error);
    res.status(500).send('Failed to load relationships.');
  } finally {
    await session.close();
  }
});

// 5) Example route: build an ASP rules string from DB stops & vehicles
router.get('/retrieveASPrules', async (req, res) => {
  try {
    const nodes = await loadStopsFromNeo4j();
    const vehicles = await loadVehiclesFromNeo4j();
    console.log('Loaded:', vehicles);
    let aspFacts = '';
    const processedNodes = new Set();

    // (a) node(...)
    let k=0;
  nodes.forEach((node) => {
    // Thoroughly remove invalid punctuation

    let nodeName = transliterate(node.name || k++)
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '')
      + '_' + k;

    if (!nodeName.match(/^[a-z]/)) {
      nodeName = 'node_' + nodeName; // Prefix if it doesn't start with a letter
    }

    if (!processedNodes.has(nodeName)) {
      processedNodes.add(nodeName);
    }

    // Convert latitude and longitude to strings
    const latitude = `"${node.latitude}"`;
    const longitude = `"${node.longitude}"`;

    // Generate ASP facts
    aspFacts += `node(${nodeName}).\n`;
    aspFacts += `latitude(${nodeName}, ${latitude}).\n`;
    aspFacts += `longitude(${nodeName}, ${longitude}).\n`;
    if (node.demand) {
      aspFacts += `demand(${nodeName}, ${node.demand}).\n`;
    }
  });


    // (b) vehicle(...)
    let i=0;
    vehicles.forEach((v) => {
      let vehicleID = transliterate(String(v.vehicleID || i++))
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '');
      if (!vehicleID.match(/^[a-z]/)) {
        vehicleID = 'vehicle_' + vehicleID;
      }

      aspFacts += `vehicle(${vehicleID}).\n`;
      if(v.fuel){
        aspFacts += `fuel(${vehicleID}, "${v.fuel}").\n`;
      }
      if(v.air_pollution_score){
        aspFacts += `air_pollution_score(${vehicleID}, "${v.air_pollution_score}").\n`;
      }
      if(v.transmission){
        aspFacts += `transmission(${vehicleID}, "${v.transmission}").\n`;
      }
      if(v.underhood_id){
        aspFacts += `underhood_id(${vehicleID}, "${v.underhood_id}").\n`;
      }
      if(v.veh_class){
        aspFacts += `veh_class(${vehicleID}, "${v.veh_class}").\n`;
      }
      if(v.city_mpg){
        aspFacts += `city_mpg(${vehicleID}, ${v.city_mpg}).\n`;
      }
      if(v.hwy_mpg){
        aspFacts += `hwy_mpg(${vehicleID}, ${v.hwy_mpg}).\n`;
      }
      if(v.cmb_mpg){
        aspFacts += `cmb_mpg(${vehicleID}, ${v.cmb_mpg}).\n`;
      }
      if(v.greenhouse_gas_score){
        aspFacts += `greenhouse_gas_score(${vehicleID}, "${v.greenhouse_gas_score}").\n`;
      }
      if(v.smartway){
        aspFacts += `smartway(${vehicleID}, "${v.smartway}").\n`;
      }
      if(v.price_eur){
        aspFacts += `price_eur(${vehicleID}, ${v.price_eur}).\n`;
      }
      if(v.display){
        aspFacts += `display(${vehicleID}, "${v.display}").\n`;
      }
      if(v.cyl){
        aspFacts += `cyl(${vehicleID}, ${v.cyl}).\n`;
      }
      if(v.drive){
        aspFacts += `drive(${vehicleID}, "${v.drive}").\n`;
      }
      if(v.stnd){
        aspFacts += `stnd(${vehicleID}, "${v.stnd}").\n`;
      }
      if(v.stnd_description){
        aspFacts += `stnd_description(${vehicleID}, "${v.stnd_description}").\n`;
      }
      if(v.cert_region){
        aspFacts += `cert_region(${vehicleID}, "${v.cert_region}").\n`;
      }

    });

    // (c) distance(A,B,C) via Haversine
    const allDistances = computeAllDistances(nodes);
    allDistances.forEach((dist) => {
      let fromName = transliterate(dist.from || '')
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '');
      if (!fromName.match(/^[a-z]/)) {
        fromName = 'unknown';
      }

      let toName = transliterate(dist.to || '')
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '');
      if (!toName.match(/^[a-z]/)) {
        toName = 'unknown';
      }

      aspFacts += `distance(${fromName}, ${toName}, ${dist.distance}).\n`;
    });

    return res.type('text/plain').send(aspFacts);
  } catch (err) {
    console.error('Error building ASP facts:', err);
    res.status(500).send('Error building ASP facts');
  }
});

// 6) run the python script (Clingo)
router.get('/runPythonScript', (req, res) => {
  try {
    const scriptPath = path.join(__dirname, 'clingoFiles', 'nemoClingoRouting.py');
    const lpFilePath = path.join(__dirname, 'clingoFiles', 'nemoRouting4AdoXX.pl');

    childProcess = execFile(
      'python3',
      [scriptPath, lpFilePath],
      { timeout: 70000 },
      (err, stdout, stderr) => {
        if (err) {
          console.error('Clingo execution error:', err);
          if (err.killed) {
            return res.status(504).send('Clingo script timed out.');
          }
          return res.status(500).send(err.message);
        }
        if (stderr) {
          console.error('Stderr from python script:', stderr);
        }
        console.log('Python script output:', stdout);

        // If your script prints JSON, parse it:
        let routeData;
        try {
          routeData = JSON.parse(stdout);
        } catch (parseError) {
          console.error('Could not parse JSON from stdout. Falling back...');
          routeData = [];
        }

        res.json({ routeData });
      }
    );
  } catch (error) {
    console.error('Error in /runPythonScript:', error);
    res.status(500).send('Error in runPythonScript');
  }
});

// 7) stop the python script
router.get('/stopPythonScript', (req, res) => {
  if (childProcess) {
    processStoppedByUser = true;
    childProcess.kill('SIGINT');
    console.log('Child process to retrieve CLINGO results stopped.');
    res.send('Clingo retrieval process stopped');
  } else {
    res.status(404).send('No process is running');
  }
});

// 8) delete all nodes
router.delete('/deleteAllNodes', async (req, res) => {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    await session.run('MATCH (n) DETACH DELETE n');
    res.status(200).json({ message: 'All nodes deleted successfully' });
  } catch (error) {
    console.error('Error deleting nodes:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// 9) delete all vehicles
router.delete('/deleteAllVehicles', async (req, res) => {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    await session.run('MATCH (v:Vehicle) DETACH DELETE v');
    res.status(200).json({ message: 'All vehicles deleted successfully' });
  } catch (error) {
    console.error('Error deleting vehicles:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// ----------------------------------------------------------------------------
// Start server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
