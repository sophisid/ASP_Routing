// with the esm module, we can now have import and require at the same file!
// import { driver } from './mainClient';
import * as config from './configApis/config';
import neo4j from 'neo4j-driver';
import express from 'express';
import path from 'path';
import https from 'https';
import fs from 'fs';
// Replaces non-ASCII characters with an ASCII approximation, or if none exists, a replacement character which defaults to "?".
import { transliterate } from 'inflected';    // https://www.npmjs.com/package/inflected#inflectortransliterate

const cors = require('cors')
const { execFile } = require('child_process');
let childProcess;
let processStoppedByUser = false; // Flag to track if the process was stopped intentionally

const app = express();
const port = process.env.PORT || 80;

// Function to create a Neo4j driver
export const driver = neo4j.driver(
    config.neo4jUrl,
    neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword)
);

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
    res.sendFile(path.join(web, 'frontend', 'mainPage.html'));
});


const simplifyRouteData = (data) => {
    const vehicles = {};
    const vehiclesStartEnd = {};

    console.log('-------------------------------------\nBEFORE DATA SIMPLIFICATION:\n',data);

    data.forEach(entry => {
        const vehicleName = entry.nodeA.vehicleName;

        if (!vehicles[vehicleName] && vehicleName !== undefined) {
            vehicles[vehicleName] = [];
        }
        if (!vehiclesStartEnd[vehicleName]) {
            vehiclesStartEnd[vehicleName] = {};
        }
        if (entry.relationshipType === "START_TO_ROUTE") {
            vehiclesStartEnd[entry.nodeB.vehicleName] =  {
                ...vehiclesStartEnd[entry.nodeB.vehicleName], 
                'routeStartName': entry.nodeA.name,                
            };
            if (entry.nodeA.name === entry.nodeB.name) {
                vehiclesStartEnd[entry.nodeB.vehicleName] =  {
                    ...vehiclesStartEnd[entry.nodeB.vehicleName],
                    'routeStartServed': true
                };
            } else {
                vehiclesStartEnd[entry.nodeB.vehicleName] =  {
                    ...vehiclesStartEnd[entry.nodeB.vehicleName],
                    'routeStartServed': false
                };
            }
        } else if (entry.relationshipType === "ROUTE_TO_END") {
            vehiclesStartEnd[entry.nodeA.vehicleName] =  {
                ...vehiclesStartEnd[entry.nodeA.vehicleName], 
                'routeEndName': entry.nodeB.name,
                'routeEnd': {
                    name:           entry.nodeB.name,                  
                    latitude:       entry.nodeB.latitude,
                    longitude:      entry.nodeB.longitude
                }
            };
            if (entry.nodeA.name === entry.nodeB.name) {
                vehiclesStartEnd[entry.nodeA.vehicleName] =  {
                    ...vehiclesStartEnd[entry.nodeA.vehicleName],
                    'routeEndServed': true
                };
            } else {
                vehiclesStartEnd[entry.nodeA.vehicleName] =  {
                    ...vehiclesStartEnd[entry.nodeA.vehicleName],
                    'routeEndServed': false
                };
            }
        } else {
            // check if a stop with the same name already exists
            const stopExists = (vehicle, stopName) => {
                return vehicle.some(stop => stop.name === stopName);
            };
            // Add nodeA if it doesn't already exist
            if (!stopExists(vehicles[vehicleName], entry.nodeA.name)) {
                vehicles[vehicleName].push({
                    name:           entry.nodeA.name,                    
                    latitude:       entry.nodeA.latitude,
                    longitude:      entry.nodeA.longitude
                });
            }
            // Add nodeB if it doesn't already exist and is different from nodeA
            if (entry.nodeA.name !== entry.nodeB.name && !stopExists(vehicles[vehicleName], entry.nodeB.name)) {
                vehicles[vehicleName].push({
                    name:           entry.nodeB.name,                   
                    latitude:       entry.nodeB.latitude,
                    longitude:      entry.nodeB.longitude
                });
            }
        }
    });
    Object.keys(vehicles).map(vehicleName => {
        console.log("----------------------------vehicles---------------------------",vehicleName,'\n',vehicles[vehicleName]);
        console.log('vehicles[vehicleName][0].name:\t',vehicles[vehicleName][0].name);

        // Add the routeStart at the beginning if not first stop as well 
        if (vehicles[vehicleName][0].name !== vehiclesStartEnd[vehicleName].routeStartName) {
            vehicles[vehicleName].unshift(vehiclesStartEnd[vehicleName].routeStart);
        }
            
        let lastEntry = vehicles[vehicleName][vehicles[vehicleName].length - 1];
        if (lastEntry.name !== vehiclesStartEnd[vehicleName].routeEndName) {
            vehicles[vehicleName].push(vehiclesStartEnd[vehicleName].routeEnd);
        }
    });
    const simplifiedData = Object.keys(vehicles).map(vehicleName => ({
        vehicleName,
        stops:              vehicles[vehicleName],
    }));

    return simplifiedData;
};
const logRouteName = (req, res, next) => {
    if (req.path !== '/favicon.ico')    // avoid double logging
        console.log(`-----------------------------------------------------------------------------------------------------------------\n-------> ROUTE: ${req.path}\t\t${new Date().toString()}`);
    next();
}
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

