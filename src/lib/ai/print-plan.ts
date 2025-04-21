// import OpenAI from 'openai'; // Disabled OpenAI API calls

import { PrintTaskData } from '@/types/print-tasks';

export interface PrintPlan {
  plan: string;
  breakdown: Array<{
    plate: number;
    color1: string;
    color2?: string;
    tasks: Array<{ id: string; quantity: number; product: string }>;
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
  // OpenAI API call disabled - using mock data instead
  console.log('Using mock data for print plan instead of OpenAI API');

  // Group tasks by color for more realistic mock data
  const tasksByColor: Record<string, PrintTaskData[]> = {};

  tasks.forEach(task => {
    const colorKey = `${task.color_1 || 'none'}-${task.color_2 || 'none'}`;
    if (!tasksByColor[colorKey]) {
      tasksByColor[colorKey] = [];
    }
    tasksByColor[colorKey].push(task);
  });

  // Create mock plates based on color groups
  const mockBreakdown: PrintPlan['breakdown'] = [];
  const colorSequence: string[] = [];
  let plateNumber = 1;
  let totalTime = 0;

  Object.entries(tasksByColor).forEach(([colorKey, colorTasks]) => {
    const [color1, color2] = colorKey.split('-');
    if (!colorSequence.includes(color1) && color1 !== 'none') {
      colorSequence.push(color1);
    }

    // Split into plates of max 10 items
    const tasksPerPlate = 10;
    let remainingTasks = [...colorTasks];

    while (remainingTasks.length > 0) {
      const plateTasks = remainingTasks.splice(0, tasksPerPlate);
      const plateTime = plateTasks.reduce((sum, task) => sum + (task.quantity * 30), 0);
      totalTime += plateTime;

      mockBreakdown.push({
        plate: plateNumber++,
        color1: color1 === 'none' ? 'Black' : color1,
        ...(color2 !== 'none' && { color2 }),
        tasks: plateTasks.map(task => ({
          id: String(task.id),
          quantity: task.quantity,
          product: task.shorthandProductName || 'Unknown Product'
        })),
        estimated_time: plateTime,
        notes: `Auto-generated plate for ${plateTasks.length} tasks`
      });
    }
  });

  return {
    plan: `Print plan for ${tasks.length} tasks across ${mockBreakdown.length} plates`,
    breakdown: mockBreakdown,
    total_time: totalTime,
    total_plates: mockBreakdown.length,
    color_change_sequence: colorSequence.length > 0 ? colorSequence : ['Black']
  };
}
