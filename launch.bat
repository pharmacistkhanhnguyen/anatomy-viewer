@echo off
echo Anatomy 3D Viewer
echo Starting server via WSL...
start "" "http://localhost:8765"
wsl python3 -m http.server 8765 -d /mnt/d/Openclaw/anatomy-viewer
pause