////////////////////////////////////////////////////////////////////////////////////////
// Define routes
const router = express.Router();
app.use('/neo4j', router);
// Use the logging middleware for all routes
router.use(logRouteName);

// load nodes from neo4j and return them as a simple json object
router.get('/loadNodes', async (req, res) => {
    try {
        var session = driver.session({ database: config.neo4jDatabase });

        //Write a Cypher query to fetch all nodes from the Neo4j database.
        const fetchNodesQuery = `
            MATCH (n:Node)
            RETURN n.latitude AS latitude, 
                   n.longitude AS longitude, 
                   n.name AS name, 
                   n.nodeColor AS nodeColor, 
                   n.vehicleName AS vehicleName
        `;

        session.run(fetchNodesQuery)
        .then(result => {
            const nodes = result.records.map(record => ({
                latitude:       record.get("latitude"),
                longitude:      record.get("longitude"),
                name:           record.get("name"),
                nodeColor:      record.get("nodeColor"),     
                vehicleName:    (record.get("vehicleName") ? record.get("vehicleName") : ""),
            }));
            console.log('--> #nodes:', nodes.length);
            res.json(nodes);
        }).catch(error => {
            console.error("Error fetching nodes from Neo4j:", error);
            res.status(500).send('Failed to load nodes.');
        }).then(() => {
            session.close();
        });

    } catch (error) {
        console.error('Error loading nodes:', error);
        res.status(500).send('Failed to load nodes.');
    }
});


// load vehicles from neo4j and return them as a simple json object
router.get('/loadVehicles', async (req, res) => {
    try {
        var session = driver.session({ database: config.neo4jDatabase });

        const fetchVehiclesQuery = `
            MATCH (v:Vehicle)
            RETURN 
                v.vehicleID AS vehicleID, 
                v.capacity AS capacity
        `;

        session.run(fetchVehiclesQuery)
        .then(result => {
            const vehicles = result.records.map(record => ({
                vehicleID:  record.get("vehicleID"),
                capacity:   record.get("capacity"),               
            }));
            res.json(vehicles);
        }).catch(error => {
            console.error("Error fetching vehicles from Neo4j:", error);
            res.status(500).send('Failed to load vehicles.');
        }).then(() => {
            session.close();
        })
    } catch (error) {
        console.error('Error loading vehicles:', error);
        res.status(500).send('Failed to load vehicles.');
    }
});

