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

function Get-InteractiveToken {
    param([string]$TenantId,[string]$ClientId,[string]$Scope)

    if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Authentication)) {
        throw "Microsoft.Graph.Authentication module is required."
    }

    Write-Host '==> Acquiring delegated token with Microsoft Graph interactive auth'
    Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null
    Connect-MgGraph -TenantId $TenantId -ClientId $ClientId -Scopes $Scope -NoWelcome

    $ctx = Get-MgContext
    if (-not $ctx) { throw 'Microsoft Graph context was not created.' }

    # Get-MgContext does not expose the raw access token. Use the Graph Authentication module's
    # internal token cache through Invoke-MgGraphRequest against the target resource is not possible,
    # so fall back to Azure CLI/MSAL if available.
    throw 'Interactive Graph sign-in succeeded, but raw token extraction is not available through supported Microsoft.Graph cmdlets. Use the confidential-client smoke test path instead.'
}

function Invoke-Mcp {
    param([string]$Method,[hashtable]$Params,[int]$Id,[string]$Token)

    $payload = @{
        jsonrpc = '2.0'
        id = $Id
        method = $Method
        params = $Params
    } | ConvertTo-Json -Depth 10 -Compress

    return Invoke-RestMethod -Method Post -Uri $McpUrl -Headers @{ Authorization = "Bearer $Token"; Accept = 'application/json, text/event-stream' } -ContentType 'application/json' -Body $payload
}

Write-Host 'This smoke test now requires a token obtained by the ChatGPT OAuth client secret flow or another confidential-client test harness.'
Write-Host 'AADSTS7000218 confirms Entra is treating this app as confidential, which is correct for the ChatGPT connector.'
Write-Host 'Do not enable public client flow on the ChatGPT connector app merely for testing.'
Write-Host 'Use the live ChatGPT connector as the OAuth client and validate server logs / MCP tool discovery after authentication.'
exit 3
