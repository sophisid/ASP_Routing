```markdown
# HY567 2024 Project 
## Route Management and Optimization System

A map-based solution for creating/deleting stops and selecting vehicles in Neo4j, then finding optimized routes.

### Installation

1. **Neo4j Desktop**: Install and start a DBMS (defaults OK).
2. **Edit `config.js`**: In `neo4j*/web/configAPIs` and `RouteMaster*/src/configApis/`.
3. **Neo4j Web**:
   ```bash
   cd neo4j*/web
   python3 -m http.server
   ```
4. **RouteMaster**:
   ```bash
   cd RouteMaster-2/src
   npm i
   npm install @mapbox/polyline
   node mainServer.mjs
   ```
5. **Open**: `http://localhost:8000/frontend/homePage.html`

### Usage

- **Stops**: Click on the map to create or remove them.
- **Vehicles**: Use the Vehicle Config popup (fuel type, mpg, emissions, etc.). 
- **Optimal Route**: Press “Find Routes” to compute best path and car choice.

### Troubleshooting

- **Map Error**: Check Neo4j credentials in `config.js`.
- **No Routes**: Ensure at least two stops or verify constraints.
- **Port Errors**: Stop conflicting services, then rerun.

### Future Ideas

- Add passenger capacities or advanced multi-vehicle constraints.
- Extend UI with more input fields and styling.

