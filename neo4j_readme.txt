Restarting neo4j

Move into the bin directory of neo4j in my case
neo4j/neo4j-community-5.26.0/bin

To restart the dbms use --> neo4j restart.

to use queries use cypher-shell and enter neo4j username and password

Load the cars into the database using 

python load_neo4j.py

example query 

MATCH (c) where c.Air_Pollution_Score < 10 RETURN c.Model, c.Air_Pollution_Score ORDER BY c.Air_Pollution_Score ASC;
