import clingo
import sys

# Prints answer sets
def on_model(model):
    global has_solution
    has_solution = True
    print("Answer Set:")
    print("\n".join(str(atom) for atom in model.symbols(atoms=True)))
    print()  # Add a new line for better readability

def main():
    # Check if asp file exists
    if len(sys.argv) != 2:
        print("Usage: python solve_assignments.py <asp_file>")
        sys.exit(1)

    # Read file
    asp_file = sys.argv[1]
    try:
        with open(asp_file, "r") as file:
            asp_program = file.read()
    except FileNotFoundError:
        print("Error: File '{}' not found.".format(asp_file))
        sys.exit(1)

    control = clingo.Control()

    # Add the asp
    control.add("base", [], asp_program)

    # Ground
    control.ground([("base", [])])

    # Solve
    global has_solution
    has_solution = False
    result = control.solve(on_model=on_model)

    # Check if satisfiable
    if not has_solution:
        print("No answer set found.")
        sys.exit(1)

if __name__ == "__main__":
    main()
