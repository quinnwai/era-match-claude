#!/usr/bin/env python3
"""Entry point for the ERA Network Slack bot."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.slack_bot import start

if __name__ == "__main__":
    start()
