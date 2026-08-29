## API Testing Quick Reference Guide

### Getting Started

#### 1. Start the API Server
```bash
cd apps/api
npm install
npm start
# Server runs on http://localhost:3000
```

#### 2. Open REST Client Files
- File → Open → `test/global.http`
- Or any module-specific file in `test/modules/`

#### 3. Run First Test
- Locate "Test: Register - New User Registration" in `global.http`
- Locate "Test: Register - New User Registration" in `global.http`
- Click "Send Request" button
- View response in output panel

---

### Essential Credentials

```
Admin Login:
  Email: admin@test.com
  Password: AdminPassword123!

Engineer Login:
  Email: engineer@test.com
  Password: EngineerPass123!

Customer Login:
  Email: customer@test.com
  Password: CustomerPassword123!
```

---

### Common API Endpoints

#### Current Phase 1 Routes
```
POST   /auth/register            → Register new user
POST   /auth/login               → Login user
POST   /auth/refresh             → Refresh access token
POST   /auth/logout              → Logout user
GET    /users/me                 → Get current user profile
PATCH  /users/me                 → Update current user profile
GET    /customers/me             → Get customer portal profile
GET    /customers/me/documents   → List own documents
GET    /customers/me/subscriptions → List own subscriptions
GET    /customers/me/invoices    → List own invoices
POST   /documents/upload-url     → Create document upload target
POST   /documents/:id/upload     → Local multipart upload fallback
GET    /documents/:id/download-url → Get document download URL
GET    /documents/:id/download   → Download or redirect file
PATCH  /documents/:id/status    → Update document status
```

#### Authentication
```
POST   /auth/register            → Register new user
POST   /auth/login               → Login user
POST   /auth/logout              → Logout user
POST   /auth/refresh             → Refresh access token
POST   /auth/forgot-password     → Request password reset
```

#### Users
```
GET    /users                    → List all users
GET    /users/:id                → Get user by ID
POST   /users                    → Create user (admin)
PUT    /users/:id                → Update user
DELETE /users/:id                → Delete user
```

#### Customers
```
GET    /customers                → List customers
GET    /customers/:id            → Get customer
POST   /customers                → Create customer
PUT    /customers/:id            → Update customer
DELETE /customers/:id            → Delete customer
```

#### Documents
```
GET    /documents                → List documents
GET    /documents/:id            → Get document
POST   /documents                → Create document
PUT    /documents/:id            → Update document
DELETE /documents/:id            → Delete document
POST   /documents/upload         → Upload file
GET    /documents/:id/download   → Download document
```

#### Quotations
```
GET    /quotations               → List quotations
GET    /quotations/:id           → Get quotation
POST   /quotations               → Create quotation
PUT    /quotations/:id           → Update quotation
DELETE /quotations/:id           → Delete quotation
POST   /quotations/:id/send      → Send quotation
POST   /quotations/:id/accept    → Accept quotation
```

#### Payments
```
GET    /payments                 → List payments
GET    /payments/:id             → Get payment
POST   /payments                 → Record payment
PUT    /payments/:id             → Update payment
POST   /payments/:id/refund      → Process refund
```

#### Subscriptions
```
GET    /subscriptions            → List subscriptions
GET    /subscriptions/:id        → Get subscription
POST   /subscriptions            → Create subscription
PUT    /subscriptions/:id        → Update subscription
POST   /subscriptions/:id/cancel → Cancel subscription
```

---

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | OK | Success ✓ |
| 201 | Created | Resource created ✓ |
| 204 | No Content | Success, no response body ✓ |
| 400 | Bad Request | Check request format |
| 401 | Unauthorized | Add auth token |
| 403 | Forbidden | Check permissions |
| 404 | Not Found | Check resource ID |
| 409 | Conflict | Resource already exists |
| 500 | Server Error | Check server logs |

---

### Authentication

#### Getting Access Token
```
1. Open test/global.http
2. Find "Test: Login - Admin User"
3. Click "Send Request"
4. Copy accessToken from response
5. Paste into @adminToken variable
6. Use in other requests automatically
```

#### Using Token in Requests
```
Authorization: Bearer <your_access_token>
```

---

### Variable Usage

#### Available Variables (in global.http)
```
@baseUrl           = http://localhost:3000/api
@adminEmail        = admin@test.com
@adminPassword     = AdminPassword123!
@adminToken        = <your_token>
@customerId        = <resource_id>
@documentId        = <resource_id>
@timestamp         = auto-generated
@randomString      = auto-generated
```

#### Using Variables in Requests
```
POST {{baseUrl}}/customers
Authorization: Bearer {{adminToken}}

Body:
{
  "email": "{{randomString}}@test.com"
}
```

---

### Testing Tips

#### 1. Test Authentication First
- Always run login test first
- Copy the token
- Update variables before other tests

#### 2. Save Responses
- Right-click response → "Save Response"
- Responses saved to `.vscode/rest-client/`

#### 3. Check Error Messages
- Look at response body for error details
- Error messages indicate what went wrong

