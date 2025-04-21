// import OpenAI from 'openai'; // Disabled OpenAI API calls

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

export async function getPrintQueueSummary(
  tasks: PrintQueueTaskInput[]
): Promise<PrintQueueSummaryData | null> {
  // OpenAI API call disabled - using mock data instead
  console.log('Using mock data for print queue summary instead of OpenAI API');

  // Calculate some basic metrics from the tasks to make the mock data somewhat relevant
  const totalTasks = tasks.reduce((sum, task) => sum + task.qty, 0);

  // Get unique colors
  const uniqueColors = new Set<string>();
  tasks.forEach(task => {
    if (task.color1) uniqueColors.add(task.color1);
    if (task.color2) uniqueColors.add(task.color2);
  });

  // Simple logic for plates (10 items per plate)
  const platesNeeded = Math.ceil(totalTasks / 10);

  // Mock data that somewhat reflects the actual tasks
  return {
    total_print_tasks: totalTasks,
    distinct_colors: uniqueColors.size,
    plates_needed: platesNeeded,
    total_print_time: totalTasks * 30, // 30 minutes per task
    estimated_color_changes: Math.min(uniqueColors.size * 2, platesNeeded + 2) // Simple estimate
  };
}
