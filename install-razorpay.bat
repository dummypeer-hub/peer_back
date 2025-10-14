@echo off
echo Installing Razorpay payment gateway dependencies...

echo.
echo Installing backend dependencies...
cd BACKEND
call npm install razorpay

echo.
echo Backend dependencies installed successfully!

echo.
echo Running database migration...
psql %DATABASE_URL% -f create_payments_tables.sql

echo.
echo Payment gateway setup complete!
echo.
echo Next steps:
echo 1. Update your Razorpay credentials in BACKEND/.env
echo 2. Set up webhook endpoint in Razorpay dashboard
echo 3. Test payments in development mode
echo.
pause