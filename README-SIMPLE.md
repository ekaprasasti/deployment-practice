# Simple Version-Based Deployment

## Command sederhana untuk deployment versi baru:

### 1. Deploy versi baru (zero-downtime)
```bash
# Set versi baru
export VERSION=v1.2.0

# Build dan start versi baru
docker-compose -f docker-compose.simple.yml up -d --build

# Cek health
curl http://localhost:8080/api/version
```

### 2. Rollback ke versi sebelumnya
```bash
# Set versi lama
export VERSION=v1.1.0

# Switch ke versi lama
docker-compose -f docker-compose.simple.yml up -d --build

# Cek
curl http://localhost:8080/api/version
```

### 3. Cleanup container lama
```bash
# Hapus container versi lama
docker container prune -f

# Hapus image lama (opsional)
docker image prune -f
```

## Commands ringkas:

```bash
# Deploy v1.2.0
VERSION=v1.2.0 docker-compose -f docker-compose.simple.yml up -d --build

# Rollback v1.1.0  
VERSION=v1.1.0 docker-compose -f docker-compose.simple.yml up -d --build

# Check status
curl http://localhost:8080/api/version
```

## Cara kerja:
- Container name: `app-${VERSION}`
- Image tag: `poc-api:${VERSION}`
- Docker Compose akan stop container lama dan start yang baru
- Nginx otomatis route ke container aktif
- Health check memastikan app siap sebelum menerima traffic

## Migrasi DB (jika perlu):
```bash
# Jalankan migration di container baru
docker exec app-v1.2.0 npm run migration:run
```
