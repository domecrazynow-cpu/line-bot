@echo off
cd C:\Users\USER\line-bot
start "ngrok-tunnel" /min cmd /c "%~dp0scripts\ngrok-watchdog.bat"
