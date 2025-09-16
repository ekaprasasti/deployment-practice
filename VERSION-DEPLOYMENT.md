# Version-Based Deployment Guide

## Overview
Pendekatan deployment berdasarkan versi yang lebih realistis untuk produksi, menggunakan environment variable untuk mengelola versi aplikasi.

## Konsep
- `api-current`: Versi saat ini yang aktif melayani traffic
- `api-next`: Versi baru yang akan di-deploy
- Versi dikelola melalui environment variable `CURRENT_VERSION` dan `NEXT_VERSION`

## Setup

1. Copy environment variables:
```bash
cp .env.example .env
```

2. Edit `.env` untuk set versi:
```bash
# Versions
CURRENT_VERSION=v1.0.0
NEXT_VERSION=v1.1.0
```

## Deployment Strategies

### 1. Standard Deployment (dengan downtime)
```bash
# Deploy versi current
CURRENT_VERSION=v1.0.0 docker compose --profile current up -d

# Upgrade ke versi baru
CURRENT_VERSION=v1.1.0 docker compose --profile current up -d --build
```

### 2. Blue-Green Deployment (zero downtime)
```bash
# 1. Jalankan current version
CURRENT_VERSION=v1.0.0 docker compose --profile current up -d

# 2. Deploy next version secara paralel
NEXT_VERSION=v1.1.0 docker compose --profile next up -d --build

# 3. Switch traffic ke next version
docker compose stop nginx-current
CURRENT_VERSION=v1.1.0 docker compose --profile next up -d nginx-next

# 4. Cleanup old version
docker compose stop api-current
```

### 3. Canary Deployment (gradual rollout)
```bash
# 1. Start canary dengan current + next
CURRENT_VERSION=v1.0.0 NEXT_VERSION=v1.1.0 docker compose --profile canary up -d

# 2. Monitor traffic distribution (default 90/10)
for i in {1..20}; do curl -s http://localhost:8080/api/version | jq -r .version; done | sort | uniq -c

# 3. Adjust weight di nginx/conf.d/canary.conf jika perlu
# server api-current:3000 weight=50
# server api-next:3000 weight=50
docker compose exec nginx-canary nginx -s reload

# 4. Promote to 100% next version
# server api-current:3000 weight=0
# server api-next:3000 weight=100
docker compose exec nginx-canary nginx -s reload
```

## Version Management Commands

### Check current versions:
```bash
curl -s http://localhost:8080/api/version
```

### View container versions:
```bash
docker compose ps
```

### Update environment versions:
```bash
# Update .env file
CURRENT_VERSION=v1.2.0
NEXT_VERSION=v1.3.0

# Reload with new versions
docker compose --profile canary up -d --build
```

## Profiles

- `current`: Jalankan hanya versi current
- `next`: Jalankan hanya versi next  
- `canary`: Jalankan kedua versi dengan traffic splitting

## Best Practices

1. **Versioning**: Gunakan semantic versioning (v1.0.0, v1.1.0, v2.0.0)
2. **Environment**: Selalu set CURRENT_VERSION dan NEXT_VERSION di .env
3. **Testing**: Test readiness sebelum switch traffic:
   ```bash
   docker compose exec api-next wget -qO- http://localhost:3000/ready
   ```
4. **Monitoring**: Pantau metrics setelah deployment
5. **Rollback**: Simpan versi stabil untuk rollback cepat

## Rollback Strategy
```bash
# Rollback to previous stable version
CURRENT_VERSION=v1.0.0 docker compose --profile current up -d
```
