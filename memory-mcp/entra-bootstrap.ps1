param(
    [Parameter(Mandatory=$false)]
    [string]$TenantId = 'be240431-17fd-460f-bbb0-900569c60b29',

    [Parameter(Mandatory=$false)]
    [string]$ResourceUri = 'https://memory-mcp.wickedadmin.com/mcp',

    [Parameter(Mandatory=$false)]
    [string]$ApiDisplayName = 'WickedOps Memory MCP API',

    [Parameter(Mandatory=$false)]
    [string]$ClientDisplayName = 'WickedOps Memory MCP ChatGPT'
)

$ErrorActionPreference = 'Stop'

function Ensure-GraphConnection {
    $ctx = Get-MgContext -ErrorAction SilentlyContinue
    $required = @(
        'Application.ReadWrite.All',
        'DelegatedPermissionGrant.ReadWrite.All',
        'Directory.Read.All'
    )

    $needsConnect = $true
    if ($ctx) {
        $missing = $required | Where-Object { $_ -notin $ctx.Scopes }
        if (-not $missing) { $needsConnect = $false }
    }

    if ($needsConnect) {
        Connect-MgGraph -TenantId $TenantId -Scopes $required -NoWelcome
    }
}

Ensure-GraphConnection

$scopeValue = 'MCP.Access'
$scopeFull  = "$ResourceUri/$scopeValue"

Write-Host "==> Ensuring API application: $ApiDisplayName"
$apiApp = Get-MgApplication -Filter "displayName eq '$ApiDisplayName'" -All | Select-Object -First 1
if (-not $apiApp) {
    $scopeId = [guid]::NewGuid()
    $apiBody = @{
        DisplayName = $ApiDisplayName
        SignInAudience = 'AzureADMyOrg'
        IdentifierUris = @($ResourceUri)
        Api = @{
            RequestedAccessTokenVersion = 2
            Oauth2PermissionScopes = @(
                @{
                    Id = $scopeId
                    AdminConsentDescription = 'Allows access to the WickedOps Memory MCP service.'
                    AdminConsentDisplayName = 'Access WickedOps Memory MCP'
                    IsEnabled = $true
                    Type = 'User'
                    UserConsentDescription = 'Allows this application to access WickedOps Memory MCP on your behalf.'
                    UserConsentDisplayName = 'Access WickedOps Memory MCP'
                    Value = $scopeValue
                }
            )
        }
    }
    $apiApp = New-MgApplication -BodyParameter $apiBody
} else {
    $existingScope = $apiApp.Api.Oauth2PermissionScopes | Where-Object { $_.Value -eq $scopeValue } | Select-Object -First 1
    $scopeId = if ($existingScope) { $existingScope.Id } else { [guid]::NewGuid() }
    $apiPatch = @{
        IdentifierUris = @($ResourceUri)
        Api = @{
            RequestedAccessTokenVersion = 2
            Oauth2PermissionScopes = @(
                @{
                    Id = $scopeId
                    AdminConsentDescription = 'Allows access to the WickedOps Memory MCP service.'
                    AdminConsentDisplayName = 'Access WickedOps Memory MCP'
                    IsEnabled = $true
                    Type = 'User'
                    UserConsentDescription = 'Allows this application to access WickedOps Memory MCP on your behalf.'
                    UserConsentDisplayName = 'Access WickedOps Memory MCP'
                    Value = $scopeValue
                }
            )
        }
    }
    Update-MgApplication -ApplicationId $apiApp.Id -BodyParameter $apiPatch
    $apiApp = Get-MgApplication -ApplicationId $apiApp.Id
}

$apiSp = Get-MgServicePrincipal -Filter "appId eq '$($apiApp.AppId)'" -All | Select-Object -First 1
if (-not $apiSp) {
    $apiSp = New-MgServicePrincipal -AppId $apiApp.AppId
}

$scopeId = ($apiApp.Api.Oauth2PermissionScopes | Where-Object { $_.Value -eq $scopeValue } | Select-Object -First 1).Id
if (-not $scopeId) { throw 'Could not resolve MCP.Access scope id.' }

Write-Host "==> Ensuring ChatGPT OAuth client application: $ClientDisplayName"
$clientApp = Get-MgApplication -Filter "displayName eq '$ClientDisplayName'" -All | Select-Object -First 1
if (-not $clientApp) {
    $clientBody = @{
        DisplayName = $ClientDisplayName
        SignInAudience = 'AzureADMyOrg'
        RequiredResourceAccess = @(
            @{
                ResourceAppId = $apiApp.AppId
                ResourceAccess = @(
                    @{
                        Id = $scopeId
                        Type = 'Scope'
                    }
                )
            }
        )
    }
    $clientApp = New-MgApplication -BodyParameter $clientBody
} else {
    Update-MgApplication -ApplicationId $clientApp.Id -BodyParameter @{
        RequiredResourceAccess = @(
            @{
                ResourceAppId = $apiApp.AppId
                ResourceAccess = @(
                    @{
                        Id = $scopeId
                        Type = 'Scope'
                    }
                )
            }
        )
    }
    $clientApp = Get-MgApplication -ApplicationId $clientApp.Id
}

$clientSp = Get-MgServicePrincipal -Filter "appId eq '$($clientApp.AppId)'" -All | Select-Object -First 1
if (-not $clientSp) {
    $clientSp = New-MgServicePrincipal -AppId $clientApp.AppId
}

Write-Host ''
Write-Host '=== WickedOps Memory MCP Entra bootstrap complete ==='
Write-Host "TENANT_ID=$TenantId"
Write-Host "RESOURCE_URI=$ResourceUri"
Write-Host "MCP_SCOPE=$scopeFull"
Write-Host "API_APP_ID=$($apiApp.AppId)"
Write-Host "API_OBJECT_ID=$($apiApp.Id)"
Write-Host "API_SP_OBJECT_ID=$($apiSp.Id)"
Write-Host "CHATGPT_CLIENT_APP_ID=$($clientApp.AppId)"
Write-Host "CHATGPT_CLIENT_OBJECT_ID=$($clientApp.Id)"
Write-Host "CHATGPT_CLIENT_SP_OBJECT_ID=$($clientSp.Id)"
Write-Host ''
Write-Host 'NEXT: add the ChatGPT redirect URI to the client app once ChatGPT shows the callback URL, then create a client secret locally. Do not paste the secret into chat.'
