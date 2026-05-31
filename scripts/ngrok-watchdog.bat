@echo off
set NGROK=C:\Users\USER\AppData\Roaming\npm\ngrok.cmd
set DOMAIN=granola-parchment-unsoiled.ngrok-free.dev

:loop
echo [%TIME%] Starting ngrok tunnel...
"%NGROK%" http --domain=%DOMAIN% 80
echo [%TIME%] ngrok exited (code %ERRORLEVEL%). Restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto loop
