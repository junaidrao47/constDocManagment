#!/bin/bash

### ========================================================================
### REST Client Testing Script for Construction Document Management System
### ========================================================================
### This script runs all API tests using REST Client or curl commands
### Prerequisite: Install "REST Client" extension for VS Code or use curl
### ========================================================================

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Base URL
BASE_URL="http://localhost:3000/api"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Functions
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_test() {
    echo -e "${YELLOW}TEST: $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ PASSED: $1${NC}"
    ((PASSED_TESTS++))
}

print_error() {
    echo -e "${RED}✗ FAILED: $1${NC}"
    ((FAILED_TESTS++))
}

run_test() {
    local test_name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local token=$5
    
    ((TOTAL_TESTS++))
    print_test "$test_name"
    
    if [ -n "$token" ]; then
        if [ -n "$data" ]; then
            response=$(curl -s -X "$method" "$BASE_URL$endpoint" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $token" \
                -d "$data")
        else
            response=$(curl -s -X "$method" "$BASE_URL$endpoint" \
                -H "Authorization: Bearer $token")
        fi
    else
        if [ -n "$data" ]; then
            response=$(curl -s -X "$method" "$BASE_URL$endpoint" \
                -H "Content-Type: application/json" \
                -d "$data")
        else
            response=$(curl -s -X "$method" "$BASE_URL$endpoint")
        fi
    fi
    
    echo "$response" | jq . 2>/dev/null || echo "$response"
}

# ========================================================================
# REGISTER & AUTH TESTS
# ========================================================================
print_header "RUNNING REGISTER & AUTH TESTS"

# Test Register
register_response=$(curl -s -X POST "$BASE_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d '{
        "email": "testuser@example.com",
        "password": "TestPass123!",
        "name": "Test User",
        "phone": "+92300123456"
    }')

if echo "$register_response" | grep -q '"accessToken"'; then
    print_success "Register - New User Registration"
else
    print_error "Register - New User Registration"
fi

# Test Login
login_response=$(curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{
        "email": "admin@test.com",
        "password": "AdminPassword123!"
    }')

if echo "$login_response" | grep -q '"accessToken"'; then
    print_success "Login - Admin User"
    ADMIN_TOKEN=$(echo "$login_response" | jq -r '.accessToken')
else
    print_error "Login - Admin User"
fi

# ========================================================================
# CUSTOMERS TESTS
# ========================================================================
print_header "RUNNING CUSTOMERS TESTS"

run_test "Get All Customers" "GET" "/customers" "" "$ADMIN_TOKEN" | head -20

# ========================================================================
# QUOTATIONS TESTS
# ========================================================================
print_header "RUNNING QUOTATIONS TESTS"

run_test "Get All Quotations" "GET" "/quotations" "" "$ADMIN_TOKEN" | head -20

# ========================================================================
# DOCUMENTS TESTS
# ========================================================================
print_header "RUNNING DOCUMENTS TESTS"

run_test "Get All Documents" "GET" "/documents" "" "$ADMIN_TOKEN" | head -20

# ========================================================================
# PAYMENTS TESTS
# ========================================================================
print_header "RUNNING PAYMENTS TESTS"

run_test "Get All Payments" "GET" "/payments" "" "$ADMIN_TOKEN" | head -20

# ========================================================================
# PACKAGES TESTS
# ========================================================================
print_header "RUNNING PACKAGES TESTS"

run_test "Get All Packages" "GET" "/packages" "" "$ADMIN_TOKEN" | head -20

# ========================================================================
# USERS TESTS
# ========================================================================
print_header "RUNNING USERS TESTS"

run_test "Get All Users" "GET" "/users" "" "$ADMIN_TOKEN" | head -20

# ========================================================================
# TEST SUMMARY
# ========================================================================
print_header "TEST SUMMARY"
echo -e "Total Tests: ${BLUE}$TOTAL_TESTS${NC}"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
echo -e "Success Rate: ${BLUE}$(( PASSED_TESTS * 100 / TOTAL_TESTS ))%${NC}\n"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}All tests passed! ✓${NC}\n"
    exit 0
else
    echo -e "${RED}Some tests failed! ✗${NC}\n"
    exit 1
fi
