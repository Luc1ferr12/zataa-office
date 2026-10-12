#!/usr/bin/env bash
# Pengingat Owner: kuota mingguan Claude reset Minggu 12:00 WITA → Aprista ngabarin 1 jam sebelumnya (cron Minggu 11:00 WITA).
#   crontab: CRON_TZ=Asia/Makassar
#            0 11 * * 0 /home/ubuntu/zataa-office/scripts/vps/remind-usage.sh  # zataa-office pengingat kuota
cd "$(dirname "$0")/../.." || exit 1
node --input-type=module -e "
const { sayAs } = await import('./scripts/approval.mjs');
await sayAs('sec', '⏰ Bos, 1 jam lagi (12:00 WITA) kuota mingguan Claude reset. Kalau ada kerjaan berat yang ditahan (misal bangun divisi Zata Studio), habis jam 12 udah aman dimulai 😉');
" >> logs/remind.log 2>&1
