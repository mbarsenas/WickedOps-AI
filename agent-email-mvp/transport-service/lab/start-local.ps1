$ErrorActionPreference='Stop'
$labDir=$PSScriptRoot
$secretFile=Join-Path $labDir '.env'
if (!(Test-Path -LiteralPath $secretFile)) {
  $token=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
  $accounts=@(@{workspace='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';token=$token;domains=@('senderpermit.test','inbox.senderpermit.test')}) | ConvertTo-Json -Compress -AsArray
  [IO.File]::WriteAllText($secretFile,"TRANSPORT_ACCOUNTS='"+$accounts+"'"+[Environment]::NewLine)
}
docker compose --env-file $secretFile -f (Join-Path $labDir 'compose.yaml') up -d --build
if($LASTEXITCODE -ne 0){throw 'Local mail lab did not start. Check Docker Desktop.'}
Write-Output 'Local test inbox: http://localhost:8025'
