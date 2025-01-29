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

// Adjust the path to your config as needed
import * as config from './configApis/config.js';

// ----------------------------------------------------------
// Set up Express
// ----------------------------------------------------------
const app = express();
const port = process.env.PORT || 3000;

let childProcess = null;
let processStoppedByUser = false; // Track if process was stopped

// ----------------------------------------------------------
// Neo4j Driver
// ----------------------------------------------------------
export const driver = neo4j.driver(
  config.neo4jUrl,
  neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword)
);

// ----------------------------------------------------------
// Database Check & Populate
// ----------------------------------------------------------
async function isDatabaseEmpty() {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    const query = 'MATCH (n) RETURN count(n) AS node_count';
    const result = await session.run(query);
    const nodeCount = result.records[0].get('node_count').toNumber();
    return nodeCount === 0;
  } catch (error) {
    console.error('[ERROR] Checking DB empty:', error);
    throw error;
  } finally {
    await session.close();
  }
}

function populateDatabase() {
  return new Promise((resolve, reject) => {
    const pythonScriptPath = path.join(__dirname, '..', '..', 'initcars', 'load_neo4j.py');
    execFile('python3', [pythonScriptPath], (err, stdout, stderr) => {
      if (err) {
        console.error('[ERROR] Running Python script:', err);
        return reject(err);
      }
      if (stderr) {
        console.error('[ERROR] Python script stderr:', stderr);
      }
      console.log('[INFO] Python script output:', stdout);
      resolve();
    });
  });
}

async function checkAndPopulateDatabase(req, res, next) {
  try {
    console.log('[INFO] Checking if DB is empty...');
    const empty = await isDatabaseEmpty();
    if (empty) {
      console.log('[INFO] DB is empty. Populating...');
      await populateDatabase();
      console.log('[INFO] DB populated successfully.');
    } else {
      console.log('[INFO] DB is not empty. Skipping populate.');
    }
    next();
  } catch (error) {
    console.error('[ERROR] During DB check/population:', error);
    res.status(500).send('Internal server error during DB initialization.');
  }
}

// ----------------------------------------------------------
// Middleware
// ----------------------------------------------------------
app.use(
  cors({
    origin: '*', // or a specific origin array
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());

// If your static frontend is in `../../frontend`
const publicPath = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(publicPath));

// Use the optional DB-check middleware
app.use(checkAndPopulateDatabase);

// Serve main pages
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'homePage.html'));
});
app.get('/mainPage.html', (req, res) => {
  res.sendFile(path.join(publicPath, 'mainPage.html'));
});

// ----------------------------------------------------------
// Helpers
// ----------------------------------------------------------
function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

function computeHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // radius in meters
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function computeAllDistances(stops) {
  const distances = [];
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const A = stops[i];
      const B = stops[j];
      const distMeters = computeHaversineDistance(
        A.latitude,
        A.longitude,
        B.latitude,
        B.longitude
      );
      const distRounded = Math.round(distMeters);
      distances.push({ from: A.name, to: B.name, distance: distRounded });
      distances.push({ from: B.name, to: A.name, distance: distRounded });
    }
  }
  return distances;
}

// Log route names
function logRouteName(req, res, next) {
  if (req.path !== '/favicon.ico') {
    console.log(`\n-------------------------------------`);
    console.log(`ROUTE: ${req.path}  ${new Date().toString()}`);
  }
  next();
}

// Create /neo4j router
const router = express.Router();
app.use('/neo4j', router);
router.use(logRouteName);

// ----------------------------------------------------------
// Neo4j session helpers
// ----------------------------------------------------------
async function loadStopsFromNeo4j() {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    const query = `
      MATCH (n:Node)
      RETURN n.name AS name,
             n.latitude AS latitude,
             n.longitude AS longitude,
             n.people AS demand
    `;
    const result = await session.run(query);
    return result.records.map(rec => ({
      name: rec.get('name'),
      latitude: rec.get('latitude'),
      longitude: rec.get('longitude'),
      demand: rec.get('demand') || 0,
    }));
  } catch (error) {
    console.error('[ERROR] loadStopsFromNeo4j:', error);
    throw new Error('Failed to load stops.');
  } finally {
    await session.close();
  }
}
async function getVehicleFilters() {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    const query = `MATCH (v:Vehicle) RETURN v`;
    const result = await session.run(query);

    // Map the results and remove keys with null or NaN values
    return result.records.map(record => {
      const vehicle = record.get('v').properties;

      // Iterate over the keys and delete those with null or NaN values
      for (const key in vehicle) {
        if (vehicle[key] === null || (typeof vehicle[key] === 'number' && isNaN(vehicle[key]))) {
          delete vehicle[key];
        }
      }

      return vehicle;
    });
  } catch (error) {
    console.error('[ERROR] getVehicleFilters:', error);
    throw new Error('Failed to get vehicle filters.');
  } finally {
    await session.close();
  }
}




