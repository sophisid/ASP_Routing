HY567 2024 Project - Route Management and Optimization System for Vehicles

This program aims to simulate a route management and optimization system for
 vehicles, such as buses or mass transit vehicles. Its primary feature will be
  the ability to find the optimal route for each vehicle to serve a series of 
  points of interest (stops) in the most efficient way.

Each point of interest represents a stop for vehicles and should store 
information such as the name, stop color, as well as geographical coordinates.

Neo4j can be used as the database to store static information about stops 
(name, geographical coordinates) and dynamic information such as the route each vehicle follows.

The system offers a map-based interface for creating and deleting stops.



Installation
%%%%%%%%%%%%

Install Neo4j Desktop and start a DBMS.

Configure the API settings in the two (2) config.js files found in 
folders neo4j*/web/configAPIs and RouteMaster*/src/configApis/

In command line, go to folder neo4j*\web and run the following command:

python3 -m http.server

Also, go to RouteMaster-2/src and run the following commands: 
npm i
npm install @mapbox/polyline
node mainServer.mjs 

Once the server is up&running, open your web browser (better not Safari) 
and enter the following URL in the address bar:
http://localhost:8000/frontend/homePage.html

If you see the map, without any popup message, the 
connection with Neo4j is correctly set and you can start placing nodes. 
Otherwise doublecheck your credentials in the config files


Development
%%%%%%%%%%%

You can modify the following functions to enhance the GUI.


For nodes:

The function that stores nodes to Neo4j is located in file neo4j*/web/main.js 
and is called updateMarkersOnMap(). Modify const storeNodeQuery to extend the node properties, 
based on your KG schema.

In order to add new textboxes to the "Create a stop..." popup, modify the mainPage.html file. 
Then, in neo4j*/web/main.js, locate the "//Get the modal input fields" part and extend accordingly.


Important Note! Clingo does not work with special characters, such as greek or german characters
(α, β, γ... ä, ö, ü, ß, etc). If your map generates such characters, make sure you don't transfer 
them in your clingo encoding; either remove them or work with IDs (you don't really need the street 
names for reasoning).


---

For vehicles:

In order to store vehicles to neo4j, add an appropriate cypher query inside the function 
createVehicleInNeo4j() found in the neo4j*/web/vehicleConf.js file. 


In order to add new textboxes to the "Vehicle Configuration" popup, modify the function 
generateVehicleConfigFields() inside file neo4j*/web/vehicleConf.js

To erase all vehicles stored in the KG, add an appropriate cypher query inside the 
function clearAllVehiclesFromDB() found in the neo4j*/web/vehicleConf.js file. 

If needed, the query to fetch vehicles will be written in the loadVehiclesFromNeo4j() 
function, in main.js


---

For reasoning:

Run your python script that generates routes as a separate 
(standalone) program. Avoid using the GUI menu item; for large problem instances, 
clingo will not be able to terminate and it is better to kill it manually.


