Run one profile at a time:

Blue/Green:
  docker compose --profile blue up -d
  docker compose --profile green up -d

Canary (90/10 split by default):
  docker compose --profile canary up -d

Open http://localhost:8080


