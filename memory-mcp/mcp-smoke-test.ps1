param(
    [Parameter(Mandatory=$false)]
    [string]$TenantId = 'be240431-17fd-460f-bbb0-900569c60b29',

    [Parameter(Mandatory=$false)]
    [string]$ClientId = 'de82c6fb-ec6d-4193-a555-d0764f9799af',

    [Parameter(Mandatory=$false)]
    [string]$Scope = 'https://memory-mcp.wickedadmin.com/mcp/MCP.Access',

    [Parameter(Mandatory=$false)]
    [string]$McpUrl = 'https://memory-mcp.wickedadmin.com/mcp'
)

$ErrorActionPreference = 'Stop'

function Ensure-PublicClientFlow {
    param([string]$TenantId,[string]$ClientId)

    if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Authentication)) {
        throw "Microsoft.Graph.Authentication module is required."
    }
    if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Applications)) {
        throw "Microsoft.Graph.Applications module is required."
    }

    $ctx = Get-MgContext -ErrorAction SilentlyContinue
    if (-not $ctx -or $ctx.TenantId -ne $TenantId -or 'Application.ReadWrite.All' -notin $ctx.Scopes) {
        Connect-MgGraph -TenantId $TenantId -Scopes 'Application.ReadWrite.All' -NoWelcome
    }

    $app = Get-MgApplication -Filter "appId eq '$ClientId'" -All | Select-Object -First 1
    if (-not $app) { throw "Could not find Entra application for client id $ClientId" }

    if (-not $app.IsFallbackPublicClient) {
        Write-Host '==> Enabling public client flow for device-code smoke testing'
        Update-MgApplication -ApplicationId $app.Id -BodyParameter @{ IsFallbackPublicClient = $true }
    } else {
        Write-Host '==> Public client flow already enabled'
    }
}

function Get-DeviceCodeToken {
    param([string]$TenantId,[string]$ClientId,[string]$Scope)

    $device = Invoke-RestMethod -Method Post `
        -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/devicecode" `
        -ContentType 'application/x-www-form-urlencoded' `
        -Body @{ client_id = $ClientId; scope = "openid offline_access $Scope" }

    Write-Host ''
    Write-Host '=== SIGN IN ==='
    Write-Host $device.message
    Write-Host ''

    $deadline = (Get-Date).AddSeconds([int]$device.expires_in)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds ([int]$device.interval)
        try {
            return Invoke-RestMethod -Method Post `
                -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" `
                -ContentType 'application/x-www-form-urlencoded' `
                -Body @{
                    grant_type = 'urn:ietf:params:oauth:grant-type:device_code'
                    client_id  = $ClientId
                    device_code = $device.device_code
                }
        } catch {
            $body = $null
            try { $body = $_.ErrorDetails.Message | ConvertFrom-Json } catch {}
            if ($body.error -eq 'authorization_pending') { continue }
            if ($body.error -eq 'slow_down') { Start-Sleep -Seconds 5; continue }
            throw
        }
    }
    throw 'Device-code sign-in timed out.'
}

function Invoke-Mcp {
    param([string]$Method,[hashtable]$Params,[int]$Id,[string]$Token)

    $payload = @{
        jsonrpc = '2.0'
        id = $Id
        method = $Method
        params = $Params
    } | ConvertTo-Json -Depth 10 -Compress

    return Invoke-RestMethod -Method Post `
        -Uri $McpUrl `
        -Headers @{ Authorization = "Bearer $Token"; Accept = 'application/json, text/event-stream' } `
        -ContentType 'application/json' `
        -Body $payload
}

Ensure-PublicClientFlow -TenantId $TenantId -ClientId $ClientId

$token = Get-DeviceCodeToken -TenantId $TenantId -ClientId $ClientId -Scope $Scope
if (-not $token.access_token) { throw 'No access token returned.' }

Write-Host '=== TOKEN ACQUIRED ==='
Write-Host 'Access token acquired successfully. Token value intentionally not displayed.'

Write-Host ''
Write-Host '=== MCP INITIALIZE ==='
$init = Invoke-Mcp -Method 'initialize' -Id 1 -Token $token.access_token -Params @{
    protocolVersion = '2025-06-18'
    capabilities = @{}
    clientInfo = @{ name = 'wickedops-memory-smoke'; version = '1.0' }
}
$init | ConvertTo-Json -Depth 20

Write-Host ''
Write-Host '=== MCP TOOLS/LIST ==='
$tools = Invoke-Mcp -Method 'tools/list' -Id 2 -Token $token.access_token -Params @{}
$tools | ConvertTo-Json -Depth 20

$toolNames = @($tools.result.tools | ForEach-Object { $_.name })
$expected = @('memory_record','memory_search','memory_get','command_record','command_search','state_record','state_get','memory_context')
$missing = @($expected | Where-Object { $_ -notin $toolNames })

Write-Host ''
if ($missing.Count -gt 0) {
    Write-Host ('MCP_SMOKE_TEST=FAIL missing=' + ($missing -join ','))
    exit 2
}

Write-Host ('MCP_SMOKE_TEST=PASS tools=' + ($toolNames -join ','))
