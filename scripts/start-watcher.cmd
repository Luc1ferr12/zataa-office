@echo off
rem Jalankan watcher approval Telegram di background tanpa jendela (dipanggil otomatis saat login Windows)
cd /d "%~dp0.."
if not exist logs mkdir logs
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c node scripts\watch.mjs >> logs\watcher.log 2>&1' -WindowStyle Hidden"
