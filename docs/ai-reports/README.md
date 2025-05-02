# AI Reports Framework

This document outlines the **minimal viable implementation** for a reusable AI Reports system in Y3DHub, plus the full specification for our **first report** – the *13-Printer Sequential Task Planner*.

> Goal: Users can trigger reports, view historical runs, and re-run on demand.  Report outputs (JSON) must be presented in a clear, human-readable way in the UI.

---

## 1 — Domain Models (Prisma)

```prisma
model AiReportDefinition {
  id          String   @id @default(uuid())
  slug        String   @unique                            // "sequential-task-planner"
  name        String                                     // "Sequential Task Planner"
  description String
  systemPrompt String                                    // Static prompt string (can be long)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  runs        AiReportRun[]
}

model AiReportRun {
  id          String   @id @default(uuid())
  reportId    String
  inputJson   Json                                        // Raw request body sent to OpenAI
  outputJson  Json?                                       // Parsed JSON on success
  rawResponse Text?                                       // Raw text response for debugging
  status      String   @default("running")               // running | success | error
  errorMsg    Text?
  createdAt   DateTime @default(now())
  finishedAt  DateTime?

  report      AiReportDefinition @relation(fields: [reportId], references: [id])
  @@index([reportId])
}
```

*Migration strategy*: **create new tables only** – no destructive changes.

---

## 2 — API Surface

| Method & Route | Purpose |
| -------------- | -------- |
| `GET /api/ai/reports` | List `AiReportDefinition` rows (id, name, description). |
| `POST /api/ai/reports/:id/run` | Launch a new run – saves `AiReportRun(status='running')`, immediately calls OpenAI, updates row on completion, returns run row. |
| `GET /api/ai/reports/runs?reportId=` | List historical runs for a report (latest first). |
| `GET /api/ai/reports/run/:runId` | Fetch single run (for detail page). |

> All endpoints are server-action friendly (App Router).  Calls that mutate create the row **first** then stream/await the OpenAI response to avoid double-writes.

---

## 3 — Frontend UX (App Router)

```
/ai/reports
└── layout.tsx     // sidebar: list of reports
    ├─ page.tsx    // default = report overview
    ├─ [report]/page.tsx         // shows definition info + "Run" button + table of past runs
    └─ [report]/[runId]/page.tsx // JSON result viewer & pretty components
```

### 3.1 JSON Result Viewer

* Use [`@react-json-view`](https://github.com/mac-s-g/react-json-view) (already lightweight) for collapsible tree.
* Additionally render smart sections (e.g. tasks table) for known reports with bespoke components.

---

## 4 — Sequential Task Planner (definition record)

| Field | Value |
| ----- | ----- |
| **slug** | `sequential-task-planner` |
| **name** | 13-Printer Sequential Task Planner |
| **description** | Generates an optimised task sequence for Huddersfield print farm. |
| **systemPrompt** | *Full prompt provided by user (trimmed for brevity in DB row)* |

### 4.1 Input Schema (validated in TS)

```ts
interface PlannerInput {
  jobList: Array<{
    internalId: string;
    productType: string;
    quantity: number;
    color1: string;
    color2?: string | null;
    priority: string;
    sku?: string;
    customText?: string;
  }>;
  filamentStock: Record<string, number>; // color -> spools available
}
```

### 4.2 Output Schema (saved as JSON)

Stored exactly as returned by the AI; key path: `taskSequence.*` (see prompt).

---

## 5 — Server Logic (pseudo-code)

```ts
export async function runReport(def: AiReportDefinition, input: PlannerInput) {
  const run = await prisma.aiReportRun.create({ data: { reportId: def.id, inputJson: input } });

  try {
    const openaiRes = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0,
      messages: [
        { role: 'system', content: def.systemPrompt },
        { role: 'user', content: JSON.stringify(input) },
      ],
    });
    const txt = openaiRes.choices[0].message.content;
    const parsed = JSON.parse(txt);

    await prisma.aiReportRun.update({
      where: { id: run.id },
      data: { outputJson: parsed, rawResponse: txt, status: 'success', finishedAt: new Date() },
    });
  } catch (err) {
    await prisma.aiReportRun.update({
      where: { id: run.id },
      data: { status: 'error', errorMsg: (err as Error).message, finishedAt: new Date() },
    });
    throw err;
  }

  return run;
}
```

---

## 6 — Minimum Steps to Ship

1. **Create Prisma models** → generate & migrate.
2. **Seed** the `AiReportDefinition` row for `sequential-task-planner`.
3. **Implement API routes** above (run route can live at `/api/ai/reports/[id]/run/route.ts`).
4. **Enhance UI**
   * Left column list of report definitions.
   * Detail page with run history table + new run button.
   * JSON tree viewer page for a run.
5. **Permissions** – initially admin-only; later use role field in session.

---

## 7 — Future Enhancements

* Cron-based scheduled runs (e.g. hourly).
* Web-socket / server-sent events to push `running` → `success` status.
* Fine-grained diff view between runs.
* Export to CSV / download JSON.
* Notifications when report fails.
