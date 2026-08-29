@echo off
REM ========================================================================
REM REST Client Testing Script for Construction Document Management System
REM ========================================================================
REM This script runs all API tests using curl commands
REM Prerequisites: curl installed and available in PATH
REM ========================================================================

setlocal enabledelayedexpansion

set BASE_URL=http://localhost:3000/api
set TOTAL_TESTS=0
set PASSED_TESTS=0
set FAILED_TESTS=0

REM Color codes (Windows 10+)
REM Note: Colors may not work on all Windows versions
for /F %%a in ('echo prompt $H ^| cmd') do set "BS=%%a"

echo.
echo ========================================
echo RUNNING API TESTS
echo ========================================
echo.

REM Test API Health
echo Testing API Health...
curl -s %BASE_URL%/health | findstr /R ".*" >nul
if !errorlevel! equ 0 (
    echo [PASS] API Health Check
    set /a PASSED_TESTS+=1
) else (
    echo [FAIL] API Health Check
    set /a FAILED_TESTS+=1
)
set /a TOTAL_TESTS+=1

REM Test Login
echo.
echo Testing Login...
for /f %%i in ('curl -s -X POST %BASE_URL%/auth/login -H "Content-Type: application/json" -d "{\"email\":\"admin@test.com\",\"password\":\"AdminPassword123!\"}" ^| findstr "accessToken"') do (
    set ADMIN_TOKEN=%%i
    echo [PASS] Login - Admin User
    set /a PASSED_TESTS+=1
    goto :continue_tests
)
echo [FAIL] Login - Admin User
set /a FAILED_TESTS+=1

:continue_tests
set /a TOTAL_TESTS+=1

REM Test Get Customers
echo.
echo Testing Get Customers...
if "%ADMIN_TOKEN%"=="" (
    echo [SKIP] Get Customers - No auth token
) else (
    curl -s %BASE_URL%/customers -H "Authorization: Bearer !ADMIN_TOKEN!" | findstr /R ".*" >nul
    if !errorlevel! equ 0 (
        echo [PASS] Get All Customers
        set /a PASSED_TESTS+=1
    ) else (
        echo [FAIL] Get All Customers
        set /a FAILED_TESTS+=1
    )
)
set /a TOTAL_TESTS+=1

REM Test Get Quotations
echo.
echo Testing Get Quotations...
if "%ADMIN_TOKEN%"=="" (
    echo [SKIP] Get Quotations - No auth token
) else (
    curl -s %BASE_URL%/quotations -H "Authorization: Bearer !ADMIN_TOKEN!" | findstr /R ".*" >nul
    if !errorlevel! equ 0 (
        echo [PASS] Get All Quotations
        set /a PASSED_TESTS+=1
    ) else (
        echo [FAIL] Get All Quotations
        set /a FAILED_TESTS+=1
    )
)
set /a TOTAL_TESTS+=1

REM Test Get Documents
echo.
echo Testing Get Documents...
if "%ADMIN_TOKEN%"=="" (
    echo [SKIP] Get Documents - No auth token
) else (
    curl -s %BASE_URL%/documents -H "Authorization: Bearer !ADMIN_TOKEN!" | findstr /R ".*" >nul
    if !errorlevel! equ 0 (
        echo [PASS] Get All Documents
        set /a PASSED_TESTS+=1
    ) else (
        echo [FAIL] Get All Documents
        set /a FAILED_TESTS+=1
    )
)
set /a TOTAL_TESTS+=1

REM Test Get Users
echo.
echo Testing Get Users...
if "%ADMIN_TOKEN%"=="" (
    echo [SKIP] Get Users - No auth token
) else (
    curl -s %BASE_URL%/users -H "Authorization: Bearer !ADMIN_TOKEN!" | findstr /R ".*" >nul
    if !errorlevel! equ 0 (
        echo [PASS] Get All Users
        set /a PASSED_TESTS+=1
    ) else (
        echo [FAIL] Get All Users
        set /a FAILED_TESTS+=1
    )
)
set /a TOTAL_TESTS+=1

REM Print Summary
echo.
echo ========================================
echo TEST SUMMARY
echo ========================================
echo Total Tests: %TOTAL_TESTS%
echo Passed: %PASSED_TESTS%
echo Failed: %FAILED_TESTS%
if %TOTAL_TESTS% equ 0 (
    echo Success Rate: N/A
) else (
    set /a SUCCESS_RATE=(%PASSED_TESTS% * 100) / %TOTAL_TESTS%
    echo Success Rate: !SUCCESS_RATE!%%
)
echo.

if %FAILED_TESTS% equ 0 (
    echo All tests passed!
    exit /b 0
) else (
    echo Some tests failed!
    exit /b 1
)
