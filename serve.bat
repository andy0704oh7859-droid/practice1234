@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "" "http://localhost:5500/"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
