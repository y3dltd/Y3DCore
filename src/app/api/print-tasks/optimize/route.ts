import fs from 'fs/promises'; // Import fs promises
import path from 'path'; // Import path

import { PrintTaskStatus, Prisma, AiReportRun } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { z } from 'zod'; // Import Zod

import { prisma } from '@/lib/prisma';

// --- Logging Setup --- Moved to top level ---
const logDirectory = path.resolve(process.cwd(), 'logs');
const logFilePath = path.join(logDirectory, 'planner-api.log');

const ensureLogDirectory = async () => {
  try {
    await fs.access(logDirectory);
  } catch (error) {
    try {
      await fs.mkdir(logDirectory, { recursive: true });
      console.log(`Log directory created: ${logDirectory}`);
    } catch (mkdirError) {
      console.error(`Error creating log directory ${logDirectory}:`, mkdirError);
    }
  }
};

async function logToFile(logData: object) {
  await ensureLogDirectory();
  const timestamp = new Date().toISOString();
  const logEntry = JSON.stringify({ timestamp, ...logData }) + '\n';
  try {
    await fs.appendFile(logFilePath, logEntry, 'utf8');
  } catch (err) {
    console.error(`Failed to write to log file ${logFilePath}:`, err);
  }
}
// --- End Logging Setup ---

// --- Define Input Schema --- Moved to top level ---
const InputSchema = z.object({
  jobList: z.array(z.object({
    id: z.string(),
    sku: z.string().nullable().optional(),
    groupingSku: z.string(),
    order: z.object({
      marketplace: z.string().nullable().optional(),
      marketplace_order_number: z.string().nullable().optional(), // Changed to snake_case
      requested_shipping_service: z.string().nullable().optional(), 
    }).nullable().optional(),
    color1: z.string().nullable().optional(),
    color2: z.string().nullable().optional(),
    customText: z.string().nullable().optional(),
    quantity: z.number().int().optional(),
    shipByDate: z.string().nullable().optional(), // Keep this if used elsewhere, otherwise optional
  })),
  constraints: z.object({
    maxColorsPerTask: z.number().int(),
  }).optional(),
});

// Define the request schema to include optional filterDays
const RequestSchema = z.object({
  filterDays: z.number().optional(), // Optional parameter to filter tasks by ship_by_date
});
// --- End Input Schema ---

// Explicit types for task sequence validation
interface AssignedJob {
  id: string
  sku?: string | null
  quantity: number
  color1: string | null // Flattened
  color2: string | null // Flattened
  customText: string | null // Renamed from personalizationText
}

interface Task {
  taskNumber: number
  colorsLoaded: string[]
  estimatedItemsOnPlate: number
  assignedJobs: AssignedJob[]
}

interface TaskSequence {
  metadata: {
    totalJobs: number
    totalTasks: number
  }
  taskSequence: Task[]
  notes?: string[]
}

// Type for AI Suggestions
interface AiSuggestionGroup {
  sku: string | null;
  jobIds: string[];
  colors: string[];
  notes?: string;
}

interface AiSuggestionsResponse {
  suggestedGroups: AiSuggestionGroup[];
}

