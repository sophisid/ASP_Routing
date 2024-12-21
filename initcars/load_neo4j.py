import pandas as pd
from neo4j import GraphDatabase

Vehicles25_path = "VehicleList_2025.csv"
Vehicles10_path = "VehicleList_2010.csv"

df25 = pd.read_csv(Vehicles25_path)
df10 = pd.read_csv(Vehicles10_path)

# print(df25.head())

# Check column names and data types
# print("\nColumn names:")
# print(df25.columns)

# print("\nData types:")
# print(df25.dtypes)

NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "neo4j"


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
                Model: $Model,
                Displ: $Displ,
                Cyl: $Cyl,
                Trans: $Trans,
                Drive: $Drive,
                Fuel: $Fuel,
                Cert_Region: $Cert_Region,
                Stnd: $Stnd,
                Stnd_Description: $Stnd_Description,
                Veh_Class: $Veh_Class,
                Air_Pollution_Score: $Air_Pollution_Score,
                City_MPG: $City_MPG,
                Hwy_MPG: $Hwy_MPG,
                Cmb_MPG: $Cmb_MPG,
                Greenhouse_Gas_Score: $Greenhouse_Gas_Score,
                SmartWay: $SmartWay,
                Price_EUR: $Price_EUR
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