// load relationships between nodes from the Neo4j db
// to retrieve the routes
// as created by the openrouting service from the UI
router.get('/getRoutes', async (req, res) => {
    let nodeNames = [];
    async function loadNodeNames() {
        try {
            var session = driver.session({ database: config.neo4jDatabase });

            const fetchNodeNamesQuery = `
                MATCH (n:Node)
                RETURN n.name AS name, n.latitude AS latitude, n.longitude AS longitude
            `;
            const result = await session.run(fetchNodeNamesQuery);
            nodeNames = result.records.map(record => {
                return {
                    name:        record.get("name"), 
                    latitude:    record.get("latitude"),
                    longitude:   record.get("longitude"),
                }
            });
            await session.close();
        } catch (error) {
            console.error('Error loading nodes:', error);
            res.status(500).send('Failed to load nodes.');
        }
    }

    try {
        await loadNodeNames();

        var session = driver.session({ database: config.neo4jDatabase });
        const retrieveAllNodeRelationships = ``;

        const relationships = [];

        const result = await session.run(retrieveAllNodeRelationships);
        result.records.map(record => {
            // Extract properties from the record fields
            const a = record.get("a");
            const b = record.get("b");
            var relationshipType = record.get("type(r)");

            // Extract properties from node 'a' and 'b'
            const nodeAProperties = {
                name:        a.properties.name,
                vehicleName: a.properties.vehicleName,
                latitude:    a.properties.latitude,
                longitude:   a.properties.longitude,
            };
            const nodeBProperties = {
                name:        b.properties.name,
                vehicleName: b.properties.vehicleName,
                latitude:    b.properties.latitude,
                longitude:   b.properties.longitude,
            };
            // Construct relationship object
            const relationship = {
                nodeA: nodeAProperties,
                nodeB: nodeBProperties,
                relationshipType: relationshipType,
            };
            // Push the relationship object to the array
            relationships.push(relationship);
        });

        // Let's simplify the json - GROUP BY vehicleName
        const simplifiedData = simplifyRouteData(relationships);
        // extract all stops that are currently assigned to vehicles
        const assignedStops = new Set();
        simplifiedData.forEach(vehicle => {
            vehicle.stops.forEach(stop => {
                assignedStops.add(stop.name);
            });
        });

        // filter nodeNames to find those not included into any route
        // const missingNodes = nodeNames.filter(node => !assignedStops.has(node.name));

        ////////////////////////////////////////////////////////////////////////////////////
        // Check routeStartServed and add first stop to missingNodes if necessary
        const missingNodesSet = new Set(nodeNames.map(node => node.name));

        simplifiedData.forEach(vehicle => {
            console.log('--------------------------------------Checking routestart:\n',vehicle);
            if (!vehicle.routeStartServed && vehicle.stops.length > 0) {
                const firstStop = vehicle.stops[0];
                // Only add to missingNodesSet if it's not already assigned by another vehicle
                if (!assignedStops.has(firstStop.name)) {
                    missingNodesSet.add(firstStop.name);
                }
            }
        });
        // Remove served nodes from missingNodesSet
        assignedStops.forEach(stopName => {
            missingNodesSet.delete(stopName);
        });
        // Convert missingNodesSet back to array of node objects
        const missingNodes = nodeNames.filter(node => missingNodesSet.has(node.name));
        ////////////////////////////////////////////////////////////////////////////////////

        // create new object for all the unassigned stops
        const unassignedVehicle = {
            "vehicleName": "unassigned",
            "stops": missingNodes
        };

        simplifiedData.push(unassignedVehicle);

        res.json(simplifiedData);
        await session.close();
    } catch (error) {
        console.log('Error loading all node relationships from Neo4j:', error);
        res.status(500).send('Failed to load all node relationships.');
    }
});

