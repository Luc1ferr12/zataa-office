#!/usr/bin/env bash
# Backup harian database kantor (simpan 7 hari terakhir). Balikin: stop watcher, copy backups/office-<tgl>.db → db/office.db, start lagi.
set -eu
cd "$(dirname "$0")/../.."
mkdir -p backups
sqlite3 db/office.db ".backup backups/office-$(date +%F).db"
find backups -name 'office-*.db' -mtime +7 -delete
