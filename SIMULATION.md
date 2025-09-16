### Use case story 1 — Rilis fitur baru via Blue→Green (cutover penuh)
- **Aktor**: Release Engineer
- **Pra-kondisi**: `api-blue` aktif; build green siap; DB sehat
- **Trigger**: Approval rilis
- **Alur utama**:
  1) Nyalakan Blue (jika belum)
  ```bash
  cd /Users/ekaprasasti/Documents/Projects/PoC/deployment
  docker compose --profile blue up -d
  curl -s http://localhost:8080/api/version
  ```
  2) Smoke-test Green tanpa alihkan trafik
  ```bash
  docker compose up -d api-green
  docker compose exec api-green wget -qO- http://localhost:3000/api/version
  ```
  3) Cutover ke Green
  ```bash
  docker compose stop nginx-blue api-blue
  docker compose --profile green up -d nginx-green
  curl -s http://localhost:8080/api/version
  ```
- **Kriteria sukses**: 200 OK, `version=green`, error rate normal
- **Rollback**:
  ```bash
  docker compose stop nginx-green api-green
  docker compose --profile blue up -d nginx-blue api-blue
  ```

### Use case story 2 — Canary rollout bertahap 10% → 30% → 100%
- **Aktor**: Release Engineer, Observability
- **Pra-kondisi**: Blue aktif; Green siap; monitoring tersedia
- **Trigger**: Eksperimen rilis bertahap
- **Alur utama**:
  1) Mulai canary 90/10 (default `weight=9:1`)
  ```bash
  docker compose --profile canary up -d
  ```
  2) Sampling distribusi versi
  ```bash
  for i in {1..50}; do curl -s http://localhost:8080/api/version | jq -r .version; done | sort | uniq -c
  ```
  3) Naikkan ke 70/30: edit `nginx/conf.d/canary.conf` lalu reload (dengan hardening upstream/keepalive)
  ```bash
  # ubah:
  # server api-blue:3000 weight=7;
  # server api-green:3000 weight=3;
  docker compose exec nginx-canary nginx -s reload
  ```
### Use case story 7 — Blue→Green zero‑downtime via Nginx reload
- Gunakan satu proxy `nginx-canary` sebagai traffic switcher.
1) Start proxy tunggal dan kedua app
```bash
docker compose --profile canary up -d
```
2) Set 100/0 (Blue penuh) pada `nginx/conf.d/canary.conf` lalu reload
```nginx
upstream api_main {
    zone api_main 64k;
    server api-blue:3000 weight=10 max_fails=3 fail_timeout=10s;
    server api-green:3000 weight=0  max_fails=3 fail_timeout=10s;
    keepalive 64;
}
```
```bash
docker compose exec nginx-canary nginx -s reload
curl -s http://localhost:8080/api/version
```
3) Promosikan ke 0/100 (Green penuh) hanya dengan edit weight + reload
```nginx
upstream api_main {
    zone api_main 64k;
    server api-blue:3000 weight=0  max_fails=3 fail_timeout=10s;
    server api-green:3000 weight=10 max_fails=3 fail_timeout=10s;
    keepalive 64;
}
```
```bash
docker compose exec nginx-canary nginx -s reload
curl -s http://localhost:8080/api/version
```
  4) Promosi 100% Green
  ```bash
  docker compose stop nginx-canary api-blue
  docker compose --profile green up -d nginx-green
  ```
- **Kriteria sukses**: Distribusi sesuai bobot; metrik (error, p95) dalam ambang

### Use case story 3 — Rollback cepat saat KPI dilanggar (Canary)
- **Aktor**: On-call/Release Engineer
- **Pra-kondisi**: Canary aktif; KPI threshold didefinisikan
- **Trigger**: Error rate > threshold atau latensi memburuk
- **Alur utama**:
  - Turunkan bobot Green atau nolkan
  ```bash
  # set weight green kecil/0 di canary.conf → reload
  docker compose exec nginx-canary nginx -s reload
  ```
  - Atau kembali ke Blue penuh
  ```bash
  docker compose stop nginx-canary api-green
  docker compose --profile blue up -d nginx-blue
  ```
- **Exit**: Trafik kembali stabil; insiden tertangani

### Use case story 4 — Migrasi database expand–contract saat rilis
- **Aktor**: DBA/Engineer
- **Pra-kondisi**: Backup ada; migrasi idempoten
- **Trigger**: Perubahan skema diperlukan untuk fitur baru
- **Alur utama**:
  1) Expand (kompatibel mundur)
  ```bash
  docker compose exec postgres psql -U postgres -d appdb -c "ALTER TABLE IF EXISTS public.some_table ADD COLUMN IF NOT EXISTS new_col text;"
  ```
  2) Jalankan Canary/Green; pastikan dua versi tetap jalan dengan skema baru
  ```bash
  curl -s http://localhost:8080/api/db-check
  ```
  3) Contract (hapus kolom lama) setelah 100% Green stabil
- **Kriteria sukses**: Tidak ada error query; layanan stabil di kedua versi

### Use case story 5 — Kegagalan Green saat cutover (respon cepat)
- **Aktor**: On-call
- **Pra-kondisi**: Proses cutover berjalan
- **Trigger**: Health check Green gagal
- **Alur utama**:
  1) Deteksi via endpoint/monitoring
  ```bash
  curl -s http://localhost:8080/api/version
  docker compose logs -f nginx-green api-green | sed -n '1,50p'
  ```
  2) Rollback instan ke Blue
  ```bash
  docker compose stop nginx-green api-green
  docker compose --profile blue up -d nginx-blue api-blue
  ```
  3) Investigasi offline: lihat log, DB, config
