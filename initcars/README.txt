## Overview

This script loads vehicle data from two CSV files (`VehicleList_2025.csv` and `VehicleList_2010.csv`) into a Neo4j graph database as `CAR` nodes. Each node includes details such as the vehicle model, transmission type, fuel type, air pollution score, and price.

## Requirements

- **Python 3.7+**
- **Neo4j** (Community or Enterprise Edition)
- Python Libraries: `pandas`, `neo4j`
- CSV files: `VehicleList_2025.csv`, `VehicleList_2010.csv`

## Installation

1. Install dependencies:
   ```
   pip install pandas neo4j
   ```

2. Update Neo4j credentials in the script:
   ```
    NEO4J_URI = "bolt://localhost:7687"
    NEO4J_USER = "neo4j"
    NEO4J_PASSWORD = "mypassword"
   ```

3. Place the CSV files in the same directory as the script.

## Usage

1. Run the script:
   ```
   python load_vehicles.py
   ```

2. The script will:
   - Check if the database is empty.
   - Load the vehicle data if empty, or skip if not.

## Schema

- **Node Label**: `CAR`
- **Properties**:
  - `Model`, `Trans`, `Drive`, `Fuel`, `Air_Pollution_Score`, `Price_EUR`, etc.

## Example Output

- Database empty:
  ```
  Loaded Cars!
  ```
- Database not empty:
  ```
  Dbms is not empty, skipping data loading!
  ```