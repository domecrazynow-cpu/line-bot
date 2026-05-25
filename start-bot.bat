@echo off
cd C:\Users\USER\line-bot
pm2 resurrect
start "ngrok-tunnel" /min cmd /c "%~dp0scripts\ngrok-watchdog.bat"
