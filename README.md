PoC: Blue/Green & Canary Deployment with Docker Compose

Overview
This PoC shows how to run Blue/Green and Canary deployments for a simple Node.js API connected to Postgres using Docker Compose and Nginx.

Stack
- Node.js Express API (two versions: blue and green)
- Postgres 16
- Nginx reverse proxy

Endpoints
- / → returns service name and version
- /api/version → app version and DB status
- /api/time → current server time
- /api/db-check → `SELECT NOW()` to verify DB connectivity

Quick Start
1) Build images (first run will build the app image):
   docker compose --profile blue build

2) Run Blue deployment:
   docker compose --profile blue up -d
   Open http://localhost:8080

3) Switch to Green deployment:
   docker compose --profile green up -d
   Open http://localhost:8080 (now served by green)

4) Run Canary (90/10 blue→green by default):
   docker compose --profile canary up -d
   Refresh http://localhost:8080 and observe version distribution

Environment
The services use these variables (Compose provides sensible defaults):
- PGUSER, PGPASSWORD, PGDATABASE, PGPORT

Stopping
  docker compose down -v

Notes
- To change canary weights, edit `nginx/conf.d/canary.conf` weights.
- Postgres data persists in the `pgdata` named volume.

