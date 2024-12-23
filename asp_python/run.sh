#!/bin/bash

# Run the Python script with the specified argument
pip3 install clingo
python3 asp.py assign1.pl
python3 asp.py assign1_with_minimize.pl
python3 asp.py assign2.pl
python3 asp.py assign3_3x3.pl
python3 asp.py assign3_5x5.pl
python3 asp.py assign3_10x10.pl
