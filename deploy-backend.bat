@echo off
echo Deploying PeerVerse Backend to Railway...
echo.

cd BACKEND

echo Checking Railway CLI...
railway --version
if %errorlevel% neq 0 (
    echo Railway CLI not found. Please install it first:
    echo npm install -g @railway/cli
    pause
    exit /b 1
)

echo.
echo Logging into Railway...
railway login

echo.
echo Linking to Railway project...
railway link

echo.
echo Deploying to Railway...
railway up

echo.
echo Deployment complete!
echo Your backend should now be available at: https://peerversefinal-production.up.railway.app
echo.
echo Testing CORS endpoint...
curl -H "Origin: https://www.peerverse.in" https://peerversefinal-production.up.railway.app/api/cors-test

pause