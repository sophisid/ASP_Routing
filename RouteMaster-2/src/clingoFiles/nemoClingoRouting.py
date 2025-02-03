import requests
import sys
import subprocess
import json
import re

def fetch_asp_facts():
    """GET the facts from your Node service."""
    url = 'http://localhost:3000/neo4j/retrieveASPrules'
    resp = requests.get(url)
    return resp.text

def run_clingo(main_lp_file):
    asp_facts = fetch_asp_facts()
    
    with open("tempFacts.pl", "w") as f:
        f.write(asp_facts)

    cmd = [
        "clingo",
        main_lp_file,  # "nemoRouting4AdoXX.pl"
        "tempFacts.pl",
        "--opt-mode=optN",
        "--quiet=1,2"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    
    if "FOUND" not in result.stdout and "FOUND" not in result.stderr:
        raise Exception("Clingo did not find any solution or model.")

    return result.stdout

def extract_best_solution_block(clingo_output):
    lines = clingo_output.splitlines()
    
    best_solution_block = []
    current_solution_block = []
    in_answer_block = False
    
    for line in lines:
        if line.startswith("Answer:"):
            in_answer_block = True
            current_solution_block = []
        elif line.startswith("OPTIMUM FOUND") or line.startswith("UNKNOWN"):
            best_solution_block = current_solution_block
            break
        else:
            if in_answer_block:
                current_solution_block.append(line)

    if current_solution_block and not best_solution_block:
        best_solution_block = current_solution_block

    return "\n".join(best_solution_block)

def parse_clingo_solution(solution_block):

    route_facts = []
    pattern = r'routeEdge\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\)'
    matches = re.findall(pattern, solution_block)
    for (vehicle, from_node, to_node) in matches:
        route_facts.append((vehicle.strip(), from_node.strip(), to_node.strip()))
    
    return route_facts

if __name__ == "__main__":
    main_lp = sys.argv[1] 
    full_output = run_clingo(main_lp)

    best_solution_text = extract_best_solution_block(full_output)

    route_edges = parse_clingo_solution(best_solution_text)

    print(json.dumps(route_edges, indent=2))
