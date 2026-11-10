"""AI Interface stubs returning fixed mock values for planning and evaluation."""
from typing import Any


def generate_plan(readme: str, file_tree: list[str]) -> dict[str, Any]:
    """Stub function returning a fake project tree plan."""
    return {
        "nodes": [
            {
                "key": "n1",
                "title": "Project Setup & Base Architecture",
                "description": "Initialize repository structure, Docker environment, and base configuration.",
                "role": "backend",
                "done_criteria": "FastAPI skeleton running with DB models and health check.",
                "path_hints": ["backend/app", "docker-compose.yml"],
                "depends_on": [],
                "dependencies": [],
            },
            {
                "key": "n2",
                "title": "Authentication & GitHub Integration",
                "description": "Implement OAuth flow and encrypted GitHub token storage.",
                "role": "security",
                "done_criteria": "GitHub OAuth callback and member auth verified.",
                "path_hints": ["backend/app/auth.py"],
                "depends_on": ["n1"],
                "dependencies": ["n1"],
            },
            {
                "key": "n3",
                "title": "Interactive Tree UI",
                "description": "Frontend visualization of nodes and dependency edges.",
                "role": "frontend",
                "done_criteria": "Tree dashboard renders nodes with status-based colors.",
                "path_hints": ["frontend/src"],
                "depends_on": ["n1"],
                "dependencies": ["n1"],
            },
        ]
    }


def match_commit(commit: dict[str, Any], open_nodes: list[dict[str, Any]]) -> dict[str, Any]:
    """Stub function matching a commit to a candidate open node."""
    if not open_nodes:
        return {"node_key": None, "confidence": 0.0, "method": "llm"}
    return {
        "node_key": open_nodes[0].get("key"),
        "confidence": 0.85,
        "method": "llm",
    }


def judge_completion(
    node: dict[str, Any],
    diff_summary: str,
    signals: dict[str, Any],
) -> dict[str, Any]:
    """Stub function judging if a node's completion criteria have been satisfied."""
    return {
        "verdict": "done",
        "confidence": 0.9,
        "reason": "Stub assessment: Changes satisfy all done criteria.",
    }
