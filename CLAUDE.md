# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Y3DHub is a modern Next.js application for managing 3D printing tasks and orders, featuring integrations with ShipStation API, OpenAI-powered text extraction, and comprehensive task management for 3D printing businesses.

## Key Technologies

- **Frontend**: Next.js 14 (App Router), React 18, NextUI, TailwindCSS
- **Backend**: Next.js API Routes
- **Database**: MySQL with Prisma ORM
- **Integrations**: ShipStation API, OpenAI API
- **Rendering**: OpenSCAD for 3D model generation
- **Authentication**: NextAuth.js

## Environment Setup

Before running any commands, ensure you have the following prerequisites:
- Node.js 18+ and npm
- MySQL Database
- OpenSCAD (for STL rendering)
- ShipStation API credentials
- OpenAI API key

Copy `.env.example` to `.env` and fill in the required values:
```bash
cp .env.example .env
# Edit .env with your database, ShipStation, and OpenAI credentials
```

## Common Commands

### Development

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Start development server (runs on http://localhost:3000)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### Database Operations

```bash
# Generate Prisma client (after schema changes)
npm run db:generate

# Create database migrations
npm run db:migrate

# Reset database (caution: destroys data)
npm run db:reset

# Run Prisma Studio (database UI)
npm run db:studio

# Seed initial data
npm run db:seed
```

### STL Rendering Worker

```bash
# Start the STL rendering worker
npm run worker:stl

# Refresh all pending STL tasks
npm run worker:stlrefresh
```

### Core Workflows

```bash
# Sync recent orders from ShipStation
npm run sync-orders

# Generate print tasks from synced orders
npm run populate-queue

# Complete tasks for shipped orders
npm run cleanup-print-tasks

# Run the complete workflow (sync orders, populate queue, cleanup)
npm run full-workflow
```

### Maintenance and Utilities

```bash
# Linting
npm run lint          # Basic linting
npm run lint:full     # Full linting across all source code
npm run lint:fix      # Attempt to fix issues automatically

# Type checking
npm run type-check

# Clean temporary files
npm run clean
npm run clean:all     # Deep clean including node_modules
```

## Architecture and Code Structure

### High-Level Architecture

1. **Order Synchronization Process**:
   - The system syncs orders from ShipStation API (`src/lib/shipstation`)
   - Orders are stored in the database with customer details
   - Customization text is extracted using AI from order data

2. **Print Task Workflow**:
   - Orders are processed to create print tasks
   - Tasks move through states: pending → in progress → completed
   - STL files are generated for 3D printing using OpenSCAD

3. **STL Rendering Process**:
   - A worker process (`src/workers/stl-render-worker.ts`) generates STL files
   - Rendering is done using OpenSCAD templates at `openscad/`
   - Rendered files are stored in the public directory

4. **UI and Dashboard**:
   - Web interface shows orders, print tasks, and status
   - Print queue management interface for operators
   - Authentication protects access to the system

### Core File Structure

- `src/app/` - Next.js App Router pages and API routes
- `src/components/` - React components
- `src/lib/` - Core libraries, API clients, and business logic
- `src/scripts/` - Utility scripts and automation
- `src/workers/` - Background processing workers
- `prisma/` - Database schema and migrations
- `openscad/` - OpenSCAD templates for STL generation

## Important Files to Understand

- `src/lib/prisma.ts` - Singleton Prisma client
- `src/lib/shipstation/` - ShipStation API integration
- `src/lib/ai/` - AI/OpenAI integration for text extraction
- `src/scripts/populate-print-queue.ts` - Print task generation
- `src/scripts/sync-orders.ts` - Order synchronization from ShipStation
- `src/workers/stl-render-worker.ts` - STL generation worker
- `scripts/workflow.sh` - Main workflow automation script

## Common Development Patterns

### Database Access

- Use the singleton Prisma client from `src/lib/prisma.ts`
- Use transactions for operations modifying multiple records
- Always disconnect from the database in scripts with `finally` blocks

```typescript
try {
  // Database operations
} catch (error) {
  console.error("Error:", error);
} finally {
  await prisma.$disconnect();
}
```

### Error Handling

- Use centralized error handling in `src/lib/errors.ts`
- Use `handleApiError` in API routes for consistent responses

### Timezone Handling

- The database stores timestamps in **UTC**
- ShipStation operates in **Pacific Time**
- Use utility functions from `src/lib/shared/date-utils.ts` for date formatting

## Working with ShipStation

ShipStation integration requires:

1. Fetching the complete order details before making updates
2. Sending a full payload with your modifications when updating
3. Proper handling of order IDs and keys

See `src/lib/shipstation/api.ts` for implementation details.

## Adding New STL Models

When adding new product types for STL rendering:

1. Add the SKU to the supported list in `src/workers/stl-render-worker.ts`
2. Create an OpenSCAD template in the `openscad/` directory
3. Add a rendering function in `src/lib/openscad/index.ts`
4. Implement the rendering logic in the worker