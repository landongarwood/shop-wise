'use strict';

const path = require('node:path');

const defaultConfig = require('./config');
const defaultLogger = require('./log');

const { SystemClock } = require('./shared/clock');
const { UuidIds } = require('./shared/ids');

const { JsonDocumentStore } = require('./persistence/json-document-store');
const { BackupService } = require('./persistence/backup-service');
const { CollectionRepository } = require('./persistence/collection-repository');
const { COLLECTIONS } = require('./persistence/document-schema');

const { SettingsService } = require('./domain/settings-service');
const { CatalogService } = require('./domain/catalog-service');
const { CustomerService } = require('./domain/customer-service');
const { InventoryService } = require('./domain/inventory-service');
const { SalesService } = require('./domain/sales-service');
const { LedgerService } = require('./domain/ledger-service');
const { OverviewService } = require('./domain/overview-service');
const { ReportsService } = require('./domain/reports-service');

const { Router } = require('./http/router');
const { registerRoutes } = require('./http/routes');
const { StaticFileHandler } = require('./http/static-files');
const { SessionToken } = require('./http/session-token');
const { HttpServer } = require('./http/server');
const { DevReloadChannel } = require('./http/dev-reload');

/**
 * The composition root: the one place that knows which concrete thing fills
 * each dependency.
 *
 * Everything else receives what it needs through its constructor, so a test can
 * build a service over a fake repository and a fixed clock, and swapping the
 * JSON store for a database touches only this file.
 */
function createContainer({
  config = defaultConfig,
  logger = defaultLogger,
  clock = new SystemClock(),
  ids = new UuidIds(),
  store = null,
} = {}) {
  const dataFile = path.join(config.dataDir, 'shop.json');

  const documentStore =
    store ??
    new JsonDocumentStore({
      filePath: dataFile,
      logger,
      backups: new BackupService({
        sourceFile: dataFile,
        backupDir: config.backupDir,
        clock,
        logger,
      }),
    });

  const repositories = {
    products: repository(documentStore, COLLECTIONS.products, 'product'),
    customers: repository(documentStore, COLLECTIONS.customers, 'customer'),
    stockEntries: repository(documentStore, COLLECTIONS.stockEntries, 'stock entry'),
    sales: repository(documentStore, COLLECTIONS.sales, 'sale'),
    payments: repository(documentStore, COLLECTIONS.payments, 'payment'),
  };

  const settings = new SettingsService({ store: documentStore, clock });

  const catalog = new CatalogService({ products: repositories.products, clock, ids });

  const customers = new CustomerService({ customers: repositories.customers, clock, ids });

  const inventory = new InventoryService({
    stockEntries: repositories.stockEntries,
    saleReader: repositories.sales,
    catalog,
    settings,
    clock,
    ids,
  });

  const sales = new SalesService({
    sales: repositories.sales,
    catalog,
    customers,
    inventory,
    clock,
    ids,
  });

  const ledger = new LedgerService({
    payments: repositories.payments,
    saleReader: repositories.sales,
    customers,
    clock,
    ids,
  });

  const overview = new OverviewService({
    saleReader: repositories.sales,
    paymentReader: repositories.payments,
    inventory,
    ledger,
    catalog,
    customers,
    settings,
    clock,
  });

  const reports = new ReportsService({
    saleReader: repositories.sales,
    paymentReader: repositories.payments,
    clock,
  });

  const services = {
    config,
    store: documentStore,
    settings,
    catalog,
    customers,
    inventory,
    sales,
    ledger,
    overview,
    reports,
  };

  const sessionToken = new SessionToken();

  // Live reload exists only when started with --dev, so the installed app
  // never opens the endpoint at all.
  const devChannel = config.dev ? new DevReloadChannel({ logger }) : null;

  const server = new HttpServer({
    router: registerRoutes(new Router(), services),
    staticFiles: new StaticFileHandler({
      rootDir: config.uiDir,
      templateValues: () => ({
        SESSION_TOKEN: sessionToken.value,
        PRODUCT_NAME: config.productName,
        VERSION: config.version,
        DEV: String(config.dev),
      }),
    }),
    sessionToken,
    devChannel,
    logger,
    host: config.host,
    port: config.port,
  });

  return { config, logger, clock, ids, store: documentStore, repositories, services, sessionToken, devChannel, server };
}

const repository = (store, collection, label) => new CollectionRepository({ store, collection, label });

module.exports = { createContainer };
