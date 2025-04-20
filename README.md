# Y3DHub

Y3DHub is a modern Next.js application for managing 3D printing tasks and orders, featuring integrations with ShipStation API, OpenAI-powered text extraction, and comprehensive task management for 3D printing businesses.

## Features

- **Order Management**: Synchronize and manage orders from ShipStation
- **Print Task Workflow**: Track tasks through pending → in progress → completed states
- **STL Rendering**: Automated STL file generation for personalized products
- **AI-powered Text Extraction**: Extract personalization text using OpenAI
- **Product Mapping**: Normalize product names across marketplaces
- **Multi-marketplace Support**: Amazon, Etsy, eBay integrations
- **Task Review System**: Review and approve uncertain extractions

## Technology Stack

- **Frontend**: Next.js 14 (App Router), React 18, NextUI, TailwindCSS
- **Backend**: Next.js API Routes
- **Database**: MySQL with Prisma ORM
- **Integrations**: ShipStation API, OpenAI API
- **Rendering**: OpenSCAD for 3D model generation
- **Authentication**: NextAuth.js

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- MySQL Database
- OpenSCAD (for STL rendering)
- ShipStation API credentials
- OpenAI API key

### Installation

1. Clone the repository

   ```bash
   git clone https://github.com/y3dltd/Y3DCore.git
   cd y3dhub
   ```

2. Install dependencies

   ```bash
   npm install
   ```

3. Set up environment variables

   ```bash
   cp .env.example .env
   # Edit .env with your database, ShipStation, and OpenAI credentials
   ```

4. Generate Prisma client

   ```bash
   npx prisma generate
   ```

5. Run database migrations

   ```bash
   npx prisma migrate dev
   ```

6. Start the development server
   ```bash
   npm run dev
   ```

## Project Structure

```
y3dhub/
├── src/                       # Main source code
│   ├── app/                   # Next.js App Router pages and API routes
│   │   ├── api/               # API routes for orders, tasks, etc.
│   │   ├── orders/            # Order management pages
│   │   └── print-queue/       # Print task management pages
│   ├── components/            # React components
│   ├── lib/                   # Shared libraries
│   │   ├── db/                # Database utilities (Prisma)
│   │   ├── shipstation/       # ShipStation integration
│   │   ├── ai/                # AI/OpenAI integration
│   │   └── openscad/          # OpenSCAD integration for STL rendering
│   ├── scripts/               # Backend scripts for task management
│   │   ├── sync-orders.ts     # Order synchronization from ShipStation
│   │   ├── populate-print-queue.ts # Print task generation
│   │   └── complete-shipped-print-tasks.ts # Update shipped order tasks
│   ├── types/                 # TypeScript type definitions
│   └── workers/               # Background workers
│       └── stl-render-worker.ts # STL generation worker
├── prisma/                    # Prisma schema and migrations
├── scripts/                   # System automation scripts
│   └── workflow.sh            # Main workflow automation script
├── openscad/                  # OpenSCAD models and scripts
├── docs/                      # Documentation
└── public/                    # Static assets and rendered STL files
```

## Core Workflows

### 1. Order Synchronization

The system synchronizes orders from ShipStation and creates print tasks:

```bash
# Sync recent orders from ShipStation
npx tsx src/scripts/sync-orders.ts --recent

# Generate print tasks from synced orders
npx tsx src/scripts/populate-print-queue.ts
```

### 2. STL Rendering Worker

The STL rendering worker processes pending tasks and generates 3D models:

```bash
# Start the STL rendering worker
npm run worker:stl
```

### 3. Task Status Management

Complete tasks for shipped orders:

```bash
# Mark tasks as completed when orders are shipped
npx tsx src/scripts/complete-shipped-print-tasks.ts
```

### 4. Automated Workflow

The entire process can be automated using the workflow script:

```bash
# Run the complete workflow
./scripts/workflow.sh
```

## Deployment

The application is deployed to Netlify. Changes pushed to the main branch trigger automatic deployments.

```bash
# Manual deployment
npx netlify deploy --prod
```

## Documentation

Detailed documentation is available in the `/docs` directory:

- Development guides
- API reference
- Database schema
- Integration details
- Troubleshooting tips

## License

[Proprietary] © 2025 Yorkshire3D Limited. All rights reserved.
