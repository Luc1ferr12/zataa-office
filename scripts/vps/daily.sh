#!/usr/bin/env bash
# Sesi kerja harian kantor Zataa (cron 07:00 WITA) — pengganti scheduled task Claude Desktop di laptop.
set -u
cd "$(dirname "$0")/../.."
mkdir -p logs
export PATH="$HOME/.local/bin:$PATH" TZ=Asia/Makassar
LOG="logs/daily-$(date +%F).log"
git pull -q --rebase --autostash >>"$LOG" 2>&1

PROMPT='Kamu menjalankan sesi kerja pagi kantor marketing virtual Zataa di folder ini.

Baca lalu ikuti PERSIS file SOP office/daily.md (Senin: rapat plan mingguan → kirim plan ke Owner lalu stop produksi; Selasa–Minggu: riset masing-masing → briefing ide (2 ide terbaik dikirim ke Owner) → produksi konten terjadwal kalau plan sudah approved). Patuhi CLAUDE.md (hemat token & aturan konten). Kerjakan mandiri tanpa menunggu konfirmasi, dan akhiri dengan ringkasan singkat untuk Owner.'

echo "=== $(date) mulai" >>"$LOG"
timeout 2h claude -p --permission-mode acceptEdits \
  --allowedTools 'Bash(node:*)' 'Bash(git:*)' Read Edit Write Glob Grep WebSearch WebFetch \
  <<<"$PROMPT" >>"$LOG" 2>&1
echo "=== $(date) selesai (kode $?)" >>"$LOG"
find logs -name 'daily-*.log' -mtime +14 -delete