async function mergeVehiclesFromNeo4j(filters) {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    const vehicleResults = [];

    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      const whereClauses = [];
      const params = {};

      for (const key in filter) {
        if (filter[key] !== null && filter[key] !== undefined && key !== "vehicleID") {
          const value = filter[key];

          // Check the type of the value and format appropriately
          if (typeof value === "string") {
            // For strings, use quotes
            whereClauses.push(`v.${key} = "${value}"`);
          } else if (typeof value === "number") {
            // For numbers, use the raw value (no quotes)
            whereClauses.push(`v.${key} = ${value}`);
          } else if (value instanceof Date) {
            // For dates, format to ISO string and use quotes
            whereClauses.push(`v.${key} = date("${value.toISOString()}")`);
          } else {
            // For other types, convert to string as a fallback
            whereClauses.push(`$v.${key} = "${String(value)}"`);
          }

          // Assign the value to the params object
          params[key] = value;
        }
      }


      // Skip empty filters
      if (whereClauses.length === 0) {
        console.log(`[DEBUG] No valid filters for index ${i}, skipping query.`);
        continue;
      }

      const whereString = `WHERE ${whereClauses.join(" AND ")}`;
      console.log(`[DEBUG] whereString for filter ${i}: ${whereString}`);
      console.log(`[DEBUG] params for filter ${i}:`, params);

      const query = `
        MATCH (v:cars)
        ${whereString}
        RETURN v
      `;

      const result = await session.run(query, params);

      // Process results
      result.records.forEach((record) => {
        const vehicle = record.get("v").properties;

        // Add the vehicle ID to the object
        vehicle.vehicleID = record.get("v").identity.toInt();

        // Save the full object to the results
        vehicleResults.push(vehicle);
      });
    }

    return vehicleResults;
  } catch (error) {
    console.error("[ERROR] mergeVehiclesFromNeo4j:", error);
    throw new Error("Failed to fetch vehicles for filters.");
  } finally {
    await session.close();
  }
}



async function loadVehiclesFromNeo4j() {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    const query = `
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
    const result = await session.run(query);
    if (!result.records.length) {
      console.warn('[WARN] No vehicles found in DB.');
    }
    return result.records.map(record => ({
      vehicleName: record.get('vehicleName'),
      model: record.get('model'),
      fuel: record.get('fuel'),
      air_pollution_score: record.get('air_pollution_score'),
      display: record.get('display'),
      cyl: record.get('cyl'),
      drive: record.get('drive'),
      stnd: record.get('stnd'),
      stnd_description: record.get('stnd_description'),
      cert_region: record.get('cert_region'),
      transmission: record.get('transmission'),
      underhood_id: record.get('underhood_id'),
      veh_class: record.get('veh_class'),
      city_mpg: record.get('city_mpg'),
      hwy_mpg: record.get('hwy_mpg'),
      cmb_mpg: record.get('cmb_mpg'),
      greenhouse_gas_score: record.get('greenhouse_gas_score'),
      smartway: record.get('smartway'),
      price_eur: record.get('price_eur'),
    }));
  } catch (error) {
    console.error('[ERROR] loadVehiclesFromNeo4j:', error);
    throw new Error('Failed to load vehicles.');
  } finally {
    await session.close();
  }
}

// ----------------------------------------------------------
// /checkonload route -> calls checkAndPopulateDatabase
// ----------------------------------------------------------
router.get('/checkonload', async (req, res) => {
  try {
    console.log('[INFO] Checking if DB is empty...');
    const empty = await isDatabaseEmpty();
    if (empty) {
      console.log('[INFO] DB empty, populating...');
      await populateDatabase();
      console.log('[INFO] DB populated successfully.');
    } else {
      console.log('[INFO] DB not empty, skipping populate.');
    }
    res.status(200).json({ message: 'Database check + population done.' });
  } catch (error) {
    console.error('[ERROR] During DB check/populate:', error);
    res.status(500).send('Internal server error during DB initialization.');
  }
});

// ----------------------------------------------------------
// 1) /loadNodes example
// ----------------------------------------------------------
router.get('/loadNodes', async (req, res) => {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    const query = `
      MATCH (n:cars)
      RETURN n.vehicleName AS vehicleName,
             n.model AS model,
             n.fuel AS fuel,
             n.air_pollution_score AS air_pollution_score,
             n.display AS display,
             n.cyl AS cyl,
             n.drive AS drive,
             n.stnd AS stnd,
             n.stnd_description AS stnd_description,
             n.cert_region AS cert_region,
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
    const result = await session.run(query);
    const nodes = result.records.map(rec => ({
      vehicleName: rec.get('vehicleName'),
      model: rec.get('model'),
      cert_region: rec.get('cert_region'),
      transmission: rec.get('transmission'),
      fuel: rec.get('fuel'),
      drive: rec.get('drive'),
      price: rec.get('price_eur'),
      air_pollution_score: rec.get('air_pollution_score'),
      smartway: rec.get('smartway'),
      greenhouse_gas_score: rec.get('greenhouse_gas_score'),
      city_mpg: rec.get('city_mpg'),
      hwy_mpg: rec.get('hwy_mpg'),
      cmb_mpg: rec.get('cmb_mpg'),
      display: rec.get('display'),
      stnd: rec.get('stnd'),
      stnd_description: rec.get('stnd_description'),
      veh_class: rec.get('veh_class'),
      underhood_id: rec.get('underhood_id'),
      cyl: rec.get('cyl'),
    }));
    res.json(nodes);
  } catch (error) {
    console.error('[ERROR] /loadNodes:', error);
    res.status(500).send('Failed to load nodes.');
  } finally {
    session.close();
  }
});

