# file: nemoClingoRouting.py
import requests
import sys
import subprocess
import json

def fetch_asp_facts():
    """GET the facts from your Node service."""
    url = 'http://localhost:8000/neo4j/retrieveASPrules'
    resp = requests.get(url)
    if resp.status_code != 200:
        raise Exception(f"Failed to fetch ASP facts: {resp.text}")
    return resp.text

def run_clingo(main_lp_file):
    # 1. Fetch ASP facts from Node
    asp_facts = fetch_asp_facts()

    # 2. Write them to a temp file
    with open("tempFacts.lp", "w") as f:
        f.write(asp_facts)

    # 3. Run Clingo
    cmd = [
        "clingo",
        main_lp_file,  # e.g., "nemoRouting4AdoXX.lp"
        "tempFacts.lp",
        "--opt-mode=optN",
        "--quiet=1,2"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise Exception(f"Clingo error: {result.stderr}")

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
        if 'route(' in line:
            # e.g. 'route(v1,stopa,stopb) route(v1,stopb,stopc)'
            entries = line.strip().split()
            for e in entries:
                if e.startswith("route("):
                    e = e.strip('.')  # remove trailing dot
                    e = e.replace('route(', '').replace(')', '')
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