- **Kriteria sukses**: Layanan pulih, MTTR rendah

### Use case story 6 — Simulasi outage partial di canary
- **Aktor**: SRE/Engineer
- **Pra-kondisi**: Canary aktif
- **Trigger**: Uji ketahanan routing berbobot
- **Alur utama**:
  ```bash
  docker compose stop api-green
  for i in {1..20}; do curl -s http://localhost:8080/api/version | jq -r .version; done | sort | uniq -c
  # ekspektasi: mayoritas Blue; error minimal
  docker compose up -d api-green
  ```

Tip umum:
- Ukur setelah setiap langkah (latensi p95/p99, error rate, throughput).
- Gunakan `/api/version` dan `/api/db-check` untuk smoke test cepat.
- Selalu siapkan satu perintah rollback yang “muscle memory”.
 
### Use case story 8 — Real case zero‑downtime deployment under load
- **Aktor**: Release Engineer, SRE/On-call
- **Tujuan**: Promosikan versi Green ke 100% tanpa downtime, di bawah beban riil, dengan rollback cepat bila perlu.
- **Pra‑kondisi**: Branch `zero-downtime` dipakai; health/readiness aktif; `nginx-canary` sebagai satu‑satunya proxy.

1) Start stack (proxy tunggal + dua versi app) dan build jika perlu
```bash
cd /Users/ekaprasasti/Documents/Projects/PoC/deployment
docker compose --profile canary up -d --build
```

2) Verifikasi readiness kedua app sebelum menerima trafik
```bash
docker compose exec api-blue  wget -qO- http://localhost:3000/ready && echo
docker compose exec api-green wget -qO- http://localhost:3000/ready && echo
```

3) Jalankan traffic generator sederhana (terminal terpisah)
```bash
# Kirim 5 req/detik, laporkan distribusi setiap ~5s
while true; do for i in {1..25}; do curl -s http://localhost:8080/api/version | sed -n 's/.*"version":"\([^"]*\)".*/\1/p'; sleep 0.2; done; echo "----"; done |
awk '/----/{print c; c=""; next} {c[$1]++}'
```

4) Baseline 100/0 (Blue penuh) – zero downtime via reload
```nginx
upstream api_main {
    zone api_main 64k;
    server api-blue:3000  weight=100 max_fails=3 fail_timeout=10s;
    server api-green:3000 weight=0   max_fails=3 fail_timeout=10s;
    keepalive 64;
}
```
```bash
docker compose exec nginx-canary nginx -s reload
```
Observasi: semua respon "blue"; error rate ~0; latency stabil.

5) Ramp canary bertahap (observasi tiap tahap 2‑5 menit)
```nginx
# 95/5
upstream api_main { zone api_main 64k; server api-blue:3000 weight=95 max_fails=3 fail_timeout=10s; server api-green:3000 weight=5  max_fails=3 fail_timeout=10s; keepalive 64; }
# 90/10
upstream api_main { zone api_main 64k; server api-blue:3000 weight=90 max_fails=3 fail_timeout=10s; server api-green:3000 weight=10 max_fails=3 fail_timeout=10s; keepalive 64; }
# 70/30, 50/50, 0/100 …
```
```bash
docker compose exec nginx-canary nginx -s reload
```
Pada tiap tahap:
- Cek distribusi di terminal traffic generator.
- Pantau health: `curl -fsS http://localhost:8080/api/version` berulang, dan `docker compose logs -f nginx-canary api-blue api-green`.
- Validasikan KPI (error rate, p95). Jika melanggar, lakukan rollback ke bobot aman sebelumnya.

6) Simulasi kegagalan parsial Green (lihat failover pasif Nginx)
```bash
docker compose stop api-green
sleep 5
# Distribusi kembali dominan Blue; error minimal karena proxy_next_upstream
docker compose up -d api-green
```

7) Promosi penuh 0/100 (Green) – masih tanpa downtime
```nginx
upstream api_main {
    zone api_main 64k;
    server api-blue:3000  weight=0   max_fails=3 fail_timeout=10s;
    server api-green:3000 weight=100 max_fails=3 fail_timeout=10s;
    keepalive 64;
}
```
```bash
docker compose exec nginx-canary nginx -s reload
```
Opsional: setelah stabil, hentikan Blue untuk penghematan
```bash
docker compose stop api-blue
```

8) Rollback cepat (jika KPI memburuk)
```nginx
# Kembali ke 100/0 Blue
upstream api_main { zone api_main 64k; server api-blue:3000 weight=100 max_fails=3 fail_timeout=10s; server api-green:3000 weight=0 max_fails=3 fail_timeout=10s; keepalive 64; }
```
```bash
docker compose exec nginx-canary nginx -s reload
```

9) Catatan DB (expand–contract) – lakukan sebelum/selama canary rendah
```bash
docker compose exec postgres psql -U postgres -d appdb -c "CREATE TABLE IF NOT EXISTS demo_release(id serial primary key, note text);"
# Pastikan kedua versi tetap lulus /ready dan tidak ada error query.
```

- **Exit criteria**: Distribusi 0/100 Green stabil ≥30 menit, error rate dalam ambang, KPI bisnis OK.