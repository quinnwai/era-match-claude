#!/usr/bin/env python3
"""Run the full evaluation suite and output scores."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tests.test_evaluation import run_full_evaluation

if __name__ == "__main__":
    run_full_evaluation()
