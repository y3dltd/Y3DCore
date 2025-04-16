import { getPrintQueueSummary, PrintQueueSummaryData } from "@/lib/ai/print-queue-summary";
import { PrintQueueSummary } from "@/components/print-queue-summary";
import { PrintTaskData } from "@/components/print-queue-table";

interface Props {
  tasks: PrintTaskData[];
}

export default async function PrintQueueSummaryServer({ tasks }: Props) {
  // Transform tasks to the format expected by getPrintQueueSummary
  const taskInputs = tasks.map((task) => ({
    id: String(task.id),
    qty: task.quantity || 1,
    color1: task.color_1 ?? '',
    color2: task.color_2 || undefined,
  }));

  let summary: PrintQueueSummaryData | null = null;
  try {
    summary = await getPrintQueueSummary(taskInputs);
  } catch {
    summary = null;
  }

  if (!summary) {
    return null;
  }

  return <PrintQueueSummary summary={summary} />;
}
