# AI Project Coordinator - Backend

FastAPI backend and asynchronous background worker for AI Project Coordinator.

For full setup, running instructions, architecture overview, and API reference, see the root [README.md](../README.md).

### Quick Commands

- **Run API server**: `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`
- **Run background worker**: `python -m app.worker`
- **Run migrations**: `alembic upgrade head`
- **Run tests**: `pytest -v`
- **Run linter**: `ruff check .`
