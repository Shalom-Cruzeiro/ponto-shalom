@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Sistema de Ponto - Rodando

:: Obter IP local
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set IP=%%a
    goto :got_ip
)
:got_ip
set IP=%IP:~1%

echo.
echo ╔══════════════════════════════════════════╗
echo ║        SISTEMA DE PONTO                 ║
echo ╚══════════════════════════════════════════╝
echo.
echo  Iniciando servidor...
echo.

:: Aguardar 2 segundos e abrir navegador
start "" timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"

:: Iniciar servidor
node server.js

:: Se o servidor fechar com erro
echo.
echo ❌ O servidor foi encerrado.
echo.
pause
