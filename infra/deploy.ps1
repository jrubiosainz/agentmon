<#
.SYNOPSIS
  Deploys the Agéntmon backend infrastructure (Cosmos DB + Linux App Service)
  to Azure using the Bicep template in this folder.

.DESCRIPTION
  Creates the target resource group if it doesn't already exist, then runs
  `az deployment group create` against main.bicep. If -JwtSecret is not
  supplied, a random 64-byte secret is generated for you (and printed once,
  masked in subsequent output) so JWTs can be signed in production.

.PARAMETER ResourceGroup
  Name of the resource group to create/use.

.PARAMETER Location
  Azure region for the resource group and resources. Defaults to swedencentral.

.PARAMETER NamePrefix
  Short prefix used to build globally-unique resource names. Defaults to 'agentmon'.

.PARAMETER JwtSecret
  Optional pre-generated JWT signing secret. If omitted, a random one is generated.

.EXAMPLE
  ./deploy.ps1 -ResourceGroup rg-agentmon-prod

.EXAMPLE
  ./deploy.ps1 -ResourceGroup rg-agentmon-prod -Location westeurope -NamePrefix agentmon2
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ResourceGroup,

  [string]$Location = 'swedencentral',

  [string]$NamePrefix = 'agentmon',

  [string]$JwtSecret
)

$ErrorActionPreference = 'Stop'

function New-RandomSecret {
  param([int]$Bytes = 48)
  $buffer = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
  return [Convert]::ToBase64String($buffer)
}

Write-Host "==> Checking Azure CLI login..." -ForegroundColor Cyan
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
  throw "Not logged in to Azure CLI. Run 'az login' first."
}
Write-Host "    Using subscription: $($account.name) ($($account.id))"

if (-not $JwtSecret) {
  Write-Host "==> No -JwtSecret supplied; generating a random one." -ForegroundColor Cyan
  $JwtSecret = New-RandomSecret
  Write-Host "    Generated JWT secret (SAVE THIS SOMEWHERE SAFE):"
  Write-Host "    $JwtSecret" -ForegroundColor Yellow
}

Write-Host "==> Ensuring resource group '$ResourceGroup' exists in '$Location'..." -ForegroundColor Cyan
az group create --name $ResourceGroup --location $Location --output none

$templateFile = Join-Path $PSScriptRoot 'main.bicep'
$deploymentName = "agentmon-$(Get-Date -Format 'yyyyMMddHHmmss')"

Write-Host "==> Running deployment '$deploymentName'..." -ForegroundColor Cyan
$outputJson = az deployment group create `
  --name $deploymentName `
  --resource-group $ResourceGroup `
  --template-file $templateFile `
  --parameters namePrefix=$NamePrefix location=$Location jwtSecret=$JwtSecret `
  --query 'properties.outputs' `
  --output json

if ($LASTEXITCODE -ne 0) {
  throw "Deployment failed. See az CLI output above for details."
}

$outputs = $outputJson | ConvertFrom-Json

Write-Host "`n==> Deployment succeeded!" -ForegroundColor Green
Write-Host "    Web App Name : $($outputs.webAppName.value)"
Write-Host "    Web App URL  : $($outputs.webAppUrl.value)"
Write-Host "    Cosmos Endpoint: $($outputs.cosmosEndpoint.value)"
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  1. Configure the AZURE_WEBAPP_NAME repo variable and AZURE_WEBAPP_PUBLISH_PROFILE secret"
Write-Host "     in GitHub Actions using the publish profile for '$($outputs.webAppName.value)'."
Write-Host "  2. Push to main to trigger .github/workflows/deploy.yml."
