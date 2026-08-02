@echo off
chcp 65001 >nul
title 小說狂人極速下載器 v2.5
cd /d "%~dp0"

echo ========================================================
echo         小說狂人 (czbooks.net) 專屬極速下載器 v2.5
echo ========================================================
echo.

python czbooks_downloader.py %*

pause
