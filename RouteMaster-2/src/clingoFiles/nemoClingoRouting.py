import requests
import sys
import subprocess
import json

def fetch_asp_facts():
    """GET the facts from your Node service."""
    url = 'http://localhost:3000/neo4j/retrieveASPrules'
    resp = requests.get(url)
    return resp.text

def run_clingo(main_lp_file):
    # 1. Fetch ASP facts from Node
    asp_facts = fetch_asp_facts()
    # 2. Write them to a temp file
    with open("tempFacts.pl", "w") as f:
        f.write(asp_facts)

    with open("tempFacts.pl", "r") as f:
        temp_contents = f.read()
    # print("tempFacts.pl contents:\n", temp_contents)
    # 3. Run Clingo
    cmd = [
        "clingo",
        main_lp_file,  # e.g., "nemoRouting4AdoXX.pl"
        "tempFacts.pl",
        "--opt-mode=optN",
        "--quiet=1,2"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if "FOUND" not in result.stdout and "FOUND" not in result.stderr:
        raise Exception("Clingo did not find any solution or model.")

    return result.stdout

def parse_clingo_solution(output):
    """
    Parse lines like:
      route(v1,stopa,stopb) route(v1,stopb,stopc) ...
    We'll extract them into a matrix or JSON.
    """
    # We'll look for lines that start with "route("
    lines = output.splitlines()
    route_facts = []
    for line in lines:
        if 'routeEdge(' in line:
            # e.g. 'route(v1,stopa,stopb) route(v1,stopb,stopc)'
            entries = line.strip().split()
            for e in entries:
                if e.startswith("routeEdge("):
                    e = e.strip('.')  # remove trailing dot
                    e = e.replace('routeEdge(', '').replace(')', '')
                    parts = e.split(',')
                    if len(parts) == 3:
                        vehicle, fromNode, toNode = parts
                        route_facts.append((vehicle, fromNode, toNode))
    return json.dumps(route_facts)

if __name__ == "__main__":
    main_lp = sys.argv[1] 
    output = run_clingo(main_lp)
    route_facts = parse_clingo_solution(output)
    print(route_facts)  # or print JSON


