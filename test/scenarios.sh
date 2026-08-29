#!/bin/bash

### ========================================================================
### Test Scenarios Runner
### Runs complete test workflows for the Construction Document Management API
### ========================================================================

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BASE_URL="http://localhost:3000/api"

# Function to print headers
print_header() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}\n"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to print error
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Function to print info
print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Extract JSON value
extract_json() {
    echo "$1" | grep -o "\"$2\":\"[^\"]*" | cut -d'"' -f4
}

# ========================================================================
# SCENARIO 1: Complete Authentication Flow
# ========================================================================
scenario_auth_flow() {
    print_header "SCENARIO 1: Complete Authentication Flow"
    
    print_info "Step 1: Register new user"
    register_response=$(curl -s -X POST "$BASE_URL/auth/register" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "testuser'$(date +%s)'@test.com",
            "password": "TestPass123!",
            "name": "Test User",
            "phone": "+92300123456"
        }')
    
    if echo "$register_response" | grep -q '"id"'; then
        print_success "User registered"
        NEW_USER_ID=$(echo "$register_response" | jq -r '.id')
    else
        print_error "User registration failed"
        return 1
    fi
    
    print_info "Step 2: Login with new user"
    login_response=$(curl -s -X POST "$BASE_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "testuser'$(date +%s)'@test.com",
            "password": "TestPass123!"
        }')
    
    if echo "$login_response" | grep -q '"accessToken"'; then
        print_success "Login successful"
        USER_TOKEN=$(echo "$login_response" | jq -r '.accessToken')
    else
        print_error "Login failed"
        return 1
    fi
    
    print_info "Step 3: Get user profile"
    profile_response=$(curl -s -X GET "$BASE_URL/users/me" \
        -H "Authorization: Bearer $USER_TOKEN")
    
    if echo "$profile_response" | grep -q '"id"'; then
        print_success "Profile retrieved"
    else
        print_error "Profile retrieval failed"
        return 1
    fi
    
    print_success "SCENARIO 1 COMPLETED\n"
}

