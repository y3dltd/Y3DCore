# Y3DHub Linting Guide

This guide outlines our approach to code quality for the Y3DHub project.

## Current Approach

We've implemented a balanced approach to linting that allows builds to succeed while maintaining code quality standards:

1. **Build without linting**: Our main build process skips linting to ensure successful deployments
   ```json
   "build": "NEXT_TELEMETRY_DISABLED=1 next build --no-lint"
   ```

2. **Tiered linting rules**:
   - Core application code has stricter linting
   - Script files have relaxed rules (no return type requirements)

3. **Available lint commands**:
   - `npm run lint` - Basic linting
   - `npm run lint:full` - Full linting across all source code
   - `npm run lint:fix` - Attempt to automatically fix issues

## Recommended Workflow

1. **Before committing code**:
   - Run `npm run lint` to catch major issues
   - Address any errors (red) immediately
   - Consider fixing warnings (yellow) when time permits

2. **Fixing common issues**:

   a) **Missing return types** (in application code):
   ```typescript
   // Before
   export async function getData() {
     // ...
   }

   // After
   export async function getData(): Promise<SomeType> {
     // ...
   }
   ```

   b) **Named imports from packages with default exports**:
   ```typescript
   // Before
   import pino from 'pino';
   const logger = pino();
   const streams = pino.multistream([...]);

   // After
   import pino, { multistream } from 'pino';
   const logger = pino();
   const streams = multistream([...]);
   ```

   c) **Line-specific disabling** (when necessary):
   ```typescript
   // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
   export async function complexFunction() {
     // Complex function where return type is difficult to express
   }
   ```

## Future Improvements

As the codebase matures, consider:

1. Re-enabling linting in the build process
2. Adding pre-commit hooks with husky for lint checks
3. Gradually upgrading warnings to errors for critical code quality issues

## Path Aliases

Remember that our codebase supports two formats of path aliases:
- `@components/...` - Standard format
- `@/components/...` - Alternative format (both work)

## Custom Dictionary

We maintain a custom dictionary in `.vscode/settings.json` for technical terms like "shipstation" and "shadcn". Add new terms there if you're getting spell-check warnings.
