import requests
import sys
import subprocess
import json

def fetch_asp_facts(filters=None):
    """
    GET facts passing 'filters' as query params.
    E.g., ?air_pollution_score=2&city_mpg=4&fuel=Hybrid&smartway=ELITE
    """
    base_url = "http://localhost:3000/neo4j/retrieveASPrules"
    resp = requests.get(base_url, params=filters)
    if resp.status_code != 200:
        raise Exception(f"Failed to fetch ASP facts: {resp.text}")
    return resp.text

def run_clingo(main_lp_file, filters=None):
    asp_facts = fetch_asp_facts(filters)
    with open("tempFacts.lp", "w") as f:
        f.write(asp_facts)

    cmd = [
        "clingo",
        main_lp_file,  # e.g., "nemoRouting4AdoXX.lp"
        "tempFacts.lp",
        "--opt-mode=optN",
        "--quiet=1,2"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    return result.stdout

def parse_clingo_solution(output):
    lines = output.splitlines()
    route_facts = []
    for line in lines:
        if 'route(' in line:
            entries = line.strip().split()
            for e in entries:
                if e.startswith("route("):
                    e = e.strip('.')
                    e = e.replace('route(', '').replace(')', '')
                    parts = e.split(',')
                    if len(parts) == 3:
                        vehicle, fromNode, toNode = parts
                        route_facts.append((vehicle, fromNode, toNode))
    return json.dumps(route_facts)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python nemoClingoRouting.py <main_lp_file> [key=value pairs...]")
        sys.exit(1)
    
    main_lp = sys.argv[1]
    filters = {}

    for arg in sys.argv[2:]:
        # e.g. "air_pollution_score=2"
        if "=" in arg:
            key, value = arg.split("=", 1)
            try:
                numVal = float(value)
                if numVal.is_integer():
                    numVal = int(numVal)
                filters[key] = numVal
            except ValueError:
                # not numeric
                filters[key] = value
        else:
            print(f"Warning: argument '{arg}' is not in key=value form, ignoring.")

    output = run_clingo(main_lp, filters)
    route_facts = parse_clingo_solution(output)
    print(route_facts)
