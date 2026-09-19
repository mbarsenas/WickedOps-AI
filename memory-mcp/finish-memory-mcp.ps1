param(
    [Parameter(Mandatory=$false)]
    [string]$TenantId = 'be240431-17fd-460f-bbb0-900569c60b29',

    [Parameter(Mandatory=$false)]
    [string]$ResourceUri = 'https://memory-mcp.wickedadmin.com/mcp',

    [Parameter(Mandatory=$false)]
    [string]$ApiDisplayName = 'WickedOps Memory MCP API',

    [Parameter(Mandatory=$false)]
    [string]$ClientDisplayName = 'WickedOps Memory MCP ChatGPT',

    [Parameter(Mandatory=$false)]
    [string]$ChatGptRedirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect'
)

$ErrorActionPreference = 'Stop'

function Require-Module {
    param([string]$Name)
    if (-not (Get-Module -ListAvailable -Name $Name)) {
        throw "Required PowerShell module '$Name' is not installed."
    }
}

Require-Module Microsoft.Graph.Authentication
Require-Module Microsoft.Graph.Applications
Require-Module Microsoft.Graph.Users

$requiredScopes = @(
    'Application.ReadWrite.All',
    'DelegatedPermissionGrant.ReadWrite.All',
    'Directory.Read.All',
    'User.Read'
)

$ctx = Get-MgContext -ErrorAction SilentlyContinue
$needsConnect = $true
if ($ctx) {
    $missing = $requiredScopes | Where-Object { $_ -notin $ctx.Scopes }
    if (-not $missing -and $ctx.TenantId -eq $TenantId) { $needsConnect = $false }
}
if ($needsConnect) {
    Connect-MgGraph -TenantId $TenantId -Scopes $requiredScopes -NoWelcome
    $ctx = Get-MgContext
}

$scopeValue = 'MCP.Access'
$scopeFull  = "$ResourceUri/$scopeValue"

Write-Host "==> Ensuring resource API application"
$apiApp = Get-MgApplication -Filter "displayName eq '$ApiDisplayName'" -All | Select-Object -First 1
if (-not $apiApp) {
    $scopeId = [guid]::NewGuid()
    $apiApp = New-MgApplication -BodyParameter @{
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
} else {
    $existingScope = $apiApp.Api.Oauth2PermissionScopes | Where-Object { $_.Value -eq $scopeValue } | Select-Object -First 1
    $scopeId = if ($existingScope) { $existingScope.Id } else { [guid]::NewGuid() }
    Update-MgApplication -ApplicationId $apiApp.Id -BodyParameter @{
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
    $apiApp = Get-MgApplication -ApplicationId $apiApp.Id
}

$apiSp = Get-MgServicePrincipal -Filter "appId eq '$($apiApp.AppId)'" -All | Select-Object -First 1
if (-not $apiSp) { $apiSp = New-MgServicePrincipal -AppId $apiApp.AppId }
$scopeId = ($apiApp.Api.Oauth2PermissionScopes | Where-Object { $_.Value -eq $scopeValue } | Select-Object -First 1).Id
if (-not $scopeId) { throw 'MCP.Access scope id could not be resolved.' }

Write-Host "==> Ensuring ChatGPT OAuth client application"
$clientApp = Get-MgApplication -Filter "displayName eq '$ClientDisplayName'" -All | Select-Object -First 1
$web = @{
    RedirectUris = @($ChatGptRedirectUri)
    ImplicitGrantSettings = @{
        EnableAccessTokenIssuance = $false
        EnableIdTokenIssuance = $false
    }
}
$resourceAccess = @(
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

if (-not $clientApp) {
    $clientApp = New-MgApplication -BodyParameter @{
        DisplayName = $ClientDisplayName
        SignInAudience = 'AzureADMyOrg'
        Web = $web
        RequiredResourceAccess = $resourceAccess
    }
} else {
    Update-MgApplication -ApplicationId $clientApp.Id -BodyParameter @{
        Web = $web
        RequiredResourceAccess = $resourceAccess
    }
    $clientApp = Get-MgApplication -ApplicationId $clientApp.Id
}

$clientSp = Get-MgServicePrincipal -Filter "appId eq '$($clientApp.AppId)'" -All | Select-Object -First 1
if (-not $clientSp) { $clientSp = New-MgServicePrincipal -AppId $clientApp.AppId }

Write-Host "==> Ensuring delegated permission grant"
$grant = Get-MgOauth2PermissionGrant -Filter "clientId eq '$($clientSp.Id)' and resourceId eq '$($apiSp.Id)'" -All | Select-Object -First 1
if (-not $grant) {
    $signedInUser = Get-MgUser -UserId $ctx.Account -Property Id,UserPrincipalName
    if (-not $signedInUser.Id) { throw "Could not resolve signed-in Graph user object id for $($ctx.Account)." }

    New-MgOauth2PermissionGrant -BodyParameter @{
        ClientId = $clientSp.Id
        ConsentType = 'Principal'
        PrincipalId = $signedInUser.Id
        ResourceId = $apiSp.Id
        Scope = $scopeValue
    } | Out-Null
}

Write-Host "==> Creating a new ChatGPT client secret"
$secret = Add-MgApplicationPassword -ApplicationId $clientApp.Id -PasswordCredential @{
    DisplayName = 'ChatGPT Memory MCP connector'
    EndDateTime = (Get-Date).ToUniversalTime().AddYears(1)
}

if (-not $secret.SecretText) { throw 'Client secret was not returned.' }

Write-Host ''
Write-Host '=== WickedOps Memory MCP OAuth bootstrap complete ==='
Write-Host "TENANT_ID=$TenantId"
Write-Host "RESOURCE_URI=$ResourceUri"
Write-Host "MCP_SCOPE=$scopeFull"
Write-Host "API_APP_ID=$($apiApp.AppId)"
Write-Host "CHATGPT_CLIENT_APP_ID=$($clientApp.AppId)"
Write-Host "CHATGPT_REDIRECT_URI=$ChatGptRedirectUri"
Write-Host "AUTHORIZATION_URL=https://login.microsoftonline.com/$TenantId/oauth2/v2.0/authorize"
Write-Host "TOKEN_URL=https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token"
Write-Host "OAUTH_SCOPES=openid offline_access $scopeFull"
Write-Host ''
Write-Host 'CLIENT_SECRET_BEGIN'
Write-Host $secret.SecretText
Write-Host 'CLIENT_SECRET_END'
Write-Host ''
Write-Host 'IMPORTANT: Store the client secret only in the ChatGPT app connection. Do not paste it into chat or commit it to GitHub.'
Write-Host 'If ChatGPT shows a connector-specific callback URL instead of the stable platform redirect, rerun with -ChatGptRedirectUri set to that exact URL.'
