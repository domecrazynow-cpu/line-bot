@echo off
set NGROK=C:\Users\USER\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe
set DOMAIN=granola-parchment-unsoiled.ngrok-free.dev

:loop
echo [%TIME%] Starting ngrok tunnel...
"%NGROK%" http --domain=%DOMAIN% 3000
echo [%TIME%] ngrok exited (code %ERRORLEVEL%). Restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto loop
