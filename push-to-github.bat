@echo off
setlocal EnableExtensions

REM Double-click runs in a window that closes on exit. Re-launch in a kept-open window.
if /i not "%~1"=="run" (
  start "Push to GitHub" cmd /k "%~f0" run
  exit /b 0
)

set "LOG=%~dp0push-to-github.log"
set "TS=%date% %time%"

cd /d "%~dp0"
title Babylon GLB Viewer - Push to GitHub

echo.>>"%LOG%"
echo ==================================================>>"%LOG%"
echo [%TS%] Push started>>"%LOG%"
echo.>>"%LOG%"

echo.
echo === Babylon GLB Viewer - Push to GitHub ===
echo Folder: %CD%
echo Log file: %LOG%
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo ERROR: Git is not installed or not on PATH.
  echo ERROR: Git not found>>"%LOG%"
  goto :done
)

if not exist ".git" (
  echo ERROR: This folder is not a git repository.
  echo ERROR: No .git folder>>"%LOG%"
  goto :done
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo ERROR: No "origin" remote configured.
  echo ERROR: No origin remote>>"%LOG%"
  goto :done
)

for /f "delims=" %%R in ('git branch --show-current 2^>nul') do set "BRANCH=%%R"
if "%BRANCH%"=="" set "BRANCH=main"

echo Remote:
git remote -v
echo Branch: %BRANCH%
echo.

echo --- Changed files ---
git status --short
echo --- end ---
echo.

set /p "MSG=Commit message (required): "
if "%MSG%"=="" (
  echo ERROR: Commit message cannot be empty.
  echo ERROR: Empty commit message>>"%LOG%"
  goto :done
)

echo.
echo [1/4] Syncing host manifest (GLB files stay local, not pushed to GitHub)...
where node >nul 2>&1
if errorlevel 1 (
  echo WARNING: Node.js not found — skipping npm run host:sync.
  echo WARNING: Node not found, host:sync skipped>>"%LOG%"
) else (
  call npm run host:sync
  if errorlevel 1 (
    echo ERROR: npm run host:sync failed.
    echo ERROR: host:sync failed>>"%LOG%"
    goto :done
  )
)

echo.
echo [2/4] Staging all changes...
git add -A
if errorlevel 1 (
  echo ERROR: git add failed.
  echo ERROR: git add failed>>"%LOG%"
  goto :done
)

git diff --cached --quiet
if not errorlevel 1 (
  echo Nothing to commit. Working tree is clean.
  echo Nothing to commit>>"%LOG%"
  goto :done
)

echo [3/4] Committing: %MSG%
git commit -m "%MSG%"
if errorlevel 1 (
  echo ERROR: git commit failed.
  echo ERROR: git commit failed>>"%LOG%"
  echo.
  echo If Git asks for your identity, run once in PowerShell:
  echo   git config --global user.email "you@example.com"
  echo   git config --global user.name "Your Name"
  goto :done
)

echo.
echo [4/4] Pushing to origin/%BRANCH% ...
git push -u origin %BRANCH%
if errorlevel 1 (
  echo.
  echo ERROR: git push failed.
  echo ERROR: git push failed>>"%LOG%"
  echo - Check you are signed in to GitHub
  echo - Confirm the repo exists and the remote URL is correct
  goto :done
)

echo.
echo SUCCESS. Push finished.
echo GitHub Actions will rebuild the site in a few minutes.
echo SUCCESS>>"%LOG%"
git log -1 --oneline
echo.

:done
echo [%date% %time%] Finished>>"%LOG%"
echo.
echo This window stays open so you can read the messages above.
echo You can also open: push-to-github.log
echo.
pause
endlocal
