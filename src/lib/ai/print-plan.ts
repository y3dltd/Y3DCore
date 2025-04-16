import OpenAI from "openai";
import { PrintTaskData } from "@/components/print-queue-table";

export interface PrintPlan {
  plan: string;
  breakdown: Array<{
    plate: number;
    color1: string;
    color2?: string;
    tasks: Array<{ id: string; quantity: number; product: string; }>
    estimated_time: number;
    notes?: string;
  }>;
  total_time: number;
  total_plates: number;
  color_change_sequence: string[];
}

const COMPLEX_PLAN_PROMPT = `You are an expert 3D print planner for a busy print farm. You will be given a list of print tasks, each with quantity, color(s), and product info. Your job is to create an efficient, step-by-step print plan that minimizes color changes and plate swaps, while grouping compatible tasks together.

Instructions:
- Analyze the provided TASKS_JSON (array of print tasks).
- Group tasks into "plates". Each plate can print up to 10 items, but only if they share the same color(s).
- Try to minimize color changes by grouping similar colors together in sequence.
- For each plate, specify: plate number, color(s), which tasks are included (id, quantity, product), and estimated print time (assume 30 minutes per item, but allow for consolidation if plates are full).
- Output a detailed breakdown for each plate, a total estimated print time, the total number of plates, and the order of color changes required.
- If you make assumptions, note them in a 'notes' field for each plate.
- Output only valid JSON in the following format:
{
  "plan": "A brief summary of the print plan.",
  "breakdown": [
    {
      "plate": number,
      "color1": string,
      "color2"?: string,
      "tasks": [ { "id": string, "quantity": number, "product": string } ],
      "estimated_time": number,
      "notes"?: string
    }, ...
  ],
  "total_time": number,
  "total_plates": number,
  "color_change_sequence": [string, ...]
}
NO extra text, only JSON.`;

export async function getPrintPlan(tasks: PrintTaskData[]): Promise<PrintPlan | null> {
  if (!process.env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY in environment");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const userPrompt = COMPLEX_PLAN_PROMPT.replace("TASKS_JSON", JSON.stringify(tasks, null, 2));

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 1024,
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) return null;

  try {
    // Remove possible code fences
    const json = content.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(json);
  } catch {
    return null;
  }
}
