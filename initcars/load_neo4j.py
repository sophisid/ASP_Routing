import os
from pathlib import Path
import pandas as pd
from neo4j import GraphDatabase

# Determine the current script's directory
current_dir = Path(__file__).resolve().parent

# Dynamically construct file paths relative to the script's location
Vehicles25_path = current_dir / "VehicleList_2025.csv"
Vehicles10_path = current_dir / "VehicleList_2010.csv"

# Load CSV files
df25 = pd.read_csv(Vehicles25_path)
df10 = pd.read_csv(Vehicles10_path)


NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "mypassword"


def is_db_empty(driver):
    with driver.session() as session:
        query = "MATCH (n) RETURN count(n) AS node_count"
        result = session.run(query).single()
        return result["node_count"] == 0


# Function to load data into Neo4j
def load_to_neo4j(driver, dataframe, label_name):
    with driver.session() as session:
        for _, row in dataframe.iterrows():
            query = f"""
            CREATE (:{label_name}  {{
                model: $Model,
                display: $Displ,
                cyl: $Cyl,
                transmission: $Trans,
                drive_type: $Drive,
                fuel: $Fuel,
                cert_region: $Cert_Region,
                stnd: $Stnd,
                stnd_description: $Stnd_Description,
                veh_class: $Veh_Class,
                air_pollution_score: $Air_Pollution_Score,
                city_mpg: $City_MPG,
                hwy_mpg: $Hwy_MPG,
                cmb_mpg: $Cmb_MPG,
                greenhouse_gas_score: $Greenhouse_Gas_Score,
                smartway: $SmartWay,
                price_eur: $Price_EUR,
                underhood_id: $Underhood_ID
            }})
            """
            # Convert NaN to None
            row = row.where(pd.notnull(row), None)
            session.run(query, **row.to_dict())


try:
    driver = GraphDatabase.driver(
        NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD)
    )  # No authentication
    if is_db_empty(driver):
        load_to_neo4j(driver, df25, label_name="cars")
        load_to_neo4j(driver, df10, label_name="cars")
        print("Loaded Cars!")
    else:
        print("Dbms is not empty, skipping data loading!")
except Exception as e:
    print(f"Error: {e}")
finally:
    driver.close()
