@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Instalação - Sistema de Ponto

echo.
echo ╔══════════════════════════════════════════╗
echo ║     INSTALAÇÃO - SISTEMA DE PONTO        ║
echo ╚══════════════════════════════════════════╝
echo.

:: Verificar Node.js
echo [1/4] Verificando Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ❌ Node.js não encontrado!
    echo.
    echo Por favor, instale o Node.js antes de continuar:
    echo    1. Acesse: https://nodejs.org
    echo    2. Baixe a versão "LTS" (recomendada)
    echo    3. Instale e execute este arquivo novamente
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo    ✅ Node.js %NODE_VER% encontrado

:: Criar pastas necessárias
echo.
echo [2/4] Criando estrutura de pastas...
if not exist "data" mkdir data
if not exist "fotos" mkdir fotos
echo    ✅ Pastas criadas

:: Instalar dependências
echo.
echo [3/4] Instalando dependências (pode demorar alguns minutos)...
call npm install --silent
if %errorlevel% neq 0 (
    echo.
    echo ❌ Erro ao instalar dependências.
    echo    Verifique sua conexão com a internet e tente novamente.
    echo.
    pause
    exit /b 1
)
echo    ✅ Dependências instaladas

:: Criar atalho na área de trabalho
echo.
echo [4/4] Criando atalho na área de trabalho...
set SCRIPT_DIR=%~dp0
set SHORTCUT=%USERPROFILE%\Desktop\Sistema de Ponto.lnk
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%SCRIPT_DIR%iniciar.bat'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.IconLocation = 'shell32.dll,43'; $s.Description = 'Sistema de Ponto'; $s.Save()" >nul 2>&1
if exist "%SHORTCUT%" (
    echo    ✅ Atalho criado na área de trabalho
) else (
    echo    ⚠️ Atalho não criado (sem permissão) - use iniciar.bat diretamente
)

echo.
echo ╔══════════════════════════════════════════╗
echo ║  ✅ INSTALAÇÃO CONCLUÍDA!                ║
echo ╚══════════════════════════════════════════╝
echo.
echo Para iniciar o sistema, clique em "Sistema de Ponto"
echo na área de trabalho, ou execute "iniciar.bat".
echo.
set /p INICIAR=Deseja iniciar o sistema agora? (S/N): 
if /i "%INICIAR%"=="S" (
    call iniciar.bat
) else (
    pause
)
