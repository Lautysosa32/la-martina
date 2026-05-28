@echo off
title Robot WhatsApp - La Martina
color 0A

echo ===================================================
echo   🤖 ROBOT DE WHATSAPP - LA MARTINA PREMIUM 🏪
echo ===================================================
echo.

:: Verificar si existe la carpeta de dependencias
if not exist node_modules (
    echo [⚙️] Es la primera vez que se ejecuta el robot en esta PC.
    echo [⚙️] Instalando componentes necesarios de fondo (esto puede tardar 1-2 minutos)...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [🚨] ERROR: Hubo un problema al instalar las dependencias. 
        echo [🚨] Asegurese de tener Node.js instalado en esta PC (descargable de nodejs.org).
        echo.
        pause
        exit
    )
    echo.
    echo [✅] Componentes instalados con éxito.
    echo ===================================================
    echo.
)

echo [🚀] Iniciando conexion con WhatsApp...
echo [⏳] Cargando navegador Chromium de fondo (esto puede tardar 20-30 segundos)...
echo.

call node worker.js

echo.
echo [⚠️] El robot se ha detenido.
echo.
pause