router.get('/getRoutesFromORS', async (req, res) => {
    let locations, stopNames, storedNodes, vehicleConfig;

    // load the nodes first to get coordinate arrays
    async function loadNodes() {
        try {
            var session = driver.session({ database: config.neo4jDatabase });

            //Write a Cypher query to fetch all nodes with their latitude, longitude, and name from the Neo4j database.
            const fetchNodesQuery = `MATCH (n:Node)
                        RETURN n.latitude AS latitude, 
                        n.longitude AS longitude, 
                        n.name AS name`;

            const result = await session.run(fetchNodesQuery);
            const nodes = result.records.map(record => {
                return {
                    latitude:       record.get("latitude"),
                    longitude:      record.get("longitude"),
                    name:           record.get("name"),
                }
            });
            storedNodes = nodes;

            locations = storedNodes.map(node => [node.longitude, node.latitude]);
            stopNames = storedNodes.map(node => node.name); // Extract node names

            console.log('-------Loaded Nodes:\n--------nodes:',nodes,'\n--------locations:',locations,'\n--------stopNames:',stopNames);

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
            var session = driver.session({ database: config.neo4jDatabase });

            const fetchVehiclesQuery = ``;
            const result = await session.run(fetchVehiclesQuery);
            const vehicles = result.records.map(record => ({
                vehicleID:  record.get("vehicleID"),
                capacity:   record.get("capacity"),           
            }));
            vehicleConfig = vehicles.map(v => {  
                const vehicle = {
                    id: v.vehicleID,          // Store the original vehicle ID from your configuration
                    profile: 'driving-car',
                    capacity: [v.capacity],
                };
                return vehicle;
            });
        } catch (error) {
            console.error('Error loading vehicles:', error);
            res.status(500).send('Failed to load vehicles.');
        }
    }
    await loadVehicles();

    console.log('-------------vehicle config for optimization API:',vehicleConfig);

    const busStops = storedNodes.map((node,index) => ({
        id: index + 2, 
        latitude: node.latitude,
        longitude: node.longitude,
        name: node.name,
    }));
    const jobs = busStops.map

    const nenaApiKey = config.nenaORSkey;
    const options = {
        hostname: 'api.openrouteservice.org',
        path: '/optimization',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
            'Authorization': nenaApiKey
        }
    };


});

// load nodes and vehicles from neo4j & convert their info into ASP rules 
// using a matrix of each node's [longitude, latitude], find distances between all nodes & convert each distance into an ASP rule
// return all the ASP rules in the form of a REALLY big string
router.get('/retrieveASPrules', async (req, res) => {
    let locations, stopNames, postData, storedNodes;
    let durationsString = '', nodeVehicleDeclarations = '', nodesInfoString = '', vehiclesInfoString = '';
    

    // load the nodes first and append to nodesString
    async function loadNodes() {
        try {
            var session = driver.session({ database: config.neo4jDatabase });

            //Write a Cypher query to fetch all nodes with their latitude, longitude, and name from the Neo4j database.
            const fetchNodesQuery = ``;

            const result = await session.run(fetchNodesQuery);
            const nodes = result.records.map(record => {
        

                return {
                    latitude:       record.get("latitude"),
                    longitude:      record.get("longitude"),
                    name:           transliterate(record.get("name")),   // replace all the special characters, clingo has very simple enconding                    
                }
            });

            storedNodes = nodes.map(node => ({
                ...node,
            }));

            locations = storedNodes.map(node => [node.longitude, node.latitude]);
            stopNames = storedNodes.map(node => node.name); // Extract node names
            postData = JSON.stringify({ locations });

            // replace all the special characters, clingo has very simple enconding
            storedNodes.map(node => {
                let nodeName = (node.name).toLowerCase().replace(/\s/g, '');
                nodeVehicleDeclarations += ('node('+nodeName+').');               
            })            
            await session.close();
        } catch (error) {
            console.error('Error loading nodes:', error);
            res.status(500).send('Failed to load nodes.');
        }
    }
    await loadNodes();

    // load the vehicles next and append to vehiclesString
    async function loadVehicles() {
        try {
            var session = driver.session({ database: config.neo4jDatabase });

            const fetchVehiclesQuery = ``;

            const result = await session.run(fetchVehiclesQuery);
            const vehicles = result.records.map(record => ({
                vehicleID:  record.get("vehicleID"),
                capacity:   record.get("capacity"),
            }));
            vehicles.map(vehicle => {                
                // replace all the special characters, clingo has very simple enconding           
                nodeVehicleDeclarations += ('vehicle(v'+vehicle.vehicleID+').');
                vehiclesInfoString += ('capacity(v'+vehicle.vehicleID+', '+vehicle.capacity+').');
                console.log("--> vehicle: v",vehicle.vehicleID,"\tcapacity: ",vehicle.capacity);               
            })
        } catch (error) {
            console.error('Error loading vehicles:', error);
            res.status(500).send('Failed to load vehicles.');
        }
    }
    await loadVehicles();

    const request = https.request(options, (response) => {
        let data = '';

        // A chunk of data has been received.
        response.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received.
        response.on('end', () => {
            if (response.statusCode === 200) {
                const jsondata   = JSON.parse(data);
                const durations  = jsondata.durations;
                const numOfNodes = JSON.parse(postData).locations.length;
                console.log('---> Number of nodes: ',numOfNodes);

                res.json({durations, rulesString: (nodeVehicleDeclarations+nodesInfoString+vehiclesInfoString+durationsString)});
            } else {
                if (response.statusCode === 503) {
                    res.status(response.statusCode).send('Matrix service unavailable.');
                } else 
                    res.status(response.statusCode).send('Failed to load matrix with distances between nodes, from OpenRouting Service.');
            }
        });
    });

    // Write the data to the request body
    request.write(postData);
    request.end();
});





