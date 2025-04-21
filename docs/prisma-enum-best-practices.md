# Prisma Enum Best Practices

## Overview

This document outlines best practices for working with enum fields in Prisma to avoid common issues like the one encountered with the `StlRenderStatus` enum in the `PrintOrderTask` table.

## Common Issues with Enum Fields

1. **Invalid Values**: Storing values that are not defined in the enum
2. **Empty Strings**: Attempting to store empty strings in enum fields
3. **Null Values**: Confusion about whether null is allowed for enum fields
4. **Case Sensitivity**: Enum values are case-sensitive, leading to potential mismatches

## Best Practices

### Schema Definition

1. **Always Define Default Values**

```prisma
enum TaskStatus {
  pending
  processing
  completed
  failed
}

model Task {
  id        Int        @id @default(autoincrement())
  status    TaskStatus @default(pending)
}
```

2. **For Optional Enums, Explicitly Mark as Nullable**

```prisma
model Task {
  id        Int         @id @default(autoincrement())
  status    TaskStatus? // Can be null
}
```

3. **Use Clear, Descriptive Enum Values**

```prisma
// Good
enum PrintQuality {
  draft
  standard
  high
}

// Avoid
enum Quality {
  q1
  q2
  q3
}
```

4. **Document Enum Values**

Add comments in the schema to explain the meaning of each enum value:

```prisma
enum OrderStatus {
  pending    // Order received but not processed
  processing // Order is being prepared
  shipped    // Order has been shipped
  delivered  // Order has been delivered
  cancelled  // Order was cancelled
}
```

### Application Code

1. **Use Type Safety**

Always use the TypeScript enum type when working with enum fields:

```typescript
import { TaskStatus } from '@prisma/client';

function updateTaskStatus(id: number, status: TaskStatus) {
  // This ensures only valid enum values can be passed
}
```

2. **Handle Null Values Appropriately**

```typescript
// If the enum field can be null
function getTaskStatus(task: Task): string {
  return task.status ?? 'Not set';
}
```

3. **Validate Input Data**

When receiving data from external sources (API requests, imports, etc.), validate that enum values are valid:

```typescript
function validateTaskStatus(status: string): TaskStatus {
  if (!Object.values(TaskStatus).includes(status as TaskStatus)) {
    throw new Error(`Invalid task status: ${status}`);
  }
  return status as TaskStatus;
}
```

4. **Avoid Direct String Assignment**

```typescript
// Avoid
task.status = 'pending'; // Type error in TypeScript, but might work at runtime

// Prefer
task.status = TaskStatus.pending;
```

### Database Migrations

1. **Add Default Values When Creating New Enum Fields**

When adding a new enum field to an existing table, always include a default value:

```prisma
// Before
model Task {
  id        Int @id @default(autoincrement())
}

// After
model Task {
  id        Int        @id @default(autoincrement())
  status    TaskStatus @default(pending)
}
```

2. **Handle Existing Data in Migrations**

When adding an enum field to a table with existing data, ensure all rows get a valid value:

```sql
-- Example migration SQL
UPDATE "Task" SET "status" = 'pending' WHERE "status" IS NULL;
```

3. **Test Migrations Thoroughly**

Always test migrations on a copy of production data before applying them to production.

## Handling Enum Changes

Changing enum values requires special attention:

1. **Adding New Values**: Generally safe, but update application logic to handle the new values
2. **Removing Values**: Ensure no existing data uses the values being removed
3. **Renaming Values**: Requires a multi-step migration process:
   - Add the new value
   - Update all records using the old value
   - Remove the old value

## Troubleshooting Enum Issues

If you encounter issues with enum fields:

1. **Check Database Values**: Use raw SQL to inspect the actual values in the database
   ```sql
   SELECT DISTINCT stl_render_state FROM "PrintOrderTask";
   ```

2. **Validate Against Enum Definition**: Ensure all values match the defined enum

3. **Fix Invalid Values**: Use raw SQL to update invalid values
   ```sql
   UPDATE "PrintOrderTask" SET stl_render_state = 'pending' 
   WHERE stl_render_state = '' OR stl_render_state IS NULL;
   ```

## Conclusion

Following these best practices will help prevent issues with enum fields in Prisma. Always define default values, be explicit about nullability, and validate input data to ensure only valid enum values are stored in the database.