#### 4. Test in Sequence
- Create resource first
- Then test get/update/delete
- This prevents "not found" errors

#### 5. Use Test Data
- Create temporary test data
- Delete after test completes
- Keeps database clean

---

### Debugging Issues

#### Issue: Connection Refused
```
✗ Error: connect ECONNREFUSED 127.0.0.1:3000

Fix:
1. Ensure server is running: npm start
2. Check port: default is 3000
3. Check firewall settings
```

#### Issue: Unauthorized (401)
```
✗ Error: 401 Unauthorized

Fix:
1. Run login test first
2. Copy accessToken
3. Update @adminToken variable
4. Try request again
```

#### Issue: Not Found (404)
```
✗ Error: 404 Not Found

Fix:
1. Check resource ID is correct
2. Create resource first if new
3. Check endpoint path spelling
```

#### Issue: Bad Request (400)
```
✗ Error: 400 Bad Request

Fix:
1. Check JSON syntax
2. Verify all required fields
3. Check data types
4. Check field value constraints
```

---

### Performance Monitoring

#### Check Response Time
- Look at "Time" field in response header
- Normal: < 500ms
- Good: < 200ms

#### Common Issues
- Response > 1000ms → Database slow
- Request hangs → Network/timeout
- 500 error → Server error

---

### File Organization

```
test/
├── global.http              ← Start here (auth & register)
├── README.md                ← Full documentation
├── TESTING-CHECKLIST.md     ← Test scenarios
├── QUICK-REFERENCE.md       ← This file
├── run-tests.sh             ← Linux/Mac testing script
├── run-tests.bat            ← Windows testing script
├── .env.local               ← Local config
├── .env.staging             ← Staging config
├── .env.production          ← Production config
└── modules/
    ├── auth/auth.http
    ├── admin/admin.http
    ├── customers/customers.http
    ├── documents/documents.http
    ├── packages/packages.http
    ├── payments/payments.http
    ├── pricing/pricing.http
    ├── quotations/quotations.http
    ├── subscriptions/subscriptions.http
    └── users/users.http
```

---

### Testing Workflow Example

#### Step 1: Login
```
1. Open test/global.http
2. Find "Test: Login - Admin User"
3. Click "Send Request"
4. Copy accessToken value
5. Update @adminToken = <token>
```

#### Step 2: Create Customer
```
1. Open test/modules/customers/customers.http
2. Find "Test: Create New Customer"
3. Click "Send Request"
4. Copy customerId from response
5. Update @customerId = <id>
```

#### Step 3: Create Quotation
```
1. Open test/modules/quotations/quotations.http
2. Find "Test: Create New Quotation"
3. Update customerId in body to @customerId
4. Click "Send Request"
5. Copy quotationId from response
```

---

### Multi-Environment Testing

#### Switch Environments
```bash
# Local Development
set NODE_ENV=development
npm start

# Staging
set NODE_ENV=staging
npm start

# Production (not recommended for testing)
set NODE_ENV=production
npm start
```

#### Update Base URL
In `global.http`, update:
```
@baseUrl = http://staging-api.example.com/api  (for staging)
@baseUrl = https://api.example.com/api         (for production)
@baseUrl = http://localhost:3000/api           (for local)
```

---

### Advanced Techniques

#### 1. Chain Requests
Save data from one request, use in next:
```
First request response: { id: "123" }
Update variable: @customerId = 123
Next request uses: {{customerId}}
```

#### 2. Conditional Testing
```
Run test only if condition met
```

#### 3. Generate Test Data
```
@timestamp = {{$timestamp}}      # Unix timestamp
@randomString = {{$randomString}} # Random string
@randomInt = {{$randomInt}}       # Random number
```

#### 4. Export Results
- Right-click response
- "Save Response"
- Gets saved to file for documentation

---

### Useful VS Code Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+P | Command Palette |
| F1 | Command Palette |
| Ctrl+Alt+R | Send Request |
| Ctrl+Alt+L | Clear Response |
| Ctrl+Alt+H | History |

---

### Common Testing Patterns

#### Create-Read-Update-Delete (CRUD)
```
1. POST   Create new resource
2. GET    Read/verify created
3. PUT    Update resource
4. GET    Verify update
5. DELETE Remove resource
6. GET    Verify deletion
```

#### Authentication Flow
```
1. Register new user
2. Login with credentials
3. Save token
4. Use token in requests
5. Logout when done
```

#### Error Testing
```
1. Send invalid data → Check 400
2. Use wrong token → Check 401
3. Use non-existent ID → Check 404
4. Duplicate entry → Check 409
```

---

### Support & Help

#### Resources
- Full docs: [test/README.md](./README.md)
- Checklists: [test/TESTING-CHECKLIST.md](./TESTING-CHECKLIST.md)
- API Swagger: http://localhost:3000/api/docs

#### Common Issues
- Check server logs: `npm start` terminal
- Check response body for error details
- Verify credentials are correct
- Ensure database is connected

---

**Last Updated:** 2024
**Quick Reference v1.0**
