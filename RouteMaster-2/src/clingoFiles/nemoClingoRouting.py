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
        main_lp_file,
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

    data = {
        "positions": [],
        "label": [],
        "best_vehicle": None,
        "best_model": None
    }

    pattern_pos = r'pos\(\s*([^,]+)\s*,\s*(\d+)\s*\)'
    matches_pos = re.findall(pattern_pos, solution_block)
    for (node, step_str) in matches_pos:
        data["positions"].append({
            "node": node.strip(),
            "step": int(step_str)
        })

    data["positions"].sort(key=lambda x: x["step"])

    pattern_bv = r'best_vehicle\(\s*([^)]+)\s*\)'
    matches_bv = re.findall(pattern_bv, solution_block)
    if matches_bv:
        data["best_vehicle"] = matches_bv[0].strip()

    pattern_model = r'best_model\(\s*([^)]+)\s*\)'
    matches_model = re.findall(pattern_model, solution_block)
    if matches_model:
        data["best_model"] = matches_model[0].strip()

    pattern_label = r'label\(\s*([^,]+)\s*,\s*([^)]+)\s*\)'
    matches_label = re.findall(pattern_label, solution_block)
    for (node, label) in matches_label:
        data["label"].append({
            "node": node.strip(),
            "label": label.strip()
        })
    return data

if __name__ == "__main__":
    main_lp = sys.argv[1] 
    full_output = run_clingo(main_lp)

    best_solution_text = extract_best_solution_block(full_output)
    parsed_data = parse_clingo_solution(best_solution_text)

    print(json.dumps(parsed_data, indent=2))
