#!/usr/bin/env bash
# Sesi kerja harian kantor Zataa (cron 07:00 WITA) — pengganti scheduled task Claude Desktop di laptop.
set -u
cd "$(dirname "$0")/../.."
mkdir -p logs
export PATH="$HOME/.local/bin:$PATH" TZ=Asia/Makassar
LOG="logs/daily-$(date +%F).log"
git pull -q --rebase --autostash >>"$LOG" 2>&1

PROMPT='Kamu menjalankan sesi kerja pagi kantor marketing virtual Zataa di folder ini.

Baca lalu ikuti PERSIS file SOP office/daily.md (Senin: rapat plan mingguan → kirim plan ke Owner lalu stop produksi marketing, tapi 1 YouTube Shorts tetap dibuat; Selasa–Minggu: riset masing-masing → briefing ide (2 ide terbaik dikirim ke Owner) → produksi konten terjadwal kalau plan sudah approved). Patuhi CLAUDE.md (hemat token & aturan konten). Kerjakan mandiri tanpa menunggu konfirmasi, dan akhiri dengan ringkasan singkat untuk Owner.'

echo "=== $(date) mulai" >>"$LOG"
timeout 2h claude -p --permission-mode acceptEdits \
  --allowedTools 'Bash(node:*)' 'Bash(git:*)' Read Edit Write Glob Grep WebSearch WebFetch \
  <<<"$PROMPT" >>"$LOG" 2>&1
CODE=$?
echo "=== $(date) selesai (kode $CODE)" >>"$LOG"

# Sesi gagal = plan/konten hari itu nggak dibuat, sementara laporan otomatis tetap jalan → Owner harus tahu.
if [ "$CODE" -ne 0 ]; then
  ALERT_MSG="⚠️ Bos, sesi kerja pagi GAGAL (kode $CODE), jadi plan/konten hari ini belum dibuat. Kalau log-nya bilang OAuth expired: login ulang Claude di VPS, lalu jalankan scripts/vps/daily.sh. Log: $LOG
$(tail -n 2 "$LOG" | head -n 1 | cut -c1-200)" \
  node --input-type=module -e "
const { sayAs } = await import('./scripts/approval.mjs');
await sayAs('sec', process.env.ALERT_MSG);
process.exit(0);
" >>"$LOG" 2>&1
fi

find logs -name 'daily-*.log' -mtime +14 -delete
