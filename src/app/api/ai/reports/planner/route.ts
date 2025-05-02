import fs from 'fs/promises'; // Import fs/promises for async file operations
import path from 'path'; // Import path for constructing file paths

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod'; // Import zod for schema validation (optional but recommended)

// --- Logging Setup ---
const logDirectory = path.resolve(process.cwd(), 'logs');
const logFilePath = path.join(logDirectory, 'planner-api.log');

// Ensure log directory exists
const ensureLogDirectory = async () => {
  try {
    await fs.access(logDirectory); // Check if directory exists
  } catch (error) {
    // If error (likely doesn't exist), try to create it
    try {
      await fs.mkdir(logDirectory, { recursive: true });
      console.log(`Log directory created: ${logDirectory}`);
    } catch (mkdirError) {
      console.error(`Error creating log directory ${logDirectory}:`, mkdirError);
    }
  }
};

// Helper function to append logs to the file
async function logToFile(logData: object) {
  await ensureLogDirectory(); // Make sure the directory exists before logging
  const timestamp = new Date().toISOString();
  // Create a log entry object with timestamp and data
  const logEntry = JSON.stringify({ timestamp, ...logData }) + '\n';
  try {
    await fs.appendFile(logFilePath, logEntry, 'utf8');
  } catch (err) {
    // Log failures to console, but don't block the API request
    console.error(`Failed to write to log file ${logFilePath}:`, err);
  }
}
// --- End Logging Setup ---

// Define the expected input structure (adjust based on actual input)
const InputSchema = z.object({
  jobList: z.array(z.object({
    id: z.string(),
    // Add other expected fields from your input JSON
    productName: z.string().optional(),
    color1: z.string().nullable().optional(),
    color2: z.string().nullable().optional(),
    customText: z.string().nullable().optional(),
    quantity: z.number().int().optional(),
  })),
  constraints: z.object({
    maxColorsPerTask: z.number().int(),
    maxTaskItems: z.number().int(),
  }).optional(), // Make constraints optional if they might not always be present
});


// Define the JSON schema for the function call (Corrected Syntax)
const plannerFunctionSchema = {
  name: "plan_task_sequence",
  description: "Generate optimized taskSequence based on the provided job list, adhering strictly to all constraints, especially the 4-color limit and one-SKU-per-task rules.",
  // Adding strict mode (experimental)
  strict: true,
  parameters: {
    type: "object",
    properties: {
      taskSequence: {
        type: "object",
        properties: {
          metadata: {
            type: "object",
            properties: {
              sequenceGeneratedAt: { type: "string", description: "ISO 8601 timestamp of generation." },
              totalJobsProvided: { type: "integer", description: "Count of jobs in the input jobList." },
              totalItemsProvided: { type: "integer", description: "Sum of quantities for all jobs in the input." },
              estimatedTotalTasks: { type: "integer", description: "Total number of tasks (plates) generated." }
            },
            required: ["sequenceGeneratedAt", "totalJobsProvided", "totalItemsProvided", "estimatedTotalTasks"]
          },
          tasks: {
            type: "array",
            description: "The ordered sequence of print tasks (plates).",
            items: { // Key 'items' defines the structure of objects in the array
              type: "object",
              properties: {
                taskNumber: { type: "integer", description: "Sequential number of the task, starting from 1." },
                colorsLoaded: {
                  type: "array",
                  description: "The distinct non-null colors required for this task. MUST NOT exceed 4.",
                  items: { type: "string" }, // Corrected: type should be quoted
                  maxItems: 4
                },
                estimatedItemsOnPlate: { type: "integer", description: "Sum of quantities for all jobs assigned to this task." },
                assignedJobs: {
                  type: "array",
                  description: "The jobs assigned to this specific task. MUST all be for the same SKU.",
                  items: { // Key 'items' defines the structure of objects in this array
                    type: "object",
                    properties: {
                      sku: { type: "string", description: "The SKU of the product for this job." },
                      quantity: { type: "integer", description: "The quantity of this specific job item." },
                      colorRequirements: {
                        type: "object",
                        properties: {
                          color1: { type: ["string", "null"] },
                          color2: { type: ["string", "null"] }
                        },
                        description: "Original color1 and color2 for the job."
                      },
                      id: { type: "string", description: "The original ID of the job from the input jobList." },
                      personalizationText: { type: ["string", "null"], description: "Personalization text for the job." },
                    },
                    required: ["sku", "quantity", "colorRequirements", "id", "personalizationText"]
                  }
                }
              },
              required: ["taskNumber", "colorsLoaded", "estimatedItemsOnPlate", "assignedJobs"]
            }
          },
          notes: {
            type: "array",
            description: "Optional notes or explanations about the generated sequence.",
            items: { type: "string" } // Corrected: type should be quoted
          }
        },
        required: ["metadata", "tasks"]
      }
    },
    required: ["taskSequence"]
  }
};


