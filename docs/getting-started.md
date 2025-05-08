---
title: Getting Started
last-reviewed: 2025-04-18
maintainer: TBD
---

# Getting Started

> A quick walkthrough to get Y3DHub up and running locally.

> **NOTE:** For a more detailed development workflow, see [Development Guide](guides/development.md).

> **Prerequisites:** Node.js 18.x, npm >=9, MySQL 8.x (local or Docker), Git 2.40+.

>## 1. Clone and Install

>```bash
>git clone https://github.com/your-org/y3dhub.git
>cd y3dhub
>npm install
>```

>## 2. Configure Environment

>```bash
>cp .env.example .env
># Edit .env to add your credentials (database, ShipStation, AWS, etc.)
>```

>## 3. Database Setup

>```bash
>npx prisma migrate dev --name init
>npx prisma generate
>```

>## 4. Run in Development

>```bash
>npm run dev
>```

>Open your browser at <http://localhost:3000>.

>## 5. Next Steps

>- Review other documentation sections (Guides, Reference, Integrations).
>- Start exploring the code in `src/`.
