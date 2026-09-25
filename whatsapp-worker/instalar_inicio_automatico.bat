@echo off
title Configurar Inicio Automatico - WhatsApp Martina Supermercado
color 0A

echo ===================================================================
echo   CONFIGURADOR DE INICIO AUTOMATICO - WHATSAPP ROBOT 🤖
echo ===================================================================
echo.
echo Creando acceso directo en la carpeta de Inicio de Windows...
echo.

set SCRIPT_DIR=%~dp0
set TARGET_VBS=%SCRIPT_DIR%silencioso.vbs
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT_PATH=%STARTUP_DIR%\Robot_WhatsApp_LaMartina.lnk

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%TARGET_VBS%\"'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Description = 'Robot de WhatsApp Martina Supermercado'; $s.Save()"

if %errorlevel% equ 0 (
    echo [OK] El robot se ha configurado para iniciar automaticamente con Windows.
    echo      Ubicacion: %SHORTCUT_PATH%
    echo.
    echo Ahora cada vez que prendas la computadora, el robot iniciara de fondo
    echo esperando la conexion a internet y enviando los mensajes pendientes.
) else (
    echo [ERROR] No se pudo crear el acceso directo automaticamente.
)

echo.
pause