export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Log error state if desired, before returning
    await logToFile({ type: 'error', message: 'Missing OPENAI_API_KEY' });
    return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 });
  }

  let inputJobs;
  const requestBody = await req.json(); // Read body once
  try {
    // Validate input against Zod schema (optional but recommended)
    inputJobs = InputSchema.parse(requestBody);
    // Log the validated input before sending to OpenAI
    await logToFile({ type: 'input', data: inputJobs });
  } catch (error) {
    const errorMessage = (error instanceof Error) ? error.message : String(error);
    // Log validation error
    await logToFile({ type: 'error', message: `Invalid input JSON: ${errorMessage}`, validationErrors: (error as z.ZodError).errors, inputAttempt: requestBody });
    return NextResponse.json({ error: `Invalid input JSON: ${errorMessage}`, details: (error as z.ZodError).errors }, { status: 400 });
  }

  // Extract the core role/instructions for the system message - V10 lean version
  const systemMessageContent = `V10 – 3D Print Task Sequence Planner (JSON In/Out) – Y3DHub Optimization System

Role:
You are an AI service that plans 3D-print plates. You must output a JSON taskSequence that meets every constraint exactly—no exceptions, no dropped colours, no mixed SKUs.

Input:
A JSON object:
{
  "jobList": [
    { "id":string, "sku":string, "productName":string,
      "quantity":integer,
      "color1":string|null, "color2":string|null,
      "customText":string|null, …
    }, …
  ],
  "constraints": { "maxColorsPerTask":${inputJobs.constraints?.maxColorsPerTask ?? 4}, "maxTaskItems":${inputJobs.constraints?.maxTaskItems ?? 13} }
}
• Treat any null colour ('color1' or 'color2') as "no colour" and ignore it when counting.

Output:
Only a JSON object matching the 'plan_task_sequence' function schema:
{
  "taskSequence": {
    "metadata": { "totalJobs":…, "totalTasks":… },
    "tasks":[
      {
        "taskNumber":1…N,
        "colorsLoaded":[…],           // exactly the set of non-null colours in assignedJobs, ≤ ${inputJobs.constraints?.maxColorsPerTask ?? 4}
        "estimatedItemsOnPlate":int,   // sum of quantities
        "assignedJobs":[
          // Must match the function schema fields: sku, quantity, colorRequirements, id, personalizationText
          { "id":…, "sku":…, "quantity":…, "colorRequirements":{"color1": ..., "color2": ...}, "personalizationText":… },
          …
        ]
      },
      …
    ]
  }
}

Core Objectives (all HARD constraints):
1. Each task's 'colorsLoaded' = the union of its jobs' non-null 'color1' & 'color2', and |colorsLoaded| ≤ ${inputJobs.constraints?.maxColorsPerTask ?? 4}.  
2. Each task contains only one SKU.
3. 'estimatedItemsOnPlate' = sum of its jobs' quantities, and ≤ ${inputJobs.constraints?.maxTaskItems ?? 13}.
4. Every jobList entry appears exactly once in assignedJobs.
5. Minimise totalTasks.

Process:
1. For each new task plate, pick one SKU and only jobs of that SKU.
2. Add jobs until adding the next would either
   • exceed maxTaskItems (${inputJobs.constraints?.maxTaskItems ?? 13}), or
   • push the union of non-null colours above ${inputJobs.constraints?.maxColorsPerTask ?? 4}.
3. Finalise that task's
   • 'colorsLoaded' = computed union (non-null color1/color2),
   • 'estimatedItemsOnPlate' = summed quantities.
4. Repeat with remaining jobs until none remain.

FINAL VERIFICATION (FAIL-FAST):
If any of these fail, output exactly
ERROR: cannot satisfy constraints with given jobList
and no JSON taskSequence.
- Every jobList.id appears once.
- Each task's 'colorsLoaded' count ≤ ${inputJobs.constraints?.maxColorsPerTask ?? 4}.
- 'colorsLoaded' exactly matches its jobs' non-null colours (from colorRequirements).
- 'estimatedItemsOnPlate' equals sum of quantities.
- Each task has only one SKU.`;


  // Support for OpenAI API proxy (like LiteLLM) via environment variable
  const openai = new OpenAI({ 
    apiKey,
    baseURL: process.env.OPENAI_API_BASE_URL 
  });
  let response;
  try {
    console.log("Sending request to OpenAI with function call...");
    // Using model specified by user, but note it might not be standard
    const modelToUse = "gpt-4.1-mini";
    console.log(`Using model: ${modelToUse}`);

    response = await openai.chat.completions.create({
      model: modelToUse,
      messages: [
        { role: "system", content: systemMessageContent },
        // Pass the validated input job list - USER message not needed when forcing function call this way
        // { role: "user", content: JSON.stringify(inputJobs) }
      ],
      // Provide the function definition
      functions: [plannerFunctionSchema],
      // Forcing the function call for reliability
      function_call: { name: "plan_task_sequence" },
      temperature: 0, // Low temperature for deterministic output
      top_p: 1, // Usually keep top_p=1 when temp=0
      max_tokens: 6000, // User increased this
      presence_penalty: 0,
      frequency_penalty: 0,
    });

    // Log the raw response from OpenAI
    await logToFile({ type: 'output', data: response });

    console.log("Received response from OpenAI:", JSON.stringify(response, null, 2));

    const message = response.choices[0]?.message;

    // Check if the model decided to call the function
    if (message?.function_call?.name === 'plan_task_sequence') {
      const functionArgs = message.function_call.arguments;
      console.log("Function call requested:", functionArgs);

      // Check for the specific error string guardrail
      if (typeof functionArgs === 'string' && functionArgs.includes("ERROR: cannot satisfy constraints")) {
        console.error("AI returned constraint satisfaction error:", functionArgs);
        await logToFile({ type: 'error', message: 'AI constraint satisfaction error', errorString: functionArgs, rawResponse: response });
        // Return an appropriate error response to the client
        return NextResponse.json({ error: functionArgs }, { status: 500 });
      }

      try {
        const parsedJson = JSON.parse(functionArgs);
        // TODO: Add validation here using Zod against the expected output schema
        console.log("Successfully parsed function arguments.");
        // Return the structured JSON from the function arguments
        return NextResponse.json(parsedJson);
      } catch (parseError) {
        console.error("Failed to parse function arguments:", parseError);
        console.error("Raw function arguments string:", functionArgs);
        // Log parsing error details
        await logToFile({ type: 'error', message: 'Failed to parse function arguments', errorDetails: (parseError as Error).message, rawArgs: functionArgs, rawResponse: response });
        return NextResponse.json({
          error: 'Invalid JSON received in function arguments from AI.',
          rawArgs: functionArgs
        }, { status: 500 });
      }
    } else {
      // Handle cases where the function wasn't called
      console.warn("AI did not call the expected function. Response content:", message?.content);
      // Log unexpected response format
      await logToFile({ type: 'error', message: 'AI did not return the expected function call', rawResponse: response });
      return NextResponse.json({
        error: 'AI did not return the expected function call.',
        responseContent: message?.content ?? 'No content'
      }, { status: 500 });
    }

  } catch (err: unknown) {
    console.error('Error during OpenAI API call:', err);
    // Log the specific error message
    const errorMessage = (err instanceof Error) ? err.message : String(err);
    const errorStack = (err instanceof Error) ? err.stack : undefined;
    // Log the API call error
    await logToFile({ type: 'error', message: `OpenAI API error: ${errorMessage}`, errorDetails: errorMessage, stack: errorStack, rawInput: inputJobs });

    // Check for specific OpenAI errors if possible (e.g., invalid model)
    if (errorMessage.includes("model_not_found")) {
      // Use the actual model name tried in the error message
      return NextResponse.json({ error: `Model specified is not found or not accessible. Please check model availability. Details: ${errorMessage}` }, { status: 500 });
    }
    return NextResponse.json({ error: `OpenAI API error: ${errorMessage}` }, { status: 500 });
  }
}