// --- Helper: Merge AI Suggestions with same SKU when allowed ---
function mergeAiSuggestions(
  suggestions: AiSuggestionGroup[] | null,
  jobMap: Map<string, z.infer<typeof InputSchema>["jobList"][number]>,
  constraints: z.infer<typeof InputSchema>["constraints"]
): AiSuggestionGroup[] | null {
  if (!suggestions || suggestions.length === 0) return suggestions;

  const maxColors = constraints?.maxColorsPerTask ?? 4;
  const capacitySingle = 15;
  const capacityDual = 6;
  const maxCombos = 6;

  function canMerge(a: AiSuggestionGroup, b: AiSuggestionGroup): boolean {
    const mergedJobIds = Array.from(new Set([...a.jobIds, ...b.jobIds]));
    const mergedJobs = mergedJobIds.map(id => jobMap.get(id)).filter(Boolean) as z.infer<typeof InputSchema>["jobList"];
    const colors = new Set<string>();
    let dualColor = false;
    const combos = new Set<string>();
    let totalQty = 0;
    for (const job of mergedJobs) {
      totalQty += job.quantity ?? 1;
      if (job.color1) colors.add(job.color1);
      if (job.color2) colors.add(job.color2);
      if (job.color2) dualColor = true;
      combos.add(`${job.color1 ?? "null"} > ${job.color2 ?? "null"}`);
    }
    if (colors.has("null" as unknown as string)) colors.delete("null" as unknown as string);
    if (colors.size > maxColors) return false;
    if (dualColor) {
      if (totalQty > capacityDual) return false;
      if (combos.size > maxCombos) return false;
    } else if (totalQty > capacitySingle) return false;
    return true;
  }

  const grouped: Record<string, AiSuggestionGroup[]> = {};
  for (const sg of suggestions) {
    const key = sg.sku ?? "UNKNOWN";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ ...sg });
  }

  const output: AiSuggestionGroup[] = [];
  for (const sku in grouped) {
    const list = grouped[sku];
    let merged: AiSuggestionGroup | null = null;
    for (const item of list) {
      // Deduplicate jobIds inside item
      item.jobIds = Array.from(new Set(item.jobIds));
      if (!merged) {
        merged = { ...item };
      } else {
        if (canMerge(merged, item)) {
          merged.jobIds = Array.from(new Set([...merged.jobIds, ...item.jobIds]));
          merged.colors = Array.from(new Set([...merged.colors, ...item.colors])).sort();
        } else {
          output.push(merged);
          merged = { ...item };
        }
      }
    }
    if (merged) output.push(merged);
  }

  // Ensure no duplicate jobIds across groups
  const seen = new Set<string>();
  for (const g of output) {
    g.jobIds = g.jobIds.filter(id => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  return output;
}

// Function to determine if a list of jobs contains any dual-color items
function hasDualColorJobs(jobs: z.infer<typeof InputSchema>['jobList']): boolean {
  return jobs.some(job => job.color2 !== null && job.color2 !== undefined && job.color2 !== '');
}

// Helper function to get unique color combinations (pairs)
function getUniqueColorCombinations(jobs: z.infer<typeof InputSchema>['jobList']): Set<string> {
  const combinations = new Set<string>();
  for (const job of jobs) {
    // Treat single-color jobs consistently for combination counting within dual-color plates
    const combo = `${job.color1 ?? 'null'} > ${job.color2 ?? 'null'}`;
    combinations.add(combo);
  }
  return combinations;
}

// Helper function to get the effective SKU for grouping purposes
function getEffectiveSku(rawSku: string | null): string {
  if (!rawSku) return 'UNKNOWN_SKU';

  // Group specific related SKUs together
  if (rawSku.startsWith('wi_395107128418') || rawSku === 'PER-KEY3D-STY1-Y3D') {
    return 'WI_STYLE1_KEYRING'; // Use a canonical name for this group
  }

  // You could add more mapping rules here if needed for other SKUs
  // e.g., if (rawSku === 'OLD_SKU_A' || rawSku === 'OLD_SKU_B') return 'NEW_SKU_GROUP';

  // Otherwise, use the original SKU (or a cleaned version if necessary)
  return rawSku;
}

// Helper function to check if a new task should be started based on limits
function shouldStartNewTask(
  currentJobs: z.infer<typeof InputSchema>['jobList'],
  nextJob: z.infer<typeof InputSchema>['jobList'][number],
  constraints: z.infer<typeof InputSchema>['constraints']
): boolean {
  if (currentJobs.length === 0) return false;

  const maxColorsPerTask = constraints?.maxColorsPerTask ?? 4;
  const capacitySingleColor = 15;
  const capacityDualColor = 6;
  const maxColorCombinationsDual = 6;

  const potentialNextJobs = [...currentJobs, nextJob];
  const potentialNextQuantity = potentialNextJobs.reduce((sum, j) => sum + (j.quantity ?? 1), 0);
  const potentialNextHasDualColor = hasDualColorJobs(potentialNextJobs);
  const potentialNextColors = new Set<string>();
  potentialNextJobs.forEach(j => {
    if (j.color1) potentialNextColors.add(j.color1);
    if (j.color2) potentialNextColors.add(j.color2);
  });
  const potentialNextCombinations = getUniqueColorCombinations(potentialNextJobs);

  if (!potentialNextHasDualColor) {
    if (potentialNextQuantity > capacitySingleColor) return true;
  } else {
    if (potentialNextQuantity > capacityDualColor) return true;
    if (potentialNextCombinations.size > maxColorCombinationsDual) return true;
    if (potentialNextColors.size > maxColorsPerTask) return true;
  }
  return false;
}

// --- Client-Side Task Builder (Corrected Version) ---
function buildTaskSequence(
  jobList: z.infer<typeof InputSchema>['jobList'],
  constraints: z.infer<typeof InputSchema>['constraints'],
  aiSuggestions?: AiSuggestionGroup[]
): TaskSequence {
  const tasks: Task[] = [];
  const assignedJobIds = new Set<string>();
  let taskNumber = 0;
  const jobMap = new Map(jobList.map(job => [job.id, job]));

  // Pass 1: Process AI Suggestions
  if (aiSuggestions && aiSuggestions.length > 0) {
    console.log('[buildTaskSequence] Processing AI suggestions directly into tasks...');
    for (const suggestion of aiSuggestions) {
      const jobsForThisTask: z.infer<typeof InputSchema>['jobList'] = [];
      let suggestionHasUnassignedJobs = false;
      for (const jobId of suggestion.jobIds) {
        if (!assignedJobIds.has(jobId)) {
          const job = jobMap.get(jobId);
          if (job && job.groupingSku === suggestion.sku) {
            jobsForThisTask.push(job);
            suggestionHasUnassignedJobs = true;
          }
        }
      }
      if (suggestionHasUnassignedJobs && jobsForThisTask.length > 0) {
        taskNumber++;
        const taskColors = new Set<string>();
        jobsForThisTask.forEach(j => {
          if (j.color1) taskColors.add(j.color1);
          if (j.color2) taskColors.add(j.color2);
        });
        tasks.push(createTaskObject(taskNumber, jobsForThisTask, taskColors));
        jobsForThisTask.forEach(j => assignedJobIds.add(j.id));
      }
    }
    console.log(`[buildTaskSequence] Finished processing AI suggestions. Assigned ${assignedJobIds.size} jobs.`);
  }

  // Pass 2: Process Remaining Unassigned Jobs
  const remainingJobs = jobList.filter(job => !assignedJobIds.has(job.id));
  if (remainingJobs.length > 0) {
    console.log(`[buildTaskSequence] Processing ${remainingJobs.length} remaining jobs (AI fallback)...`);
    const remainingJobsByGroupingSku: Record<string, typeof jobList> = {};
    for (const job of remainingJobs) {
      const key = job.groupingSku;
      if (!remainingJobsByGroupingSku[key]) {
        remainingJobsByGroupingSku[key] = [];
      }
      remainingJobsByGroupingSku[key].push(job);
    }

    for (const groupingSku in remainingJobsByGroupingSku) {
      const skuJobs = remainingJobsByGroupingSku[groupingSku]; // Define skuJobs here
      skuJobs.sort((a, b) => (b.quantity ?? 1) - (a.quantity ?? 1));

      let currentTaskJobs: typeof jobList = [];

      for (const job of skuJobs) { // Use skuJobs here
        const startNewTask = shouldStartNewTask(currentTaskJobs, job, constraints);

        if (startNewTask) {
          // Finalize previous task if not empty
          if (currentTaskJobs.length > 0) {
            taskNumber++;
            const currentTaskColors = new Set<string>();
            currentTaskJobs.forEach(j => {
              if (j.color1) currentTaskColors.add(j.color1);
              if (j.color2) currentTaskColors.add(j.color2);
            });
            tasks.push(createTaskObject(taskNumber, currentTaskJobs, currentTaskColors));
            currentTaskJobs.forEach(j => assignedJobIds.add(j.id)); // Assign jobs from finalized task
          }
          // Start new task with the current job
          currentTaskJobs = [job];
        } else {
          // Add job to current task
          currentTaskJobs.push(job);
        }
      }
      // Finalize the last task for this group if not empty
      if (currentTaskJobs.length > 0) {
        taskNumber++;
        const currentTaskColors = new Set<string>();
        currentTaskJobs.forEach(j => {
          if (j.color1) currentTaskColors.add(j.color1);
          if (j.color2) currentTaskColors.add(j.color2);
        });
        tasks.push(createTaskObject(taskNumber, currentTaskJobs, currentTaskColors));
        currentTaskJobs.forEach(j => assignedJobIds.add(j.id)); // Assign jobs from the final task
      }
    }
  }

  // Final check: Ensure all original jobs were assigned
  if (assignedJobIds.size !== jobList.length) {
    const unassigned = jobList.filter(j => !assignedJobIds.has(j.id));
    console.error(`[buildTaskSequence] Mismatch after processing: ${assignedJobIds.size} assigned, ${jobList.length} total. Unassigned:`, unassigned.map(j => j.id));
    throw new Error(`Internal error: Failed to assign all jobs. ${jobList.length - assignedJobIds.size} jobs missed.`);
  }

  // Ensure function returns the correct type
  return {
    metadata: {
      totalJobs: jobList.length,
      totalTasks: tasks.length,
    },
    taskSequence: tasks,
  };
}

// Helper to create Task Object - Ensure it includes the correct SKU info if needed downstream
// Decide whether the final task object should contain the original SKU or the grouping SKU.
// Let's keep the original SKU for potential display/labeling purposes.
function createTaskObject(taskNumber: number, jobs: z.infer<typeof InputSchema>['jobList'], colors: Set<string>): Task {
  const assignedJobs: AssignedJob[] = jobs.map(job => ({
    id: job.id,
    sku: job.sku, // Use original SKU here
    quantity: job.quantity ?? 1,
    color1: job.color1 ?? null,
    color2: job.color2 ?? null,
    customText: job.customText ?? null,
  }));

  return {
    taskNumber: taskNumber,
    // Sort colorsLoaded alphabetically for consistency
    colorsLoaded: Array.from(colors).sort(),
    estimatedItemsOnPlate: assignedJobs.reduce((sum, j) => sum + j.quantity, 0),
    assignedJobs: assignedJobs,
  };
}
// --- End Client-Side Task Builder ---

/**
 * API endpoint to optimize print tasks
 * POST /api/print-tasks/optimize
 */
export async function POST(req: NextRequest) {
  let inputData: z.infer<typeof InputSchema> | null = null;
  let dbRunRecord: AiReportRun | null = null;
  let openaiResponse: OpenAI.Chat.Completions.ChatCompletion | null = null;
  let runId: string | null = null;
  let rawResponseText: string | null = null;

  try {
    // Parse request body if it exists to get filterDays
    let filterDays: number | undefined = undefined;
    try {
      if (req.body) {
        const body = await req.json();
        const parsed = RequestSchema.parse(body);
        filterDays = parsed.filterDays;
      }
    } catch (error) {
      console.warn("[API Optimize] Error parsing request body, proceeding without filters:", error);
    }

    // Build the where clause for the query
    const whereClause: Prisma.PrintOrderTaskWhereInput = {
      status: PrintTaskStatus.pending,
      needs_review: false,
    };

    // Add date filter if filterDays is specified
    if (filterDays !== undefined) {
      /*
       * Use UTC-based midnight boundaries so behaviour is identical in local dev
       * (which may run in your local TZ) and in Vercel lambdas (always UTC).
       */
      const now = new Date();
      const startUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      const endUtc = new Date(startUtc);
      endUtc.setUTCDate(startUtc.getUTCDate() + filterDays - 1);
      endUtc.setUTCHours(23, 59, 59, 999);

      whereClause.ship_by_date = {
        gte: startUtc,
        lte: endUtc,
      };

      // Extra debug log
      console.log('[API Optimize] VERCEL_REGION:', process.env.VERCEL_REGION);
      console.log(`[API Optimize] UTC date filter gte=${startUtc.toISOString()} lte=${endUtc.toISOString()}`);
    }

    // Fetch pending tasks with the constructed where clause
    const pendingTasks = await prisma.printOrderTask.findMany({
      where: whereClause,
      include: {
        product: true,
        order: { 
          select: { 
            marketplace: true,
            requested_shipping_service: true, // Corrected to snake_case for select
          }
        },
      },
      orderBy: {
        ship_by_date: 'asc',
      },
      take: 200,
    });

    console.log(`[API Optimize] Found ${pendingTasks.length} pending tasks to optimize.${filterDays ? ` (Filtered to ${filterDays} days)` : ''}`);

    if (pendingTasks.length === 0) {
      return NextResponse.json({ success: true, message: 'No pending tasks found', tasks: [] });
    }

    // Transform tasks: Includes groupingSku
    const jobListWithGroupingSku = pendingTasks.map(task => {
      const originalSku = task.product?.sku ?? null;
      const groupingSku = getEffectiveSku(originalSku);
      return {
        id: `${task.id}`,
        sku: originalSku,
        groupingSku: groupingSku,
        order: { 
          marketplace: task.order?.marketplace,
          marketplace_order_number: task.marketplace_order_number, // Directly from task (snake_case as per schema for direct field)
          requested_shipping_service: task.order?.requested_shipping_service, // From related order (snake_case via client)
        },
        quantity: task.quantity,
        color1: task.color_1,
        color2: task.color_2,
        customText: task.custom_text,
      };
    });

    const rawInputData = {
      jobList: jobListWithGroupingSku,
      constraints: { maxColorsPerTask: 4 },
    };

    // Validate the full input data (including groupingSku)
    try {
      inputData = InputSchema.parse(rawInputData);
      await logToFile({ type: 'input', endpoint: '/api/print-tasks/optimize', data: inputData });
    } catch (validationError) {
      const errorMessage = 'Input data validation failed';
      console.error(`[API Optimize] ${errorMessage}:`, (validationError as z.ZodError).errors);
      await logToFile({ type: 'error', endpoint: '/api/print-tasks/optimize', message: errorMessage, validationErrors: (validationError as z.ZodError).errors, inputAttempt: rawInputData });
      return NextResponse.json({ success: false, error: errorMessage, details: (validationError as z.ZodError).errors }, { status: 400 });
    }

    console.log('[API Optimize] Input validated successfully.');

    // --- Prepare Data for AI: Use groupingSku as the main sku --- 
    const jobListForAi = inputData.jobList.map(job => ({
      id: job.id,
      sku: job.groupingSku, // *** Send the groupingSku to AI as the sku ***
      order: job.order ? { // Ensure job.order exists before accessing its properties
        marketplace: job.order.marketplace,
        marketplace_order_number: job.order.marketplace_order_number, // Key is now snake_case
        requested_shipping_service: job.order.requested_shipping_service, // Corrected to snake_case
      } : undefined, // Pass undefined if job.order is not present
      quantity: job.quantity,
      color1: job.color1,
      color2: job.color2,
      customText: job.customText,
    }));
    const inputDataForAi = {
      jobList: jobListForAi,
      constraints: inputData.constraints
    };
    // --- End Prepare Data for AI ---

    // --- Load Prompt ---
    const promptFileName = 'prompt-system-optimized.txt'; // Use the combined system prompt file
    const promptFilePath = path.join(process.cwd(), 'src', 'lib', 'ai', 'prompts', promptFileName);
    let systemMessageContent: string;
    try {
      // Read the prompt file directly
      const rawPromptContent = await fs.readFile(promptFilePath, 'utf-8');
      // Reinstate placeholder replacement logic
      const maxColors = inputData.constraints?.maxColorsPerTask ?? 4;
      const totalJobs = inputData.jobList.length; // Use original length
      systemMessageContent = rawPromptContent
        .replace('{{MAX_COLORS}}', String(maxColors))
        .replace('{{TOTAL_JOBS}}', String(totalJobs));
      console.log(`[API Optimize] Loaded system prompt from ${promptFilePath}`);
    } catch (fileError) {
      // ... prompt loading error handling ...
      const errorMsg = `Failed to read system prompt file: ${promptFilePath}`;
      console.error(`[API Optimize] ${errorMsg}`, fileError);
      await logToFile({ type: 'error', endpoint: '/api/print-tasks/optimize', message: errorMsg, fileError });
      return NextResponse.json({ success: false, error: `${errorMsg}. Check server logs.` }, { status: 500 });
    }
    // --- End Load Prompt ---

    // --- Call OpenAI API --- (Restored)
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('Missing OPENAI_API_KEY');
    // Support for OpenAI API proxy (like LiteLLM) via environment variable
    const openai = new OpenAI({ 
      apiKey,
      baseURL: process.env.OPENAI_API_BASE_URL 
    });
    console.log('[API Optimize] Sending request to OpenAI for grouping suggestions...');
    const modelToUse = "o3"; // Changed back from o4-mini
    console.log(`[API Optimize] Using model: ${modelToUse}`);

    try {
      openaiResponse = await openai.chat.completions.create({
        model: modelToUse,
        messages: [
          { role: "system", content: systemMessageContent },
          { role: "user", content: JSON.stringify(inputDataForAi) } // *** Send the modified data ***
        ],
        // max_tokens: 4096, // Adjust if needed, based on typical response size
        temperature: 1, // *** Changed back to 1 as required by o4-mini ***
        response_format: { type: "json_object" },
      });
      await logToFile({ type: 'output', endpoint: '/api/print-tasks/optimize', data: openaiResponse });
      console.log('[API Optimize] Received response from OpenAI');
    } catch (openaiError) {
      const errorMsg = `OpenAI API call failed: ${openaiError instanceof Error ? openaiError.message : String(openaiError)}`;
      console.error(`[API Optimize] ${errorMsg}`);
      await logToFile({ type: 'error', endpoint: '/api/print-tasks/optimize', message: errorMsg, openaiError });
      // Decide how to handle: Proceed without suggestions or return error?
      // Let's proceed without suggestions for now.
      openaiResponse = null; // Ensure it's null if call failed
    }
    // --- End Call OpenAI API ---

    // --- Process OpenAI Response --- (Restored and adapted)
    let outputJsonForDb: Prisma.InputJsonValue | null = null;
    let runStatus: 'success' | 'error' = 'error';
    let finalTaskSequence: TaskSequence | null = null;
    let aiSuggestions: AiSuggestionGroup[] | null = null;

    if (openaiResponse) { // Only process if the API call was successful
      const message = openaiResponse.choices[0]?.message;
      if (message?.content) {
        rawResponseText = message.content;
      } else {
        rawResponseText = JSON.stringify(message);
        console.warn("[API Optimize] OpenAI response message content was empty, using full message string.");
      }

      try {
        const parsedData: unknown = JSON.parse(rawResponseText);
        // Optional: Add regex fallback if initial parse fails (like before)

        const potentialResponse = parsedData as Partial<AiSuggestionsResponse>;
        if (potentialResponse && Array.isArray(potentialResponse.suggestedGroups)) {
          aiSuggestions = potentialResponse.suggestedGroups;
          // Merge duplicate SKU groups using helper if suggestions exist
          if (aiSuggestions.length > 0) {
            const jobMapForMerge = new Map(inputData.jobList.map(j => [j.id, j]));
            aiSuggestions = mergeAiSuggestions(aiSuggestions, jobMapForMerge, inputData.constraints) ?? aiSuggestions;
          }
          console.log(`[API Optimize] Successfully parsed ${aiSuggestions.length} suggested groups from AI.`);
          // Use the suggestions themselves for DB logging when available
          outputJsonForDb = aiSuggestions as unknown as Prisma.InputJsonValue;
          runStatus = 'success'; // Tentative success
        } else {
          console.warn("[API Optimize] AI response did not contain valid 'suggestedGroups' array.");
          outputJsonForDb = { error: "AI failed to provide valid suggestions.", rawResponse: parsedData } as Prisma.JsonObject;
          // Proceed without AI suggestions
          runStatus = 'success'; // Still attempt to build sequence
        }
      } catch (error) {
        const errorMsg = `Failed to parse AI suggestion response: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[API Optimize] ${errorMsg}`);
        outputJsonForDb = { error: errorMsg, rawResponse: rawResponseText } as Prisma.JsonObject;
        // Proceed without AI suggestions
        runStatus = 'success'; // Still attempt to build sequence
      }
    } else {
      // Handle case where OpenAI call failed earlier
      rawResponseText = 'OpenAI API call failed or skipped.';
      outputJsonForDb = { error: 'OpenAI API call failed, proceeding without suggestions.' } as Prisma.JsonObject;
      runStatus = 'success'; // Still attempt to build sequence
      console.warn('[API Optimize] OpenAI call failed or was skipped, proceeding without AI suggestions.');
    }
    // --- End Process OpenAI Response ---

    // --- Build Task Sequence using Client-Side Logic (potentially using AI suggestions) ---
    try {
      console.log(`[API Optimize] Building final task sequence ${aiSuggestions ? 'using AI suggestions' : 'using client-side logic ONLY'}...`);
      // Pass the original job list (with groupingSku) and optional AI suggestions
      finalTaskSequence = buildTaskSequence(inputData.jobList, inputData.constraints, aiSuggestions ?? undefined);
      console.log(`[API Optimize] Successfully built task sequence with ${finalTaskSequence.metadata.totalTasks} tasks.`);

      // If builder succeeded, overwrite DB log with the final sequence
      const plainTaskSequence = JSON.parse(JSON.stringify(finalTaskSequence));
      outputJsonForDb = plainTaskSequence as Prisma.InputJsonValue;
      runStatus = 'success';
    } catch (buildError) {
      // ... builder error handling (log final sequence error, set status to error) ...
      const errorMsg = `Failed to build task sequence: ${buildError instanceof Error ? buildError.message : String(buildError)}`;
      console.error(`[API Optimize] ${errorMsg}`);
      // Use the AI outputJsonForDb if available, otherwise create new error log
      outputJsonForDb = {
        error: errorMsg,
        aiSuggestionsUsed: !!aiSuggestions, // Indicate if suggestions were attempted
        aiSuggestions: aiSuggestions, // Log suggestions if available
        aiRawResponse: rawResponseText // Log raw AI response if available
      } as Prisma.JsonObject;
      runStatus = 'error';
      // Save error record before returning
      dbRunRecord = await prisma.aiReportRun.create({
        data: {
          reportId: 'planner',
          inputJson: inputData as unknown as Prisma.InputJsonValue,
          outputJson: JSON.stringify(outputJsonForDb),
          rawResponse: rawResponseText ?? 'Builder Error - No AI Response',
          status: runStatus,
          finishedAt: new Date(),
        },
      });
      runId = dbRunRecord.id;
      return NextResponse.json({ success: false, error: errorMsg, runId }, { status: 500 });
    }
    // --- End Build Task Sequence ---

    // --- Save to Database --- (Adjust logging slightly)
    console.log(`[API Optimize] Saving run record with status: ${runStatus}`);
    const outputJsonString = JSON.stringify(outputJsonForDb);

    dbRunRecord = await prisma.aiReportRun.create({
      data: {
        reportId: 'planner',
        inputJson: inputData as unknown as Prisma.InputJsonValue, // Log original input
        outputJson: outputJsonString, // Log final sequence or specific error from builder/parser
        rawResponse: rawResponseText ?? 'No AI Response', // Log raw AI response if available
        status: runStatus,
        finishedAt: new Date(),
      },
    });
    runId = dbRunRecord.id;
    console.log(`[API Optimize] Saved run record ID: ${runId}`);
    // --- End Save to Database ---

    // --- Return Response --- (Adjusted slightly for clarity)
    if (runStatus === 'success' && finalTaskSequence) {
      return NextResponse.json({ success: true, taskSequence: finalTaskSequence, runId });
    } else {
      // This case now primarily handles builder errors where the error record was saved
      const clientErrorMessage = (outputJsonForDb && typeof outputJsonForDb === 'object' && 'error' in (outputJsonForDb as Record<string, unknown>) && typeof (outputJsonForDb as Record<string, unknown>).error === 'string')
        ? (outputJsonForDb as Record<string, unknown>).error as string
        : 'Optimization failed during task building. See run logs for details.';
      return NextResponse.json({ success: false, error: clientErrorMessage, runId }, { status: 500 });
    }

  } catch (error) {
    // ... General error handling (Adjust logging) ...
    console.error('[API Optimize] General Error:', error);
    const errorMessage = (error instanceof Error) ? error.message : String(error);
    const errorStack = (error instanceof Error) ? error.stack : undefined;
    await logToFile({ type: 'error', endpoint: '/api/print-tasks/optimize', message: `General Error: ${errorMessage}`, errorDetails: errorMessage, stack: errorStack, inputData });

    if (!dbRunRecord && inputData) {
      try {
        dbRunRecord = await prisma.aiReportRun.create({
          data: {
            reportId: 'planner',
            inputJson: inputData as unknown as Prisma.InputJsonValue,
            outputJson: JSON.stringify({ error: `General API Error: ${errorMessage}` }),
            rawResponse: `General Error: ${rawResponseText ?? 'No AI Response available'} | Stack: ${errorStack ?? 'N/A'}`,
            status: 'error',
            finishedAt: new Date(),
          },
        });
        runId = dbRunRecord.id;
      } catch (dbError) {
        console.error('[API Optimize] Failed to save error run record after general error:', dbError);
      }
    }
    return NextResponse.json({ success: false, error: `Optimization failed: ${errorMessage}`, runId }, { status: 500 });
  }
}
