[CmdletBinding()]
param(
  [string]$BaseUrl = "http://localhost:3001/api",
  [string]$AdminEmail = $env:ADMIN_EMAIL,
  [string]$AdminPassword = $env:ADMIN_PASSWORD,
  [ValidateSet("agent", "manager", "admin")]
  [string]$StaffRole = "agent",
  [string]$StaffEmail = "staff-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))@test.local",
  [string]$StaffPassword = "StaffPassword123!"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($AdminEmail) -or [string]::IsNullOrWhiteSpace($AdminPassword)) {
  throw "Set ADMIN_EMAIL and ADMIN_PASSWORD, or pass -AdminEmail and -AdminPassword."
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    [hashtable]$Headers = @{},
    [object]$Body
  )

  $params = @{
    Method = $Method
    Uri = "$BaseUrl$Path"
    Headers = $Headers
    ContentType = "application/json"
  }

  if ($null -ne $Body) {
    $params.Body = ($Body | ConvertTo-Json -Depth 5)
  }

  try {
    return Invoke-RestMethod @params
  } catch {
    $responseBody = $_.ErrorDetails.Message
    if ($responseBody) {
      throw "API $Method $Path failed: $responseBody"
    }
    throw
  }
}

Write-Host "Checking API health..."
$healthUri = ([System.Uri]$BaseUrl).GetLeftPart([System.UriPartial]::Authority) + "/health"
$health = Invoke-RestMethod -Method Get -Uri $healthUri
if ($health.data.status -ne "ok") {
  throw "API health check did not return status=ok."
}

Write-Host "Logging in as admin $AdminEmail..."
$adminLogin = Invoke-Api -Method Post -Path "/auth/login" -Body @{
  email = $AdminEmail
  password = $AdminPassword
}
$adminToken = $adminLogin.data.accessToken
if ([string]::IsNullOrWhiteSpace($adminToken) -or $adminLogin.data.user.role -ne "admin") {
  throw "The admin login did not return an admin access token."
}

Write-Host "Creating $StaffRole account $StaffEmail..."
$staff = Invoke-Api -Method Post -Path "/admin/users" -Headers @{ Authorization = "Bearer $adminToken" } -Body @{
  email = $StaffEmail
  password = $StaffPassword
  name = "Docker Staff Verification"
  phone = "+10000000000"
  role = $StaffRole
}

if ($staff.data.email -ne $StaffEmail -or $staff.data.role -ne $StaffRole) {
  throw "The created account did not match the requested email or role."
}

Write-Host "Logging in as newly created staff account..."
$staffLogin = Invoke-Api -Method Post -Path "/auth/login" -Body @{
  email = $StaffEmail
  password = $StaffPassword
}
$staffToken = $staffLogin.data.accessToken
if ([string]::IsNullOrWhiteSpace($staffToken) -or $staffLogin.data.user.role -ne $StaffRole) {
  throw "Staff login failed or returned the wrong role."
}

$me = Invoke-Api -Method Get -Path "/users/me" -Headers @{ Authorization = "Bearer $staffToken" }
if ($me.data.email -ne $StaffEmail -or $me.data.role -ne $StaffRole) {
  throw "The staff access token could not read the expected user profile."
}

Write-Host "PASS: API health, admin login, staff creation, staff login, and authenticated profile access."
Write-Host "Created staff user: $StaffEmail ($StaffRole)"