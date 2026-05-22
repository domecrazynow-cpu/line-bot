@echo off
cd C:\Users\User\Documents\GitHub\line-bot
pm2 resurrect
start "ngrok-tunnel" /min cmd /c "%~dp0scripts\ngrok-watchdog.bat"