# ========================================================================
# SCENARIO 2: Customer Management Flow
# ========================================================================
scenario_customer_flow() {
    print_header "SCENARIO 2: Customer Management Flow"
    
    # Get admin token
    print_info "Getting admin token..."
    admin_response=$(curl -s -X POST "$BASE_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "admin@test.com",
            "password": "AdminPassword123!"
        }')
    
    ADMIN_TOKEN=$(echo "$admin_response" | jq -r '.accessToken')
    if [ "$ADMIN_TOKEN" = "null" ]; then
        print_error "Admin login failed"
        return 1
    fi
    print_success "Admin authenticated"
    
    print_info "Step 1: Create customer"
    customer_response=$(curl -s -X POST "$BASE_URL/customers" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -d '{
            "name": "Test Customer '$(date +%s)'",
            "email": "customer'$(date +%s)'@test.com",
            "phone": "+92300123456",
            "city": "Karachi",
            "industry": "construction"
        }')
    
    CUSTOMER_ID=$(echo "$customer_response" | jq -r '.id')
    if [ "$CUSTOMER_ID" != "null" ]; then
        print_success "Customer created: $CUSTOMER_ID"
    else
        print_error "Customer creation failed"
        return 1
    fi
    
    print_info "Step 2: Retrieve customer"
    get_customer=$(curl -s -X GET "$BASE_URL/customers/$CUSTOMER_ID" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if echo "$get_customer" | grep -q "$CUSTOMER_ID"; then
        print_success "Customer retrieved"
    else
        print_error "Customer retrieval failed"
        return 1
    fi
    
    print_info "Step 3: Update customer"
    update_response=$(curl -s -X PUT "$BASE_URL/customers/$CUSTOMER_ID" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -d '{
            "name": "Updated Customer Name",
            "phone": "+92300654321"
        }')
    
    if echo "$update_response" | grep -q '"id"'; then
        print_success "Customer updated"
    else
        print_error "Customer update failed"
        return 1
    fi
    
    print_success "SCENARIO 2 COMPLETED\n"
}

# ========================================================================
# SCENARIO 3: Quotation to Invoice to Payment Flow
# ========================================================================
scenario_quotation_payment_flow() {
    print_header "SCENARIO 3: Quotation → Invoice → Payment Flow"
    
    # Get admin token
    admin_response=$(curl -s -X POST "$BASE_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "admin@test.com",
            "password": "AdminPassword123!"
        }')
    
    ADMIN_TOKEN=$(echo "$admin_response" | jq -r '.accessToken')
    print_success "Admin authenticated"
    
    # Create customer first
    print_info "Step 1: Create customer"
    customer_response=$(curl -s -X POST "$BASE_URL/customers" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -d '{
            "name": "Quotation Test Customer '$(date +%s)'",
            "email": "quotation'$(date +%s)'@test.com",
            "phone": "+92300123456",
            "city": "Karachi",
            "industry": "construction"
        }')
    
    CUSTOMER_ID=$(echo "$customer_response" | jq -r '.id')
    print_success "Customer created: $CUSTOMER_ID"
    
    print_info "Step 2: Create quotation"
    quotation_response=$(curl -s -X POST "$BASE_URL/quotations" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -d '{
            "customerId": "'$CUSTOMER_ID'",
            "title": "Test Quotation",
            "description": "Test quotation for workflow",
            "validUntil": "2025-12-31",
            "items": [
              {
                "description": "Labor",
                "quantity": 10,
                "unit": "days",
                "unitPrice": 5000,
                "taxRate": 17
              }
            ],
            "discount": 0,
            "notes": "Test quotation"
        }')
    
    QUOTATION_ID=$(echo "$quotation_response" | jq -r '.id')
    if [ "$QUOTATION_ID" != "null" ]; then
        print_success "Quotation created: $QUOTATION_ID"
    else
        print_error "Quotation creation failed"
        return 1
    fi
    
    print_info "Step 3: Send quotation"
    send_response=$(curl -s -X POST "$BASE_URL/quotations/$QUOTATION_ID/send" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"recipientEmail": "test@test.com"}')
    
    if echo "$send_response" | grep -q '"status"'; then
        print_success "Quotation sent"
    else
        print_error "Quotation send failed"
    fi
    
    print_info "Step 4: Accept quotation"
    accept_response=$(curl -s -X POST "$BASE_URL/quotations/$QUOTATION_ID/accept" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if echo "$accept_response" | grep -q '"status"'; then
        print_success "Quotation accepted"
    else
        print_error "Quotation accept failed"
    fi
    
    print_success "SCENARIO 3 COMPLETED\n"
}

# ========================================================================
# SCENARIO 4: Document Upload & Sharing Flow
# ========================================================================
scenario_document_flow() {
    print_header "SCENARIO 4: Document Upload & Sharing Flow"
    
    # Get admin token
    admin_response=$(curl -s -X POST "$BASE_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "admin@test.com",
            "password": "AdminPassword123!"
        }')
    
    ADMIN_TOKEN=$(echo "$admin_response" | jq -r '.accessToken')
    print_success "Admin authenticated"
    
    print_info "Step 1: Create document"
    doc_response=$(curl -s -X POST "$BASE_URL/documents" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -d '{
            "title": "Test Document '$(date +%s)'",
            "description": "Test document for sharing",
            "type": "specification",
            "tags": ["test", "document"]
        }')
    
    DOCUMENT_ID=$(echo "$doc_response" | jq -r '.id')
    if [ "$DOCUMENT_ID" != "null" ]; then
        print_success "Document created: $DOCUMENT_ID"
    else
        print_error "Document creation failed"
        return 1
    fi
    
    print_info "Step 2: Retrieve document"
    get_doc=$(curl -s -X GET "$BASE_URL/documents/$DOCUMENT_ID" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if echo "$get_doc" | grep -q "$DOCUMENT_ID"; then
        print_success "Document retrieved"
    else
        print_error "Document retrieval failed"
        return 1
    fi
    
    print_info "Step 3: Add comment"
    comment_response=$(curl -s -X POST "$BASE_URL/documents/$DOCUMENT_ID/comments" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -d '{"comment": "Test comment", "type": "review"}')
    
    if echo "$comment_response" | grep -q '"id"'; then
        print_success "Comment added"
    else
        print_error "Comment failed"
    fi
    
    print_success "SCENARIO 4 COMPLETED\n"
}

# ========================================================================
# SCENARIO 5: User Role & Permission Flow
# ========================================================================
scenario_user_permission_flow() {
    print_header "SCENARIO 5: User Role & Permission Flow"
    
    # Get admin token
    admin_response=$(curl -s -X POST "$BASE_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "admin@test.com",
            "password": "AdminPassword123!"
        }')
    
    ADMIN_TOKEN=$(echo "$admin_response" | jq -r '.accessToken')
    print_success "Admin authenticated"
    
    print_info "Step 1: Create user"
    user_response=$(curl -s -X POST "$BASE_URL/users" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -d '{
            "email": "testuser'$(date +%s)'@test.com",
            "password": "UserPass123!",
            "name": "Test User",
            "phone": "+92300123456",
            "role": "engineer"
        }')
    
    USER_ID=$(echo "$user_response" | jq -r '.id')
    print_success "User created: $USER_ID"
    
    print_info "Step 2: Get user permissions"
    perms_response=$(curl -s -X GET "$BASE_URL/users/$USER_ID/permissions" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if echo "$perms_response" | grep -q '"permissions"'; then
        print_success "Permissions retrieved"
    else
        print_error "Permission retrieval failed"
    fi
    
    print_info "Step 3: Update user role"
    role_response=$(curl -s -X POST "$BASE_URL/users/$USER_ID/role" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -d '{"role": "admin"}')
    
    if echo "$role_response" | grep -q '"role"'; then
        print_success "User role updated"
    else
        print_error "Role update failed"
    fi
    
    print_success "SCENARIO 5 COMPLETED\n"
}

# ========================================================================
# Main Menu
# ========================================================================
show_menu() {
    echo -e "\n${BLUE}Construction Document Management API - Test Scenarios${NC}\n"
    echo "Select a scenario to run:"
    echo "  1) Authentication Flow"
    echo "  2) Customer Management Flow"
    echo "  3) Quotation → Invoice → Payment Flow"
    echo "  4) Document Upload & Sharing Flow"
    echo "  5) User Role & Permission Flow"
    echo "  6) Run All Scenarios"
    echo "  0) Exit"
    echo ""
}

# ========================================================================
# Main Execution
# ========================================================================
if [ $# -eq 0 ]; then
    while true; do
        show_menu
        read -p "Enter choice [0-6]: " choice
        
        case $choice in
            1) scenario_auth_flow ;;
            2) scenario_customer_flow ;;
            3) scenario_quotation_payment_flow ;;
            4) scenario_document_flow ;;
            5) scenario_user_permission_flow ;;
            6)
                scenario_auth_flow
                scenario_customer_flow
                scenario_quotation_payment_flow
                scenario_document_flow
                scenario_user_permission_flow
                ;;
            0)
                echo -e "\n${GREEN}Goodbye!${NC}\n"
                exit 0
                ;;
            *)
                print_error "Invalid choice"
                ;;
        esac
    done
else
    case $1 in
        auth) scenario_auth_flow ;;
        customer) scenario_customer_flow ;;
        quotation) scenario_quotation_payment_flow ;;
        document) scenario_document_flow ;;
        permission) scenario_user_permission_flow ;;
        all)
            scenario_auth_flow
            scenario_customer_flow
            scenario_quotation_payment_flow
            scenario_document_flow
            scenario_user_permission_flow
            ;;
        *)
            echo "Usage: $0 [auth|customer|quotation|document|permission|all]"
            exit 1
            ;;
    esac
fi

print_header "All test scenarios completed!"
