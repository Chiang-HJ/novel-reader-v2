@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==========================================
echo   NovelSync - PC Scrapling 雲端代抓伺服器
echo ==========================================
python scrapling_worker.py
pause
