# Construction Document Management - API Testing Guide

## Overview

This directory contains comprehensive API testing files for the Construction Document Management system. It includes HTTP request files for testing all modules, global credentials management, and automated testing scripts.

## Phase 1 Active Routes

The currently implemented and testable routes are:
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- `GET /api/users/me`, `PATCH /api/users/me`
- `GET /api/customers/me`, `GET /api/customers/me/documents`, `GET /api/customers/me/subscriptions`, `GET /api/customers/me/invoices`
- `POST /api/documents/upload-url`, `POST /api/documents/:id/upload`, `GET /api/documents/:id/download-url`, `GET /api/documents/:id/download`, `PATCH /api/documents/:id/status`

## Directory Structure

```
test/
├── global.http              # Global credentials, environment variables, and auth tests
├── run-tests.sh             # Bash script for automated testing
├── run-tests.bat            # Windows batch script for automated testing
├── .env.local               # Local environment configuration
├── .env.staging             # Staging environment configuration
├── .env.production          # Production environment configuration
├── README.md                # This file
└── modules/
   ├── auth/auth.http              # Authentication tests (register, login, etc.)
    ├── admin/admin.http            # Admin panel tests
    ├── customers/customers.http    # Customer management tests
    ├── documents/documents.http    # Document management tests
    ├── packages/packages.http      # Package management tests
    ├── payments/payments.http      # Payment processing tests
    ├── pricing/pricing.http        # Pricing management tests
    ├── quotations/quotations.http  # Quotation management tests
    ├── subscriptions/subscriptions.http  # Subscription management tests
    └── users/users.http            # User management tests
```

## Quick Start

### Prerequisites

- **REST Client Extension** (VS Code): For interactive HTTP testing
  - Install: `code --install-extension humao.rest-client`
  - Or install from VS Code extensions marketplace
  
- **Node.js/npm**: For running the API server

- **curl**: For command-line testing (optional, comes with most systems)

### Setup Steps

1. **Clone and install the project**
   ```bash
   npm install
   cd apps/api
   npm install
   ```

2. **Configure environment variables**
   - Copy `.env.local` and update with your local settings
   - Ensure database and Redis are running

3. **Start the API server**
   ```bash
   npm run dev
   # or
   npm start
   ```

4. **Import credentials**
   - Open `test/global.http` in VS Code
   - This file contains all test credentials and variables
   - Update credentials in `global.http` as needed

## Usage Methods

### Method 1: Using REST Client Extension (Recommended)

1. **Install REST Client extension** in VS Code
2. **Open any `.http` file** (e.g., `test/modules/auth/auth.http`)
3. **Click "Send Request"** button above any test
4. **View response** in the output panel

**Features:**
- Variables from `global.http` are automatically available
- Save responses with right-click → "Save Response"
- History of all requests

### Method 2: Using curl Commands

```bash
# Test register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@test.com",
    "password": "Password123!",
    "name": "Test User",
    "phone": "+92300123456"
  }'

# Test login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "AdminPassword123!"
  }'

# Test with authentication
curl -X GET http://localhost:3000/api/customers \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Method 3: Automated Testing Scripts

#### On Linux/Mac:
```bash
chmod +x test/run-tests.sh
./test/run-tests.sh
```

#### On Windows:
```cmd
test\run-tests.bat
```

**Output:**
- Test results with pass/fail status
- Success rate percentage
- Exit code: 0 (success) or 1 (failure)

## Global Credentials

Located in `test/global.http`:

```
# Admin Account
email: admin@test.com
password: AdminPassword123!

# Engineer Account
email: engineer@test.com
password: EngineerPass123!

# Customer Account
email: customer@test.com
password: CustomerPass123!

