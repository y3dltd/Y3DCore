# ---
# title: IDE Guidelines
# last-reviewed: 2025-04-18
# maintainer: TBD
# ---

# Y3DHub IDE Guidelines for Refactoring Project

## Table of Contents

1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Import Standards](#import-standards)
4. [TypeScript Guidelines](#typescript-guidelines)
5. [File Conventions](#file-conventions)
6. [Script Development](#script-development)
7. [Documentation Standards](#documentation-standards)
8. [Error Handling](#error-handling)
9. [Shared Module Usage](#shared-module-usage)
10. [Database Practices](#database-practices)
11. [VS Code Configuration](#vs-code-configuration)

## Introduction

This document provides specific guidelines for the Y3DHub refactoring project, focusing on the script consolidation and reorganization outlined in TODO_V3_UPDATED.md. Following these standards will ensure consistency across the codebase and simplify merging and reviewing changes.

## Project Structure

Maintain the following directory structure for the refactored code:

```
src/
├── lib/
│   ├── orders/
│   │   ├── amazon/
│   │   │   ├── customization.ts
│   │   │   ├── sync.ts
│   │   │   ├── update.ts
│   │   │   ├── fix.ts
│   │   │   ├── workflow.ts
│   │   │   └── metrics.ts
│   │   ├── sync.ts
│   │   ├── mappers.ts
│   │   ├── metrics.ts
│   │   └── status.ts
│   ├── print-tasks/
│   │   ├── create.ts
│   │   ├── update.ts
│   │   ├── cleanup.ts
│   │   ├── metrics.ts
│   │   └── status.ts
│   ├── utils/
│   │   ├── check.ts
│   │   ├── fix.ts
│   │   ├── backup.ts
│   │   └── stats.ts
│   ├── shared/
│   │   ├── shipstation.ts
│   │   ├── database.ts
│   │   ├── logging.ts
│   │   ├── metrics.ts
│   │   └── date-utils.ts
│   └── prisma.ts
└── scripts/
    ├── order-sync.ts
    ├── print-tasks.ts
    └── utils.ts
```

## Import Standards

1. **Absolute Imports**: Use the `@/` prefix for all internal imports:

```typescript
// Correct
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/shared/logging";

// Incorrect
import { prisma } from "../../lib/prisma";
import { logger } from "../shared/logging";
```

2. **Import Order**: Follow this order for imports:

```typescript
// 1. Node.js built-in modules
import fs from "fs";
import path from "path";

// 2. External libraries
import { Command } from "commander";
import { PrismaClient } from "@prisma/client";

// 3. Internal modules (using absolute paths)
import { logger } from "@/lib/shared/logging";
import { prisma } from "@/lib/prisma";
import { syncOrders } from "@/lib/orders/sync";

// 4. Type imports
import type { OrderSyncOptions } from "@/lib/orders/types";
```

3. **No Circular Dependencies**: Avoid circular dependencies between modules.

## TypeScript Guidelines

1. **Explicit Types**: Always provide explicit return types for functions, especially exported ones:

```typescript
// Correct
export async function syncOrders(
  options: OrderSyncOptions
): Promise<SyncResult> {
  // Implementation
}

// Incorrect
export async function syncOrders(options) {
  // Implementation
}
```

2. **Interface vs Type**: Use interfaces for objects that will be extended or implemented, and types for unions, intersections, or simple object shapes:

```typescript
// Interface for extendable objects
interface OrderSyncOptions {
  daysBack?: number;
  orderId?: number;
  dryRun?: boolean;
}

// Type for unions or simple shapes
type SyncMode = "all" | "recent" | "single";
```

3. **Snake Case for Database Fields**: Use snake_case for database field names to match the schema:

```typescript
const orderData = {
  shipstation_order_id: "12345",
  created_at: new Date(),
  customer_id: customerId,
};
```

4. **Use Proper Prisma Types**: Use the correct Prisma input types:

```typescript
import { Prisma } from "@prisma/client";

const orderData: Prisma.OrderCreateInput = {
  shipstation_order_id: "12345",
  created_at: new Date(),
  customer: { connect: { id: customerId } },
};
```

## File Conventions

1. **File Naming**: Use kebab-case for filenames:

```
order-sync.ts
print-tasks.ts
date-utils.ts
```

2. **Executable Scripts**: Add shebang and make executable:

```typescript
#!/usr/bin/env tsx
/**
 * Script: order-sync.ts
 * Description: Synchronizes orders from ShipStation
 */
```

3. **JSDoc Comments**: Add JSDoc comments for all exported functions, classes, and types:

```typescript
/**
 * Synchronizes orders from ShipStation to the local database
 *
 * @param options - Configuration options for the sync process
 * @returns A promise that resolves to the sync results
 */
export async function syncOrders(
  options: OrderSyncOptions
): Promise<SyncResult> {
  // Implementation
}
```

## Script Development

1. **Command Pattern**: Use the Commander.js library for CLI argument parsing:

```typescript
import { Command } from "commander";

const program = new Command();

program
  .name("order-sync")
  .description("Synchronize orders from ShipStation")
  .version("1.0.0");

program
  .command("all")
  .description("Sync all orders")
  .option("--days-back <days>", "Number of days to look back", "7")
  .action(async (options) => {
    // Command implementation
  });

program.parse(process.argv);
```

2. **Error Handling**: Implement proper error handling and database disconnection:

```typescript
try {
  // Script implementation
} catch (error) {
  logger.error("Error syncing orders:", { error });
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
```

3. **Metrics Collection**: Include metrics collection in all scripts:

```typescript
const startTime = Date.now();
const metrics = createMetricsCollector();

// Script implementation

metrics.recordDuration(Date.now() - startTime);
await metrics.saveMetrics();
```

## Documentation Standards

1. **JSDoc Documentation**: Use JSDoc comments for all exported functions, classes, and types.

2. **Module Documentation**: Add a comment at the top of each file describing its purpose:

```typescript
/**
 * Shipstation API Integration
 *
 * This module provides functions for interacting with the ShipStation API,
 * including order retrieval, update, and status management.
 */
```

3. **Function Documentation**: Document function parameters, return values, and exceptions:

```typescript
/**
 * Retrieves orders from ShipStation API
 *
 * @param options - Options for retrieving orders
 * @param options.daysBack - Number of days to look back for orders
 * @param options.pageSize - Number of orders to retrieve per page
 * @returns A promise that resolves to an array of ShipStation orders
 * @throws {ApiError} If the API request fails
 */
```

## Error Handling

1. **Structured Error Handling**: Use try/catch blocks with appropriate error logging:

```typescript
try {
  await syncOrders(options);
} catch (error) {
  if (error instanceof ApiError) {
    logger.error("API Error:", {
      message: error.message,
      status: error.status,
      details: error.details,
    });
  } else {
    logger.error("Unexpected error:", { error });
  }
  throw error; // Rethrow for higher-level handling
}
```

2. **Custom Error Classes**: Define and use custom error classes for different error types:

```typescript
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: any
  ) {
    super(message);
    this.name = "ApiError";
  }
}
```

3. **Transaction Rollback**: Ensure proper transaction rollback in case of errors:

```typescript
await prisma.$transaction(async (tx) => {
  try {
    // Transaction operations
  } catch (error) {
    // Transaction will automatically roll back
    logger.error("Transaction error:", { error });
    throw error;
  }
});
```

## Shared Module Usage

1. **Database Module**: Use the shared database module for all database operations:

```typescript
import { withTransaction } from "@/lib/shared/database";

await withTransaction(async (tx) => {
  // Transaction operations using tx instead of prisma
});
```

2. **Logging Module**: Use the shared logging module for all logging:

```typescript
import { logger } from "@/lib/shared/logging";

logger.info("Starting order sync", { options });
logger.error("Error syncing orders", { error });
```

3. **Metrics Module**: Use the shared metrics module for all metrics collection:

```typescript
import { recordMetric } from "@/lib/shared/metrics";

await recordMetric("orders_synced", ordersProcessed);
```

## Database Practices

1. **Transactions**: Use transactions for operations that modify multiple records:

```typescript
await prisma.$transaction(async (tx) => {
  const order = await tx.order.create({ data: orderData });
  await tx.orderItem.createMany({
    data: items.map((item) => ({ ...item, orderId: order.id })),
  });
  return order;
});
```

2. **Batch Operations**: Use batch operations when possible:

```typescript
await prisma.orderItem.createMany({
  data: items.map((item) => ({ ...item, orderId: orderId })),
  skipDuplicates: true,
});
```

3. **Field Names**: Use the exact field names from the Prisma schema:

```typescript
// Correct
const order = await prisma.order.create({
  data: {
    shipstation_order_id: "12345",
    created_at: new Date(),
  },
});

// Incorrect
const order = await prisma.order.create({
  data: {
    shipstationOrderId: "12345", // Wrong: should be snake_case
    createdAt: new Date(), // Wrong: should be snake_case
  },
});
```

## VS Code Configuration

Configure VS Code to streamline development:

1. **Settings**: Create or update `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact"
  ],
  "files.exclude": {
    "**/.git": true,
    "**/.DS_Store": true,
    "**/node_modules": true,
    "**/.next": true
  }
}
```

2. **Extensions**: Recommended VS Code extensions:

- ESLint
- Prettier
- Prisma
- TypeScript Import Sorter
- Error Lens
- GitLens
- Todo Tree

## Summary Checklist

When working on the refactoring project, check that your code:

- [ ] Follows the directory structure outlined in this document
- [ ] Uses absolute imports with the `@/` prefix
- [ ] Includes proper TypeScript types for all functions and variables
- [ ] Uses snake_case for database field names
- [ ] Follows file naming conventions
- [ ] Includes JSDoc comments for all exported functions
- [ ] Implements proper error handling
- [ ] Uses shared modules for database, logging, and metrics
- [ ] Uses transactions for operations that modify multiple records
- [ ] Is formatted according to the project's style guide
