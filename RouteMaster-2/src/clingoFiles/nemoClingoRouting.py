import sys
import subprocess
import json

def run_clingo(lp_file):
    try:
        result = subprocess.run(
            ["clingo", lp_file, "--outf=2"],  # '--outf=2' ensures JSON output
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            clingo_output = json.loads(result.stdout)
            # Process the JSON output
            return clingo_output
        else:
            print("Clingo error:", result.stderr)
            return None
    except Exception as e:
        print("Error running Clingo:", str(e))
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python nemoClingoRouting.py <path_to_lp_file>")
        sys.exit(1)

    lp_file = sys.argv[1]
    result = run_clingo(lp_file)
    if result:
        # Extract and return the matrix or other relevant information
        print(json.dumps(result))
    else:
        sys.exit(1)