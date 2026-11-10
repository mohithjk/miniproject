#!/usr/bin/env python3
"""
Replay Webhooks Script for AI Project Coordinator.
Sends HMAC-SHA256 signed GitHub push & ping webhook payloads from a JSON file
of real commit history to test and demo the entire flow.
"""
import os
import sys

# Add backend directory to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from scripts.simulate_webhooks import main

if __name__ == "__main__":
    main()