// run the python script that gets the results for each route from clingo
// the python script calls the "retrieveASPrules" service (below) to get its input
router.get('/runPythonScript', async (req, res) => {
    try {
        const scriptPath = path.join(__dirname, 'clingoFiles');
        const lpFilePath = path.join(scriptPath, 'nemoRouting4AdoXX.lp');

        console.log('Script Path:', scriptPath);

        // Check if the .lp file exists
        if (!fs.existsSync(lpFilePath)) {
            console.error(`Error: File ${lpFilePath} does not exist.`);
            return res.status(500).send(`Error: File ${lpFilePath} does not exist.`);
        }

        const pythonScriptPath = path.join(scriptPath, 'nemoClingoRouting.py');
        const pythonExecutable = 'python'; // or 'python3', depending on your setup

        console.log(`Executing script: ${pythonExecutable} ${pythonScriptPath} ${lpFilePath}`);

        childProcess = execFile(pythonExecutable, [pythonScriptPath, lpFilePath], { cwd: scriptPath, timeout: 70000 }, (err, stdout, stderr) => {
            if (err) {
                if (processStoppedByUser) {
                    console.log('Process killed by user');
                    return res.send('Clingo retrieval process stopped');
                }
                else if (err.killed) {
                    console.error('Execution error: script timed out',res.statusCode);
                    return res.status(504).send('Clingo script execution timed out!');
                }
                console.error('Execution error:', err);
                return res.status(500).send(err.message);
            }
            if (stderr) {
                console.error('Python script stderr:', stderr);
            }
            console.log('Python script output:', stdout);
            const { matrix } = extractMatrixFromClingoAS(stdout);
            if (matrix) {
                // sort and group the matrix by vehicle
                const sortedMatrix = sortMatrix(matrix);
                const groupedMatrix = groupMatrixByVehicle(sortedMatrix);
                res.json({ groupedMatrix});
            }
            else
                res.status(500).send('Matrix not found in the output.');
        });
    } catch (error) {
        console.error('Error in runPythonScript:', error);
        res.status(500).send('Error in runPythonScript');
    }
});

// kill the /runPythonScript
router.get('/stopPythonScript', (req, res) => {
    if (childProcess) {
        processStoppedByUser = true;
        childProcess.kill('SIGINT');  // Sending SIGINT to stop the process gracefully
        console.log('Child process to retrieve CLINGO results stopped.',res.statusCode);
        res.send('Clingo retrieval process stopped');
    } else {
        res.status(404).send('No process is running');
    }
});

// delete all nodes from db
router.delete('/deleteAllNodes', async (req, res) => {
    try {
        var session = driver.session({ database: config.neo4jDatabase });

        //Write the Cypher query to delete all nodes from the Neo4j database.
        const deleteAllNodesQuery = "";

        const result = await session.run(deleteAllNodesQuery);
        await session.close();
        res.status(200).json({ message: 'All nodes deleted successfully' });
    } catch (error) {
        console.error('Error deleting nodes:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// delete all vehicles from db
router.delete('/deleteAllVehicles', async (req, res) => {
    try {
        const session = driver.session({ database: config.neo4jDatabase });

        //Write the Cypher query to delete all vehicles from the Neo4j database.
        const deleteAllVehiclesQuery = "";

        const result = await session.run(deleteAllVehiclesQuery);
        await session.close();
        res.status(200).json({ message: 'All vehicles deleted successfully' });
    } catch (error) {
        console.error('Error deleting nodes:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


////////////////////////////////////////////////////////////////////////////////////////
// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
