# AI Project Coordinator

Autonomous project coordinator backend that connects to GitHub repositories, generates interactive dependency DAGs of specialized role tasks (`frontend`, `backend`, `ai_ml`, `security`, `devops`), ingests signed GitHub webhooks (HMAC-SHA256), matches commits, evaluates completion signals, unlocks dependent tasks in single atomic transactions, and notifies role owners.

---

## Architecture Overview

- **Framework**: FastAPI (Python 3.12)
- **Database**: PostgreSQL 16 with SQLAlchemy 2.0 (asyncpg) & Alembic migrations
- **Concurrency**: `SELECT ... FOR UPDATE SKIP LOCKED` distributed background queue
- **Security**: HMAC-SHA256 webhook signatures, Fernet token encryption at rest, JWT Bearer authentication, in-memory rate limiting, and strictly scoped read-only share viewer links

---

## Getting Started

### 1. Prerequisites
- Python 3.12+
- Docker and Docker Compose (optional for containerized run)
- PostgreSQL 16 (if running locally without Docker)

### 2. Configuration
Copy the template configuration:
```bash
cp backend/.env.example backend/.env
```
Key configuration parameters:
- `DATABASE_URL`: PostgreSQL connection string with asyncpg driver.
- `SECRET_KEY`: Minimum 32-byte secret used for signing JWT access tokens.
- `FERNET_KEY`: 32-byte URL-safe base64-encoded key used to encrypt GitHub personal access tokens at rest.
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`: GitHub OAuth application credentials.
- `WEBHOOK_BASE_URL`: Public or tunneling URL for GitHub webhook callbacks.
- `DISCORD_WEBHOOK_URL` / `SLACK_WEBHOOK_URL`: Optional outbound chat notification webhooks.

---

## Running the Application

### Option A: Docker Compose (Recommended)
Starts PostgreSQL, runs all Alembic migrations automatically, and starts both the FastAPI server and background worker:
```bash
cd backend
docker compose up --build
```
- API runs at `http://localhost:8000`
- Swagger OpenAPI documentation at `http://localhost:8000/docs`
- Background worker processes asynchronous jobs from the `jobs` table using `SKIP LOCKED`.

### Option B: Local Python Environment
1. Create and activate a Python 3.12 virtual environment:
   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. Apply database migrations:
   ```bash
   alembic upgrade head
   ```
3. Start the API server:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
4. In a separate terminal, start the background worker:
   ```bash
   python -m app.worker
   ```

---

## Running Tests and Linting

Run the complete test suite (includes authentication, webhook HMAC verification, deduplication, atomic cascade unlock, viewer link isolation, and plan validation):
```bash
cd backend
pytest -v
```

Run code formatting and lint checks:
```bash
ruff check backend scripts simulator
```

---

## Webhook Simulation and Demo

To simulate GitHub webhook traffic from real commit history:
```bash
python scripts/replay_webhooks.py --secret <YOUR_PROJECT_WEBHOOK_SECRET> --file simulator/sample_commits.json
```
Options:
- `--url`: Webhook endpoint (default: `http://localhost:8000/webhooks/github`)
- `--delay`: Delay in seconds between simulated commits (default: 0.5s)
- `--event`: Webhook event type (`push`, `ping`, or `all`)

---

## API Reference

### Authentication & Health
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check endpoint returning database connectivity status |
| `GET` | `/auth/github/login` | Redirects to GitHub OAuth authorization URL |
| `GET` | `/auth/github/callback` | Exchanges OAuth code for JWT token and persists encrypted GitHub token |

### Projects & Members
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/projects` | Connect a GitHub repository, register webhook, queue plan job |
| `GET` | `/projects` | List all projects where current user is owner or member |
| `GET` | `/projects/{id}` | Inspect repository metadata and connection status |
| `GET` | `/projects/{id}/members` | List members and their assigned roles (`frontend`, `backend`, `ai_ml`, `security`, `devops`) |
| `POST` | `/projects/{id}/members` | Join or add member with a designated role |
| `PATCH` | `/projects/{id}/members/{user_id}` | Update member role (self or project owner) |
| `DELETE` | `/projects/{id}/members/{user_id}` | Remove member from project (project owner only) |

### Plan Review
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/projects/{id}/plan` | View current draft or approved plan tree |
| `PUT` | `/projects/{id}/plan` | Edit draft DAG (validates no cycles, valid roles, node count 3–40) |
| `POST` | `/projects/{id}/plan/approve` | Approve draft plan: activates tree, creates nodes/edges |
| `POST` | `/projects/{id}/plan/retry` | Retry plan generation if planning previously failed |

### Dependency Tree & Nodes
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/projects/{id}/tree` | Full dependency tree, progress (`done`/`total`), and `last_event_id` |
| `GET` | `/nodes/{id}` | Node detail, owner, matched commits, and latest AI judge decision |
| `POST` | `/nodes/{id}/confirm` | Manually confirm node completion; triggers atomic cascade unlock |
| `PATCH` | `/nodes/{id}/owner` | Manually assign or change node owner |

### Webhooks
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/webhooks/github` | Ingests HMAC-SHA256 signed GitHub push, PR, and workflow events |

### Share Links & Read-Only Viewer
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/projects/{id}/share` | Generate 32-byte secure viewer link token |
| `DELETE` | `/projects/{id}/share/{token}` | Revoke viewer link |
| `GET` | `/view/{token}` | Read-only tree representation (no secrets, emails, or tokens) |

### Notifications
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/notifications` | List in-app notifications for authenticated user |
| `POST` | `/notifications/{id}/read` | Mark notification as read |
