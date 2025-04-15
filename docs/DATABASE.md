# Database Schema and Standards

This document describes the Y3DHub database schema, conventions, and standards.

## Schema

- The database schema is defined in `prisma/schema.prisma`.
- Migrations are managed using Prisma Migrate.

## Key Models

- `Order`: Represents customer orders from various marketplaces.
- `OrderItem`: Represents individual items within an order.
- `AmazonCustomization`: Stores Amazon personalization data.
- `PrintTask`: Represents tasks for the printing process.
- `Product`: Stores product information.
- `ScriptRunLog`: Logs the execution of scripts.

[Add details about important relations and fields.]

## Naming Conventions

- Models: PascalCase (e.g., `OrderItem`)
- Fields: camelCase (e.g., `orderNumber`)
- Enums: PascalCase (e.g., `OrderStatus`)
- Relations: Use descriptive names (e.g., `orderItems` on `Order`)

## Timestamp Handling

- All timestamps are stored in UTC.
- See `docs/timezone-handling.md` for details.

## Data Integrity

- Use appropriate constraints (unique, foreign keys).
- Implement validation logic in the application layer.
