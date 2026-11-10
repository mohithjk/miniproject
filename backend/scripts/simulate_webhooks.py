#!/usr/bin/env python3
"""
Webhook Simulator Script for AI Project Coordinator.
Sends HMAC-SHA256 signed GitHub push & ping webhook payloads from a JSON file
of real commit history to test and demo the entire flow.
"""

import argparse
import hashlib
import hmac
import json
import os
import sys
import time
import uuid

import httpx


def sign_payload(secret: str, payload_bytes: bytes) -> str:
    """Compute GitHub HMAC-SHA256 signature."""
    mac = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256)
    return f"sha256={mac.hexdigest()}"


def send_webhook(
    client: httpx.Client,
    url: str,
    secret: str,
    event_type: str,
    payload: dict,
) -> httpx.Response:
    """Send an HMAC-signed GitHub webhook request."""
    raw_body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    signature = sign_payload(secret, raw_body)
    delivery_id = str(uuid.uuid4())

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "GitHub-Hookshot/simulator",
        "X-GitHub-Event": event_type,
        "X-GitHub-Delivery": delivery_id,
        "X-Hub-Signature-256": signature,
    }

    return client.post(url, content=raw_body, headers=headers)


def main():
    parser = argparse.ArgumentParser(
        description="Simulate GitHub webhooks using a real commit history JSON file."
    )
    parser.add_argument(
        "--url",
        default="http://localhost:8000/webhooks/github",
        help="Target webhook endpoint (default: http://localhost:8000/webhooks/github)",
    )
    parser.add_argument(
        "--secret",
        required=True,
        help="Project webhook secret for HMAC-SHA256 signature verification",
    )
    parser.add_argument(
        "--repo-owner",
        default="alice-org",
        help="Repository owner/org name (default: alice-org)",
    )
    parser.add_argument(
        "--repo-name",
        default="demo-app",
        help="Repository name (default: demo-app)",
    )
    parser.add_argument(
        "--file",
        default=os.path.join(os.path.dirname(__file__), "sample_commits.json"),
        help="Path to JSON file containing commit history list",
    )
    parser.add_argument(
        "--branch",
        default="main",
        help="Target git branch (default: main)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.0,
        help="Delay in seconds between simulated push events (default: 1.0)",
    )
    parser.add_argument(
        "--no-ping",
        action="store_true",
        help="Skip initial GitHub ping handshake webhook",
    )

    args = parser.parse_args()

    if not os.path.exists(args.file):
        # Fallback check in simulator dir
        alt_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../simulator/sample_commits.json"))
        if os.path.exists(alt_path):
            args.file = alt_path
        else:
            print(f"Error: Commit history file not found: {args.file}")
            sys.exit(1)

    with open(args.file, "r", encoding="utf-8") as f:
        commits = json.load(f)

    if not isinstance(commits, list) or len(commits) == 0:
        print(f"Error: {args.file} must contain a non-empty list of commit objects.")
        sys.exit(1)

    print("=" * 60)
    print(" GitHub Webhook Simulator")
    print(f" Target URL  : {args.url}")
    print(f" Repository  : {args.repo_owner}/{args.repo_name}")
    print(f" Commits File: {args.file} ({len(commits)} commits)")
    print("=" * 60)

    client = httpx.Client(timeout=10.0)

    # 1. Send initial ping handshake
    if not args.no_ping:
        print("\n[1/2] Sending GitHub 'ping' webhook handshake...")
        ping_payload = {
            "zen": "Approachable, modular, and asynchronous.",
            "hook_id": 999888,
            "repository": {
                "name": args.repo_name,
                "owner": {"login": args.repo_owner},
            },
        }
        try:
            resp = send_webhook(client, args.url, args.secret, "ping", ping_payload)
            print(f"  --> Status: {resp.status_code} {resp.text}")
            if resp.status_code != 200:
                print("  [!] Warning: Ping did not return 200 OK. Check URL and secret.")
        except (httpx.HTTPError, OSError) as exc:
            print(f"  [X] Error contacting webhook endpoint: {exc}")
            sys.exit(1)

    # 2. Replay commits sequentially
    print(f"\n[2/2] Replaying {len(commits)} commits as 'push' webhooks...")
    for idx, c in enumerate(commits, 1):
        sha = c.get("sha") or c.get("id")
        msg = c.get("message", "").split("\n")[0]
        files = c.get("added", []) + c.get("modified", []) + c.get("removed", [])

        push_payload = {
            "ref": f"refs/heads/{args.branch}",
            "pusher": {
                "name": c.get("author", {}).get("name", "Simulator"),
                "email": c.get("author", {}).get("email", "bot@example.com"),
            },
            "repository": {
                "name": args.repo_name,
                "owner": {"login": args.repo_owner},
            },
            "commits": [
                {
                    "id": sha,
                    "message": c.get("message", ""),
                    "timestamp": c.get("timestamp", "2026-11-10T12:00:00Z"),
                    "author": c.get("author", {}),
                    "added": c.get("added", []),
                    "modified": c.get("modified", []),
                    "removed": c.get("removed", []),
                }
            ],
            "head_commit": {
                "id": sha,
                "message": c.get("message", ""),
                "timestamp": c.get("timestamp", "2026-11-10T12:00:00Z"),
                "author": c.get("author", {}),
                "added": c.get("added", []),
                "modified": c.get("modified", []),
                "removed": c.get("removed", []),
            },
        }

        print(f"\n  [{idx}/{len(commits)}] Push commit {sha[:10]} - '{msg}'")
        print(f"      Files ({len(files)}): {', '.join(files[:3])}{'...' if len(files) > 3 else ''}")

        try:
            resp = send_webhook(client, args.url, args.secret, "push", push_payload)
            print(f"      Response: {resp.status_code} {resp.text}")
        except (httpx.HTTPError, OSError) as exc:
            print(f"      Failed: {exc}")

        if idx < len(commits) and args.delay > 0:
            time.sleep(args.delay)

    print("\n" + "=" * 60)
    print(" Simulation finished successfully!")
    print("=" * 60)


if __name__ == "__main__":
    main()