router.get('/populateVehiclesFromCars', async (req, res) => {
  try {
    const vehicles = await loadVehiclesFromNeo4j();
    res.json(vehicles);
  } catch (error) {
    console.error('[ERROR] /populateVehiclesFromCars:', error);
    res.status(500).send('Failed to load vehicles.');
  }
});

// ----------------------------------------------------------
// 2) /loadVehicles example
// ----------------------------------------------------------
router.get('/loadVehicles', async (req, res) => {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    const query = `
      MATCH (n:cars)
      RETURN n.vehicleName AS vehicleName,
             n.model AS model,
             n.fuel AS fuel,
             n.air_pollution_score AS air_pollution_score,
             n.display AS display,
             n.cyl AS cyl,
             n.drive AS drive,
             n.stnd AS stnd,
             n.stnd_description AS stnd_description,
             n.cert_region AS cert_region,
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
    const result = await session.run(query);
    const vehicles = result.records.map(rec => ({
      vehicleName: rec.get('vehicleName'),
      model: rec.get('model'),
      transmission: rec.get('transmission'),
      cert_region: rec.get('cert_region'), // correct key
      fuel: rec.get('fuel'),
      drive: rec.get('drive'),
      price: rec.get('price_eur'),
      air_pollution_score: rec.get('air_pollution_score'),
      smartway: rec.get('smartway'),
      greenhouse_gas_score: rec.get('greenhouse_gas_score'),
      city_mpg: rec.get('city_mpg'),
      hwy_mpg: rec.get('hwy_mpg'),
      cmb_mpg: rec.get('cmb_mpg'),
      display: rec.get('display'),
      stnd: rec.get('stnd'),
      stnd_description: rec.get('stnd_description'),
      veh_class: rec.get('veh_class'),
      underhood_id: rec.get('underhood_id'),
      cyl: rec.get('cyl'),
    }));
    res.json(vehicles);
  } catch (error) {
    console.error('[ERROR] /loadVehicles:', error);
    res.status(500).send('Failed to load vehicles.');
  } finally {
    session.close();
  }
});


/**
 * 2. Convert an encoded 2D polyline to a GeoJSON LineString in [lon, lat] order.
 */
function polylineToGeojsonLineString(encodedPolyline) {
  const decoded = polylineLib.decode(encodedPolyline); // Decode polyline into array
  if (decoded.length < 2) {
    console.error("🚨 Polyline decoded to less than 2 points:", decoded);
  }
  return {
    type: "LineString",
    coordinates: decoded.map(([lat, lon]) => [lon, lat]) // Convert to GeoJSON format
  };
}
// ----------------------------------------------------------
// 3) /getOurRoutes -> OpenRouteService
// ----------------------------------------------------------
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
      const request = https.request(options, response => {
        let responseData = '';
        response.on('data', chunk => (responseData += chunk));
        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            try {
              const json = JSON.parse(responseData);
              resolve(json);
            } catch (err) {
              reject(new Error('Failed to parse ORS response'));
            }
          } else {
            reject(
              new Error(
                `ORS request failed: ${response.statusCode} - ${responseData}`
              )
            );
          }
        });
      });
      request.on('error', err => reject(err));
      request.write(payload);
      request.end();
    });

    const { routes } = orsResponse;
    const analyzedRoutes = await Promise.all(
      routes.map((route, index) => {
        const decoded = polylineLib.decode(route.geometry);
        const totalStops = route.way_points.length - 2;
        const tollwayDistance = 0;
        const elevationChanges = { totalElevationGain: 0, totalElevationLoss: 0 };
        return {
          routeIndex: index,
          distance: route.summary.distance,
          duration: route.summary.duration,
          tollwayDistance,
          totalStops,
          elevationChanges,
          geometry: route.geometry,
          instructions: route.segments.flatMap(seg =>
            seg.steps.map(step => ({
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
    console.error('[ERROR] /getOurRoutes:', error.message);
    res.status(500).send('Failed to fetch routes with alternatives.');
  }
});

/**
 * 7. Process a single route:
 *    - decode geometry => GeoJSON => fetch elevation => compute stats => return route data
 */
async function processSingleRoute(route, orsKey) {
  const encoded2D = route.geometry;
  // convert 2D polyline => GeoJSON linestring
  const geoLine = polylineToGeojsonLineString(encoded2D);
  // fetch 3D data
  const elevationResult = await fetchElevationLine(geoLine, orsKey);
  const coords3D = elevationResult.geometry.coordinates;
  const { totalElevationGain, totalElevationLoss } = computeElevationStats(coords3D);
  // placeholders
  const totalStops = (route.way_points.length || 2) - 2;
  const tollwayDistance = 0;

  return {
    distance: route.summary.distance,
    duration: route.summary.duration,
    geometry: route.geometry,
    instructions: route.segments.flatMap((seg) =>
      seg.steps.map((step) => ({
        instruction: step.instruction,
        distance: step.distance,
        duration: step.duration,
      }))
    ),
    totalStops: totalStops,
    tollwayDistance: tollwayDistance,
    elevationGain: totalElevationGain, 
    elevationLoss: totalElevationLoss,
  };
}

// Helper for analyzing routes (if you want it separately)
async function fetchAndAnalyzeRoutes(locations, configObj) {
  if (!locations || locations.length < 2) {
    throw new Error('At least two locations are required.');
  }

  let payloadObj = {
    coordinates: locations,
    format: 'json',
    instructions: true,
    elevation: true,
  };
  if (locations.length === 2) {
    payloadObj.alternative_routes = {
      target_count: 3,
      share_factor: 0.6,
      weight_factor: 1.2,
    };
  }
  const payload = JSON.stringify(payloadObj);
  const myConfigObj = { ORS_Key: "5b3ce3597851110001cf624853b2f7dc05e44b6e89a90eea9f3d135e"};
  const options = {
    hostname: 'api.openrouteservice.org',
    path: '/v2/directions/driving-car',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
      Authorization: myConfigObj.ORS_Key,
    },
  };

  try {
    const orsResponse = await new Promise((resolve, reject) => {
      const request = https.request(options, response => {
        let responseData = '';
        response.on('data', chunk => (responseData += chunk));
        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            try {
              const json = JSON.parse(responseData);
              resolve(json);
            } catch (err) {
              reject(new Error('Failed to parse ORS response JSON'));
            }
          } else {
            reject(
              new Error(
                `ORS request failed: HTTP ${response.statusCode} - ${responseData}`
              )
            );
          }
        });
      });
      request.on('error', err => reject(err));
      request.write(payload);
      request.end();
    });

    const { routes } = orsResponse;

    const analyzed = await Promise.all(routes.map(async (route, index) => {
      const singleRoute = await processSingleRoute(route, myConfigObj.ORS_Key);
      if (!singleRoute) {
        console.error(`Skipping route ${index} due to missing data.`);
        return null;
      }
      return {
        routeIndex: index,
        distance: singleRoute.distance,
        duration: singleRoute.duration,
        geometry: singleRoute.geometry,
        instructions: route.segments.flatMap(seg =>
          seg.steps.map(step => ({
            instruction: step.instruction,
            distance: step.distance,
            duration: step.duration,
          }))
        ),
        totalStops: singleRoute.totalStops,
        tollWayDistance: singleRoute.tollwayDistance,
        elevationGain: singleRoute.elevationGain,
        elevationLoss: singleRoute.elevationLoss,
        
      };
    }));

    // ✅ Fix: Filter only valid results
    return analyzed.filter(route => route !== null);
  } catch (error) {
    console.error('[ERROR] fetchAndAnalyzeRoutes:', error.message);
    throw new Error('Failed to fetch routes with alternatives.');
  }
}

// ----------------------------------------------------------
// 4) /getRoutes - relationships
// ----------------------------------------------------------
router.get('/getRoutes', async (req, res) => {
  const retrieveAllNodeRelationships = `
    MATCH (a:Node)-[r]->(b:Node)
    RETURN a AS a, b AS b, type(r) AS relType
  `;
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    // If you want node details
    const fetchNodeNamesQuery = `
      MATCH (n:Node)
      RETURN n.name AS name, n.latitude AS latitude, n.longitude AS longitude
    `;
    const nodeResult = await session.run(fetchNodeNamesQuery);
    const nodeNames = nodeResult.records.map(rec => ({
      name: rec.get('name'),
      latitude: rec.get('latitude'),
      longitude: rec.get('longitude'),
    }));

    const relResult = await session.run(retrieveAllNodeRelationships);
    const relationships = relResult.records.map(record => {
      const a = record.get('a');
      const b = record.get('b');
      const relType = record.get('relType');
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
        relationshipType: relType,
      };
    });
    res.json(relationships);
  } catch (error) {
    console.error('[ERROR] /getRoutes:', error);
    res.status(500).send('Failed to load relationships.');
  } finally {
    session.close();
  }
});

/**
 * Fetch a 2D route from ORS Directions (no elevation).
 * @param {Array<Array<number>>} locations - Array of [longitude, latitude] pairs.
 * @param {string} orsKey - Your ORS API key.
 * @returns {Promise<Object>} - The parsed directions response with 2D geometry.
 */
function fetch2DDirections(locations, orsKey) {
  return new Promise((resolve, reject) => {
    if (!locations || locations.length < 2) {
      return reject(new Error('At least two locations are required.'));
    }

    // Request payload: 2D geometry only
    const payloadObj = {
      coordinates: locations, // e.g. [ [lon, lat], [lon, lat], ... ]
      format: 'json',
      instructions: true,
    };

    // If exactly 2 points, optionally request alternative routes
    if (locations.length === 2) {
      payloadObj.alternative_routes = {
        target_count: 10,
        share_factor: 0.6,
        weight_factor: 1.2,
      };
    }

    const payload = JSON.stringify(payloadObj);
    const options = {
      hostname: 'api.openrouteservice.org',
      path: '/v2/directions/driving-car',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Authorization: orsKey,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (err) {
            reject(new Error('Failed to parse ORS Directions response'));
          }
        } else {
          reject(
            new Error(
              `Directions request failed: HTTP ${res.statusCode} - ${data}`
            )
          );
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(payload);
    req.end();
  });
}


/**
 * Fetch a 3D linestring from ORS Elevation/line endpoint using a GeoJSON LineString.
 * @param {Object} geoLine - A GeoJSON LineString in [lon, lat] order.
 * @param {string} orsKey - Your ORS API key.
 * @returns {Promise<Object>} - The Elevation API response with 3D geometry.
 */
function fetchElevationLine(geoLine, orsKey) {
  return new Promise((resolve, reject) => {
    const payloadObj = {
      format_in: 'geojson',
      format_out: 'geojson',
      geometry: geoLine,
    };

    const payload = JSON.stringify(payloadObj);
    const options = {
      hostname: 'api.openrouteservice.org',
      path: '/elevation/line',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Authorization: orsKey,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (err) {
            reject(new Error('Failed to parse ORS Elevation response'));
          }
        } else {
          reject(
            new Error(`Elevation request failed: HTTP ${res.statusCode} - ${data}`)
          );
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

/**
 * Compute total elevation gain and loss from a 3D linestring.
 * @param {Array<Array<number>>} coords3D - Array of [lon, lat, elev].
 * @returns {{ totalElevationGain: number, totalElevationLoss: number }}
 */
function computeElevationStats(coords3D) {
  let totalElevationGain = 0;
  let totalElevationLoss = 0;
  for (let i = 1; i < coords3D.length; i++) {
    const prevElev = coords3D[i - 1][2] || 0;
    const currElev = coords3D[i][2] || 0;
    const diff = currElev - prevElev;
    if (diff > 0) {
      totalElevationGain += diff;
    } else {
      totalElevationLoss += Math.abs(diff);
    }
  }
  return { totalElevationGain, totalElevationLoss };
}

/** 
* For one pair of points, fetch route + elevation + stats.
* @param {Array<Array<number>>} pair - [ [lon1, lat1], [lon2, lat2] ]
* @param {string} orsKey
* @returns {Promise<Object>} 
*/
async function fetchRouteWithElevationForPair(pair, orsKey) {
 // 1) fetch directions (2D)
 const directionsData = await fetch2DDirections(pair, orsKey);
 if (!directionsData.routes || directionsData.routes.length === 0) {
   return null; // or throw new Error('No routes found')
 }

 // Take first route for simplicity
 const route = directionsData.routes[0];

 // 2) build GeoJSON for elevation
 const geoLine = polylineToGeojsonLineString(route.geometry);

 // 3) get 3D from elevation
 const elevationRes = await fetchElevationLine(geoLine, orsKey);
 if (!elevationResult || !elevationResult.geometry || !elevationResult.geometry.coordinates) {
  console.error('Failed to fetch elevation data:', elevationResult);
  return null;
}
 const coords3D = elevationRes.geometry.coordinates;

 // 4) compute stats
 const { totalElevationGain, totalElevationLoss } = computeElevationStats(coords3D);

 return {
   distance: route.summary.distance,
   duration: route.summary.duration,
   instructions: route.segments.flatMap((seg) =>
     seg.steps.map((step) => ({
       instruction: step.instruction,
       distance: step.distance,
       duration: step.duration,
     }))
   ),
   elevationChanges: { totalElevationGain, totalElevationLoss },
   geometry: route.geometry,
 };
}

/**
 * Generate all unique 2-point pairs from an array.
 * e.g., [p1, p2, p3] => [[p1, p2], [p1, p3], [p2, p3]]
 */
function generatePairs(points) {
  const pairs = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      pairs.push([points[i], points[j]]);
    }
  }
  return pairs;
}


/**
 * Given an array of points, generate all 2-sets, fetch route + elevation for each pair.
 * @param {Array<Array<number>>} points - array of [lon, lat]
 * @param {string} orsKey
 * @returns {Promise<Array<Object>>} array of results, each containing { pair, routeData }
 */
async function fetchAllPairRoutesWithElevation(points, orsKey) {
  const pairs = generatePairs(points); // produce all [p1, p2]
  
  const promises = pairs.map(async (pair) => {
    const routeData = await fetchRouteWithElevationForPair(pair, orsKey);
    return {
      pair,
      routeData,
    };
  });

  return Promise.all(promises);
}


function coordToNodeName([lon, lat]) {
  // Or do something more robust (like rounding or hashing)
  let name = `pt_${lon.toFixed(4)}_${lat.toFixed(4)}`;
  return name.toLowerCase().replace(/[^a-z0-9_]+/g, '');
}


// ----------------------------------------------------------
// 5) /retrieveASPrules - Build ASP facts
// ----------------------------------------------------------
router.get('/retrieveASPrules', async (req, res) => {
  try {
    const nodes = await loadStopsFromNeo4j();
    const vehiclesFilters = await getVehicleFilters();
    const vehicles = await mergeVehiclesFromNeo4j(vehiclesFilters);
    let aspFacts = '';

    // Generate node facts
    nodes.forEach((node) => {
      let nodeName = transliterate(node.name || '').toLowerCase().replace(/[^a-z0-9_]+/g, '');
      if (!nodeName.match(/^[a-z]/)) {
        nodeName = 'node_' + nodeName;
      }
      aspFacts += `node(${nodeName}).\n`;
      aspFacts += `latitude(${nodeName}, "${node.latitude}").\n`;
      aspFacts += `longitude(${nodeName}, "${node.longitude}").\n`;
      if (node.demand) {
        aspFacts += `demand(${nodeName}, ${node.demand}).\n`;
      }
    });
    let i = 0;
    // Generate vehicle facts
    vehicles.forEach((v) => {
      let vehicleID = 'vehicle_' + i++;
      aspFacts += `vehicle(${vehicleID}).\n`;
      for (const key in v) {
        if (v[key] !== null && v[key] !== undefined) {
          aspFacts += `${key}(${vehicleID}, ${typeof v[key] === 'string' ? `"${v[key]}"` : v[key]}).\n`;
        }
      }
    });

    const addNumericFact = (predicate, ...args) => {
      aspFacts += `${predicate}(${args.join(', ')}).
`;
    };


    const locations = nodes.map((node) => [node.longitude, node.latitude]);

    const pairs = generatePairs(locations);
    const allRoutes = [];
    const config1 = {ORS_key: config.ORS_Key};
    for (const pair of pairs) {
      const routes = await fetchAndAnalyzeRoutes(pair, config1);
      // Now 'routes' is an array of route objects 
      // but we also want to store the 'pair'
      routes.forEach((r) => {
        allRoutes.push({
          fromCoord: pair[0],
          toCoord: pair[1],
          routeData: r,
        });
      });
    }

    const alpha = 1.0;  // Weight for distance
    const beta = 1.0;   // Weight for time
    const gammaUp = 1.0;  // Weight for elevation gain
    const gammaDown = 0.5;  // Weight for elevation loss (less impact)

    allRoutes.forEach((route, index) => {
      const {routeData} = route;
      const routeId = `r${index + 1}`;

      const fromNode = coordToNodeName(route.fromCoord);
      const toNode = coordToNodeName(route.toCoord);

      const distance = routeData.distance ?? 0;
      const duration = routeData.duration ?? 0;
      const elevationGain = routeData.elevationGain;
      const elevationLoss = routeData.elevationLoss;
      const totalStops = routeData.totalStops ?? 0;

      const cost = (alpha * distance) + (beta * duration) + 
      (gammaUp * elevationGain) - (gammaDown * elevationLoss);


      aspFacts += `routeEdge(${routeId}, ${fromNode}, ${toNode}).\n`;
      addNumericFact('route', routeId);
      addNumericFact('time', routeId, duration);
      addNumericFact('total_stops', routeId, totalStops);
      addNumericFact('elevation_gain', routeId, elevationGain);
      addNumericFact('elevation_loss', routeId, elevationLoss);
      addNumericFact('cost', routeId, cost);  

    });




    // Generate distance facts
    const allDistances = computeAllDistances(nodes);
    allDistances.forEach((dist) => {
      let fromName = transliterate(dist.from || '').toLowerCase().replace(/[^a-z0-9_]+/g, '');
      let toName = transliterate(dist.to || '').toLowerCase().replace(/[^a-z0-9_]+/g, '');
      aspFacts += `distance(${fromName}, ${toName}, ${dist.distance}).\n`;
    });

    res.type('text/plain').send(aspFacts);
  } catch (err) {
    console.error('Error building ASP facts:', err);
    res.status(500).send('Error building ASP facts');
  }
});


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
// ----------------------------------------------------------

// ----------------------------------------------------------
// 7) stopPythonScript
// ----------------------------------------------------------
router.get('/stopPythonScript', (req, res) => {
  if (childProcess) {
    processStoppedByUser = true;
    childProcess.kill('SIGINT');
    res.send('Clingo retrieval process stopped');
  } else {
    res.status(404).send('No process is running');
  }
});

// ----------------------------------------------------------
// 8) deleteAllNodes
// ----------------------------------------------------------
router.delete('/deleteAllNodes', async (req, res) => {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    await session.run('MATCH (n) DETACH DELETE n');
    res.status(200).json({ message: 'All nodes deleted successfully' });
  } catch (error) {
    console.error('[ERROR] /deleteAllNodes:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    session.close();
  }
});

// ----------------------------------------------------------
// 9) deleteAllVehicles
// ----------------------------------------------------------
router.delete('/deleteAllVehicles', async (req, res) => {
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    await session.run('MATCH (v:Vehicle) DETACH DELETE v');
    res.status(200).json({ message: 'All vehicles deleted successfully' });
  } catch (error) {
    console.error('[ERROR] /deleteAllVehicles:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    session.close();
  }
});

// ----------------------------------------------------------
// Start server
// ----------------------------------------------------------
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
