## ESLint Fix Todo List

_Note: This list focuses on **lint "errors"** that currently fail `npm run lint`. Warnings are omitted unless they are quick-wins. Each task includes the expected rule, the file/line reference (approximate), and one or more concrete actions the fixer bot should apply. Tick boxes can be updated automatically as items are resolved._

---

### Legend

- 🔧 = code edit required
- ➕ = consider new ESLint config / suppression

---

### 1 · Global & Config-Level

- [ ] 🔧 `import/order` – Ensure import groups (builtin ➜ external ➜ alias `@/..` ➜ relative) are separated by one blank line. Alphabetise within groups. Applies to **many** files.
- [ ] 🔧 `@typescript-eslint/explicit-function-return-type` – Decide strategy:
  - Either annotate return types for all small UI functions in `src/components/ui/**` (hundreds of warnings) **or**
  - ➕ Downgrade rule to `warn` or disable for that folder in `.eslintrc`.
- [ ] 🔧 `@typescript-eslint/no-unused-vars` – Remove or use variables/constants flagged as unused.
- [ ] 🔧 `no-empty` – Replace empty block statements with a comment or remove block.
- [ ] 🔧 `@typescript-eslint/ban-types` – Replace naked `{}` type with `unknown`, `object`, or a specific `Record`.
- [ ] 🔧 `no-prototype-builtins` – Use `Object.prototype.hasOwnProperty.call(obj, key)`.

---

### 2 · File-Specific Checklist

#### src/lib/ai/print-plan.ts

- [ ] 🔧 Line 20: `COMPLEX_PLAN_PROMPT` is declared but never used (`@typescript-eslint/no-unused-vars`).
  - Action: Remove constant **or** export/re-use in calling code/tests.

#### src/lib/ai/print-queue-summary.ts

- [ ] 🔧 Line 18: `SYSTEM_PROMPT` unused (`no-unused-vars`). Same fix as above.

#### src/lib/csv-utils.ts

- [ ] 🔧 Top-of-file import order (`import/order`). `Papa` default import should come **after** external imports and before alias imports.
- [ ] 🔧 Consider switching `Papa` default import to named (`import { parse, unparse } from 'papaparse'`) to silence `import/no-named-as-default-member` warnings.

#### src/lib/email/order-notifications.ts

- [ ] 🔧 Import order: ensure `../shared/database` comes **after** other external/alias imports.

#### src/lib/email/system-notifications.ts

- [ ] 🔧 Remove unused enum-like constants `CRITICAL`, `ERROR`, `WARNING`, etc. or export them.

#### src/lib/orders/sync.ts

- [ ] 🔧 Top import block violates `import/order`; reorder so all `../email/*` imports precede `../shared/database`.
- [ ] 🔧 Several `_name` / `_ignoredProductId` variables unused (errors). Remove or implement.
- [ ] 🔧 Two `no-constant-condition` warnings on lines 811 & 970 – convert to explicit comparisons or `while (true)` if intentional + disable rule.

#### src/middleware.ts

- [ ] 🔧 Line 7: `_req` unused – prefix with `/* _ */` or remove param.

#### src/lib/shipstation/api.ts

- [ ] 🔧 Line 389: Replace `someObj.hasOwnProperty('x')` with `Object.prototype.hasOwnProperty.call(someObj,'x')`.

#### src/workers/stl-render-worker.ts

- [ ] 🔧 `_FORCE` unused; several `no-empty` blocks e.g., lines 199, 237, 262…
  - Action: remove vars; add TODO comments in empty blocks or implement logic.

#### src/scripts/populate-print-queue.ts (large script)

- [ ] 🔧 Multiple unused TypeScript enums (`OrderExtractionSuccess`, `PrintSettingOption`, etc.)
- [ ] 🔧 `isOptionObject` declared but never used.
- [ ] 🔧 Multiple `no-empty` catch blocks (1310, 1455). Replace with `/* empty */` or handling.

#### src/scripts/update-discrepant-tasks.ts

- [ ] 🔧 `_SCRIPT_NAME` unused; same empty-block pattern as above.

#### src/scripts/ai-processor.ts

- [ ] 🔧 Import order fix.
- [ ] 🔧 Add return types to exported functions.

#### src/types/order-details.ts

- [ ] 🔧 Replace all `Prisma.*GetPayload<{}>` generics with `Prisma.*GetPayload<Record<string, never>>` **or** add a named type param per Prisma docs to avoid `ban-types`.

#### src/types/print-tasks.ts

- [ ] 🔧 `taskId` and `newStatus` declared but never used – drop from type or reference.

#### src/lib/amazon/sp-api.ts & src/lib/api/secure-client.ts

- [ ] 🔧 Replace `any` with proper generics or `unknown`.

---

### 3 · Optional Rule Tweaks

If rapid delivery is preferred over strictness, consider:

- ➕ `next.config.js` ➜ `eslint.ignoreDuringBuilds: true` (allows deploys despite remaining errors) – see [Next.js ESLint docs](https://nextjs.org/docs/app/api-reference/config/eslint).
- ➕ In `.eslintrc`, downgrade `explicit-function-return-type` for `src/components/ui/**` to warn.

---

### 4 · Execution Order Recommendation

1. **Dead Code Removal** – delete unused vars & empty blocks (fastest lint gain).
2. **Import-Order Pass** – run `eslint --fix` after adjusting `.eslintrc` `import/order` settings.
3. **Type Rules** – fix `ban-types`, annotate return types where valuable.
4. **no-explicit-any** – add generics or `unknown`.

---

> After each batch of fixes, re-run `npm run lint --max-warnings=0` until all errors disappear. Warnings can be addressed later or silenced by rule scope.
