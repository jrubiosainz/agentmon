// Agéntmon backend infrastructure.
//
// Provisions:
//   - A serverless Azure Cosmos DB (NoSQL/SQL API) account, database, and
//     the `users` / `saves` containers used by server/src/db/cosmos.ts
//   - A Linux App Service Plan (B1) + Web App running Node 22 LTS, hosting
//     the built Express server (which also serves the built client SPA)
//   - Application Insights wired into the Web App via a connection string
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

var uniqueSuffix = uniqueString(resourceGroup().id)
// Cosmos account names must be lowercase, alphanumeric + hyphens, <= 44 chars.
var cosmosAccountName = toLower('${namePrefix}-cosmos-${uniqueSuffix}')
var appServicePlanName = '${namePrefix}-plan-${uniqueSuffix}'
var webAppName = '${namePrefix}-web-${uniqueSuffix}'
var appInsightsName = '${namePrefix}-ai-${uniqueSuffix}'

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
    publicNetworkAccess: 'Enabled'
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
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|${nodeVersion}'
      alwaysOn: true
      appCommandLine: 'node server/dist/index.js'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: [
        {
          name: 'COSMOS_ENDPOINT'
          value: cosmosAccount.properties.documentEndpoint
        }
        {
          name: 'COSMOS_KEY'
          value: cosmosAccount.listKeys().primaryMasterKey
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

output webAppName string = webApp.name
output webAppUrl string = 'https://${webApp.properties.defaultHostName}'
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
