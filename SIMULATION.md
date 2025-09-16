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
  3) Naikkan ke 70/30: edit `nginx/conf.d/canary.conf` lalu reload
  ```bash
  # ubah:
  # server api-blue:3000 weight=7;
  # server api-green:3000 weight=3;
  docker compose exec nginx-canary nginx -s reload
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