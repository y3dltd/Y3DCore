import OpenAI from "openai";

export interface PrintQueueTaskInput {
  id: string;
  qty: number;
  color1: string;
  color2?: string;
}

export interface PrintQueueSummaryData {
  total_print_tasks: number;
  distinct_colors: number;
  plates_needed: number;
  total_print_time: number;
  estimated_color_changes: number;
}

const SYSTEM_PROMPT = `You are a 3D-print scheduling assistant.\nI have the following list of tasks in JSON format (each task may have 1 or 2 colors, plus a quantity):\n\nTASKS_JSON:\n[...tasks...]\n\nPlease:\n- Calculate total_print_tasks (sum of all quantities).\n- Determine how many distinct colors are required in total.\n- Estimate the number of print plates needed. (You can assume each plate can handle up to 10 keychains if they share colors, but use your own logic to keep color changes minimal.)\n- Provide an approximate total_print_time in minutes (make up a simple logic, e.g. “each keychain = 30 minutes, then consolidated if they share a plate”).\n- Estimate total_color_changes (a rough guess based on grouping by color).\n\nReturn ONLY valid JSON with these 5 keys:\n{\n  "total_print_tasks": number,\n  "distinct_colors": number,\n  "plates_needed": number,\n  "total_print_time": number,\n  "estimated_color_changes": number\n}\nNo extra text or explanation outside the JSON.`;

export async function getPrintQueueSummary(tasks: PrintQueueTaskInput[]): Promise<PrintQueueSummaryData | null> {
  if (!process.env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY in environment");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const userPrompt = SYSTEM_PROMPT.replace("[...tasks...]", JSON.stringify(tasks, null, 2));

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 256,
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
