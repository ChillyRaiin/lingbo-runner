@echo off
where pwsh.exe >nul 2>nul
if %errorlevel%==0 (
  pwsh.exe -NoProfile -File "%~dp0scripts\dev.ps1" -Action start
) else (
  powershell.exe -NoProfile -File "%~dp0scripts\dev.ps1" -Action start
)
exit /b %errorlevel%
