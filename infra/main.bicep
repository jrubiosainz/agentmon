// Agéntmon backend infrastructure.
//
// Provisions:
//   - A serverless Azure Cosmos DB (NoSQL/SQL API) account, database, and
//     the `users` / `saves` containers used by server/src/db/cosmos.ts
//   - A Linux App Service Plan (B1) + Web App running Node 22 LTS, hosting
//     the built Express server (which also serves the built client SPA)
//   - Application Insights wired into the Web App via a connection string
//   - A VNet, a private endpoint + private DNS zone for Cosmos, and regional
//     VNet integration for the Web App, so the database is never exposed to
//     the public internet
//   - A system-assigned managed identity on the Web App holding the Cosmos DB
//     Built-in Data Contributor role, so no shared keys are stored anywhere
//
// Deploy with infra/deploy.ps1, which creates the resource group and runs
// `az deployment group create` with this template.
targetScope = 'resourceGroup'

@description('Short prefix used to build resource names (letters/numbers only, lowercase).')
@minLength(2)
@maxLength(16)
param namePrefix string = 'agentmon'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Secret used to sign/verify JWTs. Provide a strong random value in production.')
@secure()
param jwtSecret string

@description('Name of the Cosmos DB SQL database used by the app.')
param cosmosDatabaseName string = 'agentmon'

@description('App Service Plan SKU name.')
param appServicePlanSku string = 'B1'

@description('Node.js runtime version for the Web App.')
param nodeVersion string = '22-lts'

@description('Address space for the application VNet.')
param vnetAddressPrefix string = '10.20.0.0/16'

@description('Globally unique Web App name; becomes https://<name>.azurewebsites.net.')
@minLength(2)
@maxLength(60)
param webAppName string = namePrefix

var uniqueSuffix = uniqueString(resourceGroup().id)
// Cosmos account names must be lowercase, alphanumeric + hyphens, <= 44 chars.
var cosmosAccountName = toLower('${namePrefix}-cosmos-${uniqueSuffix}')
var appServicePlanName = '${namePrefix}-plan-${uniqueSuffix}'
var appInsightsName = '${namePrefix}-ai-${uniqueSuffix}'
var vnetName = '${namePrefix}-vnet'
var cosmosDnsZoneName = 'privatelink.documents.azure.com'
// Built-in "Cosmos DB Built-in Data Contributor" data-plane role.
var cosmosDataContributorRoleId = '00000000-0000-0000-0000-000000000002'

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: vnetName
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [vnetAddressPrefix]
    }
    subnets: [
      {
        name: 'snet-app'
        properties: {
          addressPrefix: cidrSubnet(vnetAddressPrefix, 24, 1)
          delegations: [
            {
              name: 'appservice'
              properties: {
                serviceName: 'Microsoft.Web/serverFarms'
              }
            }
          ]
        }
      }
      {
        name: 'snet-pe'
        properties: {
          addressPrefix: cidrSubnet(vnetAddressPrefix, 24, 2)
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

resource appSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' existing = {
  parent: vnet
  name: 'snet-app'
}

resource peSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' existing = {
  parent: vnet
  name: 'snet-pe'
}

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-08-15' = {
  name: cosmosAccountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    // Reached exclusively through the private endpoint below, using Entra ID.
    publicNetworkAccess: 'Disabled'
    disableLocalAuth: true
    enableAutomaticFailover: true
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-08-15' = {
  parent: cosmosAccount
  name: cosmosDatabaseName
  properties: {
    resource: {
      id: cosmosDatabaseName
    }
  }
}

resource usersContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  parent: cosmosDatabase
  name: 'users'
  properties: {
    resource: {
      id: 'users'
      partitionKey: {
        paths: ['/id']
        kind: 'Hash'
      }
      uniqueKeyPolicy: {
        uniqueKeys: [
          {
            paths: ['/emailLower']
          }
        ]
      }
    }
  }
}

resource savesContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  parent: cosmosDatabase
  name: 'saves'
  properties: {
    resource: {
      id: 'saves'
      partitionKey: {
        paths: ['/userId']
        kind: 'Hash'
      }
    }
  }
}

resource cosmosPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  // Fixed names: a VNet may only be linked to a private DNS zone once, so
  // deriving these from the unique suffix would make the template create
  // duplicates and fail on any redeploy.
  name: 'pe-${namePrefix}-cosmos'
  location: location
  properties: {
    subnet: {
      id: peSubnet.id
    }
    privateLinkServiceConnections: [
      {
        name: 'cosmos-conn'
        properties: {
          privateLinkServiceId: cosmosAccount.id
          groupIds: ['Sql']
        }
      }
    ]
  }
}

resource cosmosDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: cosmosDnsZoneName
  location: 'global'
}

resource cosmosDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: cosmosDnsZone
  name: 'link-${namePrefix}'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

resource cosmosDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: cosmosPrivateEndpoint
  name: 'zg'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'cosmos'
        properties: {
          privateDnsZoneId: cosmosDnsZone.id
        }
      }
    ]
  }
  dependsOn: [cosmosDnsLink]
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    Flow_Type: 'Bluefield'
    Request_Source: 'rest'
  }
}

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  kind: 'linux'
  sku: {
    name: appServicePlanSku
  }
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    virtualNetworkSubnetId: appSubnet.id
    siteConfig: {
      linuxFxVersion: 'NODE|${nodeVersion}'
      alwaysOn: true
      appCommandLine: 'node server/dist/index.js'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      vnetRouteAllEnabled: true
      appSettings: [
        {
          name: 'COSMOS_ENDPOINT'
          value: cosmosAccount.properties.documentEndpoint
        }
        {
          name: 'COSMOS_DATABASE'
          value: cosmosDatabaseName
        }
        {
          name: 'JWT_SECRET'
          value: jwtSecret
        }
        {
          name: 'ALLOWED_ORIGINS'
          value: 'https://${webAppName}.azurewebsites.net'
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~22'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'WEBSITES_PORT'
          value: '8080'
        }
      ]
    }
  }
}

// Data-plane RBAC: let the Web App's managed identity read/write documents.
// Note this grants no control-plane rights, which is why CosmosStore falls back
// to binding to the containers created above instead of creating them.
resource cosmosDataRole 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-08-15' = {
  parent: cosmosAccount
  name: guid(cosmosAccount.id, webApp.id, cosmosDataContributorRoleId)
  properties: {
    principalId: webApp.identity.principalId
    roleDefinitionId: '${cosmosAccount.id}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    scope: cosmosAccount.id
  }
}

output webAppName string = webApp.name
output webAppUrl string = 'https://${webApp.properties.defaultHostName}'
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