# Viewer Account
email: viewer@test.com
password: ViewerPass123!
```

## Test Categories

### 1. Authentication (auth.http)
- Register new user
- Login with credentials
- Login failure scenarios
- Token refresh
- Password change
- Password reset
- Email verification
- Logout

### 2. Admin Panel (admin.http)
- User management (CRUD)
- System statistics
- Activity logs
- Audit trails
- Settings management

### 3. Customer Management (customers.http)
- List customers
- Create customer
- Update customer info
- Delete customer
- Search customers
- Export to CSV

### 4. Document Management (documents.http)
- Upload documents
- Download documents
- Update document metadata
- Document sharing
- Version history
- Status tracking
- Comments and annotations

### 5. Quotations (quotations.http)
- Create quotations
- Add items to quotation
- Calculate totals
- Send to customers
- Accept/reject quotations
- Convert to invoice
- Download as PDF

### 6. Payments (payments.http)
- Record payments
- Process refunds
- Payment verification
- Receipt generation
- Payment history
- Bulk payment processing

### 7. Packages (packages.http)
- List packages
- Create custom packages
- Manage features
- Compare packages
- Pricing information

### 8. Pricing (pricing.http)
- Pricing plans
- Calculate quotes
- Apply discounts
- Pricing history
- Price comparisons

### 9. Subscriptions (subscriptions.http)
- Create subscription
- Upgrade/downgrade
- Cancel subscription
- Billing management
- Usage tracking

### 10. User Management (users.http)
- User profiles
- Role management
- Permissions
- Activity logs
- Notifications

## Common Variables

Available in `global.http`:

```
@baseUrl = http://localhost:3000/api
@adminEmail = admin@test.com
@adminPassword = AdminPassword123!
@adminToken = (populated after login)
@timestamp = (generated on each request)
@randomString = (generated on each request)
@randomInt = (generated on each request)
```

## Environment Configuration

### Local Development (.env.local)
```
NODE_ENV=development
API_URL=http://localhost:3000
API_PORT=3000
DB_HOST=localhost
DB_PORT=15432
```

### Staging (.env.staging)
```
NODE_ENV=staging
API_URL=https://staging-api.example.com
API_PORT=443
```

### Production (.env.production)
```
NODE_ENV=production
API_URL=https://api.example.com
API_PORT=443
```

## Testing Workflow

### 1. Initial Setup
```bash
# Run login test first to get auth token
# Copy the accessToken from response
# Update @adminToken in global.http with the token
```

### 2. Module Testing
```bash
# Test each module sequentially:
1. test/modules/auth/auth.http          (Login tests)
2. test/modules/customers/customers.http (Customer tests)
3. test/modules/documents/documents.http (Document tests)
4. test/modules/quotations/quotations.http (Quotation tests)
5. test/modules/payments/payments.http  (Payment tests)
```

### 3. Integration Testing
```bash
# Test complete workflows:
1. Create customer
2. Create quotation for customer
3. Send quotation
4. Accept quotation
5. Generate invoice
6. Process payment
```

### 4. Error Handling
```bash
# Test error scenarios:
1. Invalid credentials
2. Missing required fields
3. Unauthorized access
4. Resource not found
5. Validation errors
```

## Tips & Tricks

### Saving Responses
- Right-click response → "Save Response"
- Responses are saved to `.vscode/rest-client/` directory

### Chaining Requests
- Use variables to pass data between requests
- Example: Save ID from one request, use in next request

### Debugging
- Check Network tab in browser dev tools
- Use `console.log()` in REST Client requests
- Check server logs in terminal

### Performance Testing
- Use multiple requests in quick succession
- Monitor API response times
- Check database query performance

## Troubleshooting

### Connection Refused
- Ensure API server is running: `npm start`
- Check port number (default: 3000)
- Check firewall settings

### Authentication Failed
- Verify credentials in `global.http`
- Check token expiration
- Ensure JWT secret is configured

### Validation Errors
- Check request body format (JSON)
- Verify all required fields are included
- Check data types and constraints

### Database Errors
- Ensure PostgreSQL is running
- Check database connection string
- Run migrations: `npm run migrate`

## Best Practices

1. **Always authenticate first**
   - Run login test before other tests
   - Save token in variables

2. **Test in isolation**
   - Each test should be independent
   - Clean up test data after tests

3. **Use meaningful names**
   - Name variables clearly
   - Add comments for complex tests

4. **Document test scenarios**
   - Add comments explaining what each test does
   - Include expected results

5. **Version control**
   - Commit `.http` files to version control
   - Don't commit real credentials
   - Use environment variables instead

## Advanced Features

### Batch Testing
```bash
# Run specific test file
rest-client-cli test/modules/auth/auth.http

# Run all tests
rest-client-cli test/**/*.http
```

### CI/CD Integration
```yaml
# Example GitHub Actions workflow
- name: Run API Tests
  run: npm run test:api
```

### Test Reports
- Tests can be exported to JUnit XML format
- Integrate with CI/CD pipelines
- Generate HTML reports

## Support & Issues

- Check API documentation: `/api/docs`
- Review error logs in `logs/` directory
- Check database integrity
- Contact development team for issues

## Next Steps

1. Start with `global.http` - run register and login tests
2. Test each module following the directory structure
3. Create your own custom test cases
4. Integrate tests into CI/CD pipeline
5. Set up automated test runs

---

**Last Updated:** 2024
**Version:** 1.0
