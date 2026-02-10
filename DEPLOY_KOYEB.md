# Deploy DramaBox ke Koyeb (Free Tier - 24/7)

## Langkah 1: Siapkan Database PostgreSQL

Gunakan database gratis dari:
- **Neon** (https://neon.tech) - Free tier 512MB
- **Supabase** (https://supabase.com) - Free tier 500MB
- **Railway** (https://railway.app) - $5 credit gratis

Catat `DATABASE_URL` yang didapat (format: `postgresql://user:pass@host:5432/dbname`)

## Langkah 2: Push ke GitHub

```bash
# Buat repo baru di GitHub, lalu:
git init
git add .
git commit -m "Initial deploy"
git remote add origin https://github.com/USERNAME/dramabox.git
git push -u origin main
```

## Langkah 3: Deploy di Koyeb

1. Buka https://app.koyeb.com dan daftar (gratis)
2. Klik **"Create Web Service"**
3. Pilih **GitHub** dan sambungkan repo
4. Konfigurasi:
   - **Builder**: Dockerfile
   - **Dockerfile location**: `Dockerfile`
   - **Instance type**: Free (Eco)
   - **Region**: Pilih terdekat (Singapore/Tokyo)

5. Tambahkan **Environment Variables**:
   ```
   DATABASE_URL          = postgresql://user:pass@host:5432/dbname
   TELEGRAM_BOT_TOKEN    = token_bot_kamu
   TELEGRAM_ADMIN_ID     = id_telegram_admin
   WEBAPP_URL            = https://nama-app-kamu.koyeb.app
   SAWERIA_STREAM_KEY    = key_saweria_kamu (opsional)
   PORT                  = 8000
   ```

6. Set **Health Check**:
   - Path: `/health`
   - Port: `8000`
   - Period: `30s`

7. Klik **Deploy**

## Langkah 4: Update WEBAPP_URL

Setelah deploy berhasil, Koyeb akan memberikan URL seperti:
`https://dramabox-xxxxx.koyeb.app`

Update environment variable `WEBAPP_URL` dengan URL tersebut.

## Langkah 5: Update Bot Telegram

Buka BotFather di Telegram:
1. `/setmenubutton` > pilih bot > kirim URL webapp Koyeb
2. Pastikan Mini App URL mengarah ke URL Koyeb

## Anti-Sleep (Sudah Otomatis)

App sudah dilengkapi sistem keep-alive yang:
- Ping endpoint `/health` setiap 4 menit
- Koyeb health check aktif setiap 30 detik
- Worker gunicorn dengan auto-restart via max-requests

## Troubleshooting

### App tidak bisa start
- Cek logs di Koyeb dashboard
- Pastikan DATABASE_URL benar
- Pastikan TELEGRAM_BOT_TOKEN valid

### Bot tidak merespons
- Pastikan hanya 1 instance bot yang berjalan
- Stop bot di Replit jika sudah deploy di Koyeb

### Database error
- Pastikan tabel sudah dibuat (otomatis saat pertama start)
- Cek koneksi database di logs

## File Penting untuk Deploy

```
Dockerfile          - Docker image config
requirements.txt    - Python dependencies
wsgi.py            - Gunicorn entry point (auto-start bot + keep-alive)
keep_alive.py      - Anti-sleep ping mechanism
start.sh           - Alternative startup script
app.py             - Main application
```
