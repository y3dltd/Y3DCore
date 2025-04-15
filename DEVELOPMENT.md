# Development Guide

This document provides guidelines and best practices for developing and maintaining the Y3DHub application.

## Code Organization

The application follows a standard Next.js App Router structure:

```
src/
├── app/                # Next.js App Router directory
│   ├── api/            # API Route Handlers
│   ├── orders/         # Orders pages
│   ├── print-queue/    # Print queue pages
│   └── ...
├── components/         # React components
│   ├── ui/             # UI components (shadcn/ui)
│   └── ...
├── lib/                # Core libraries and utilities
│   ├── actions/        # Server actions
│   ├── shipstation/    # ShipStation API integration
│   └── ...
└── scripts/           # Utility scripts
```

## Development Workflow

1. **Environment Setup**:
   - Copy `.env.example` to `.env` and fill in the required values
   - Run `npm install` to install dependencies
   - Run `npx prisma generate` to generate Prisma client

2. **Development Server**:
   - Run `npm run dev` to start the development server
   - Access the application at http://localhost:3000

3. **Building for Production**:
   - Run `npm run build` to build the application
   - Run `npm start` to start the production server

## Best Practices

### Database Access

- Use the singleton Prisma client from `src/lib/prisma.ts`
- Use transactions for operations that modify multiple records
- Set appropriate timeout values for long-running operations
- Always disconnect from the database in scripts using `finally` blocks

```typescript
try {
  // Database operations
} catch (error) {
  console.error('Error:', error);
} finally {
  await prisma.$disconnect();
}
```

### Error Handling

- Use the centralized error handling utilities in `src/lib/errors.ts`
- Always use `handleApiError` in API routes to ensure consistent error responses
- Log errors with appropriate context information

```typescript
try {
  // API logic
} catch (error) {
  console.error('Error context:', error);
  return handleApiError(error);
}
```

### Security

- Never hardcode credentials in the codebase
- Use environment variables for all sensitive information
- Validate user input using Zod schemas
- Implement proper authentication checks in API routes

### Performance

- Use pagination for large data sets
- Implement caching where appropriate
- Optimize database queries with proper indexes
- Use server components where possible to reduce client-side JavaScript

### Testing

- Write unit tests for critical functionality
- Test API endpoints with different input scenarios
- Verify error handling works as expected

## Common Tasks

### Adding a New API Endpoint

1. Create a new file in `src/app/api/` following the Next.js App Router conventions
2. Import the necessary dependencies
3. Implement the request handlers (GET, POST, etc.)
4. Use proper error handling with `handleApiError`
5. Document the endpoint with JSDoc comments

### Adding a New Component

1. Create a new file in `src/components/`
2. Use TypeScript interfaces for props
3. Follow the existing component patterns
4. Add appropriate comments for complex logic

### Working with the Database

1. Update the schema in `prisma/schema.prisma` if needed
2. Run `npx prisma migrate dev --name <migration_name>` to create a migration
3. Run `npx prisma generate` to update the Prisma client
4. Use the Prisma client from `src/lib/prisma.ts` in your code

### Adding a New Script

1. Create a new file in the appropriate subdirectory of `scripts/`
2. Add a header comment explaining the purpose and usage
3. Implement proper error handling and database disconnection
4. Update the `scripts/README.md` file if necessary
