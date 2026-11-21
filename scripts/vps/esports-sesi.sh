#!/usr/bin/env bash
# Sesi riset About Esports siang/sore/malam (cron WITA); sesi pagi ikut scripts/vps/daily.sh.
#   0 12 * * * /home/<user>/zataa-office/scripts/vps/esports-sesi.sh siang
#   0 16 * * * /home/<user>/zataa-office/scripts/vps/esports-sesi.sh sore
#   0 20 * * * /home/<user>/zataa-office/scripts/vps/esports-sesi.sh malam
#   (crontab perlu CRON_TZ=Asia/Makassar, sama dengan daily.sh)
set -u
SESI="${1:-}"
case "$SESI" in siang|sore|malam) ;; *) echo "pakai: esports-sesi.sh siang|sore|malam"; exit 1;; esac
cd "$(dirname "$0")/../.."
mkdir -p logs
export PATH="$HOME/.local/bin:$PATH" TZ=Asia/Makassar
LOG="logs/esports-$(date +%F)-$SESI.log"
git pull -q --rebase --autostash >>"$LOG" 2>&1

PROMPT="Kamu menjalankan SESI RISET $SESI About Esports (media esports, web top up mati: nol promo) di folder ini.
Baca office/daily.md bagian '1. About Esports — 4 sesi riset sehari' lalu ikuti PERSIS (sesi=\"$SESI\" dipakai di field sesi tiap ide). Hanya riset berita HANGAT → idea add (sesi=$SESI, sources) → idea pick 1–3 → node scripts/approval.mjs ideas, lalu STOP: jangan produksi sebelum Owner approve (watcher yang melanjutkan). JANGAN kerjakan Shorts di sesi ini. Patuhi CLAUDE.md (hemat token, aturan konten). Akhiri dengan ringkasan 2 kalimat."

echo "=== $(date) mulai sesi $SESI" >>"$LOG"
timeout 40m claude -p --permission-mode acceptEdits \
  --allowedTools 'Bash(node:*)' 'Bash(git:*)' Read Edit Write Glob Grep WebSearch WebFetch \
  <<<"$PROMPT" >>"$LOG" 2>&1
CODE=$?
echo "=== $(date) selesai (kode $CODE)" >>"$LOG"

if [ "$CODE" -ne 0 ]; then
  ALERT_MSG="⚠️ Bos, sesi riset About Esports ($SESI) GAGAL (kode $CODE), jadi belum ada berita hangat yang dikirim. Log: $LOG
$(tail -n 2 "$LOG" | head -n 1 | cut -c1-200)" \
  node --input-type=module -e "
const { sayAs } = await import('./scripts/approval.mjs');
await sayAs('dir', process.env.ALERT_MSG);
process.exit(0);
" >>"$LOG" 2>&1
fi
find logs -name 'esports-*.log' -mtime +7 -delete
