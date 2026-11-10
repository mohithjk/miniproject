#!/usr/bin/env python3
"""
Replay Webhooks Script for AI Project Coordinator.
Sends HMAC-SHA256 signed GitHub push & ping webhook payloads from a JSON file
of real commit history to test and demo the entire flow.
"""
from scripts.simulate_webhooks import main

if __name__ == "__main__":
    main()
