@echo off
echo Starting DWS Project Manager Backend...
cd backend
pip install -r requirements.txt
echo.
echo Seeding database with demo data...
python seed.py
echo.
echo Starting server on http://localhost:8000
python run.py
pause
