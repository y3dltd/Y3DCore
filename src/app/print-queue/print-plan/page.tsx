import { PrintTaskData } from '@/types/print-tasks';
import { prisma } from '@/lib/prisma';
import { PrintTaskStatus, Prisma } from '@prisma/client';
import { getPrintPlan } from '@/lib/ai/print-plan';

// Define the type returned by the specific prisma query
type FetchedTask = Prisma.PrintOrderTaskGetPayload<{
  include: {
    product: true;
    order: true;
  };
}>;

export default async function PrintPlanPage() {
  // Fetch tasks as in main print queue page (pseudo-code, adapt as needed)
  const tasks: FetchedTask[] = await getPrintPlanTasks();

  // Ensure tasks is an array before proceeding
  if (!Array.isArray(tasks)) {
    console.error('Tasks fetched for print plan is not an array:', tasks);
    return <div>Error loading print plan tasks.</div>;
  }

  // Explicitly assert type to resolve potential mismatch between inferred FetchedTask and PrintTaskData
  const plan = await getPrintPlan(tasks as PrintTaskData[]);

  return (
    <div className="max-w-5xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-900">AI-Generated Print Plan</h1>
      <div className="rounded shadow-md bg-gradient-to-r from-indigo-200 to-pink-200 p-6">
        <pre className="overflow-x-auto text-xs text-gray-900">
          {plan ? JSON.stringify(plan, null, 2) : 'No plan generated.'}
        </pre>
      </div>
    </div>
  );
}

// Fetch tasks for the print plan (e.g., pending and in_progress)
async function getPrintPlanTasks(): Promise<FetchedTask[]> {
  const tasks = await prisma.printOrderTask.findMany({
    where: {
      status: {
        in: [PrintTaskStatus.pending, PrintTaskStatus.in_progress],
      },
    },
    include: {
      product: true,
      order: true,
    },
    orderBy: [
      {
        ship_by_date: 'asc', // Prioritize by ship_by_date
      },
      {
        created_at: 'asc', // Then by creation date
      },
    ],
  });

  // Filter out tasks without a product
  const filteredTasks: FetchedTask[] = tasks
    .filter((task: FetchedTask): task is FetchedTask & { product: NonNullable<FetchedTask['product']> } => !!task.product);

  return filteredTasks;
}
