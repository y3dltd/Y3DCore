/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { PrintTaskStatus } from '@prisma/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Select } from '@nextui-org/react';

// import { TaskTimeline } from './TaskTimeline'; // Temporarily commented out
import TaskPage from '@/components/planner/TaskPage';
import { PrintTaskCardProps } from '@/types/print-tasks';

// Define the structure of the job object as returned by the AI function call
interface AiAssignedJob {
  id: string;
  sku?: string | null; // SKU is now expected from AI
  quantity: number;
  // Colors are nested in colorRequirements
  colorRequirements?: {
    // Make optional as it might not always be present depending on AI/builder
    color1?: string | null;
    color2?: string | null;
  };
  // Include fields that might come from the server-side builder
  personalizationText?: string | null;
  customText?: string | null;
  color1?: string | null; // Allow flattened colors too
  color2?: string | null;
}

// Define the structure of a task (plate) from the AI output
interface AiTask {
  taskNumber: number;
  estimatedItemsOnPlate?: number;
  assignedJobs?: AiAssignedJob[];
  // colorsLoaded is also present in AI output, but we recalculate it
  colorsLoaded?: string[];
}

// Define expected metadata within a task sequence
interface PlanMetadata {
  totalTasks?: number;
  totalItems?: number;
  [key: string]: unknown; // Allow other unknown properties
}

// Define the structure of the original job data used as input
interface OriginalJobData {
  id: string;
  sku?: string | null;
  productName?: string | null;
  color1?: string | null;
  color2?: string | null;
  customText?: string | null;
  quantity?: number;
  [key: string]: unknown; // Allow other unknown properties
}

// Define the expected structure of the data from /api/planner/latest-run
interface LatestRunData {
  success: boolean;
  // taskSequence can be directly an array of tasks, or nested under outputJson or within an object with metadata
  taskSequence?: AiTask[] | { tasks?: AiTask[]; metadata?: PlanMetadata };
  outputJson?: {
    taskSequence?: AiTask[] | { tasks?: AiTask[]; metadata?: PlanMetadata };
    inputJson?: {
      jobList?: OriginalJobData[];
    };
  };
  // inputJson might also exist at the top level
  inputJson?: {
    jobList?: OriginalJobData[];
  };
  finishedAt?: string;
  metadata?: PlanMetadata; // Top-level metadata
  message?: string; // For potential success/error messages
  error?: string; // For potential error messages
}

// Type for the status map returned by the bulk-status API
type StatusMap = Record<string, PrintTaskStatus>;

// NEW: Define type for the details fetched from bulk-details endpoint
interface BulkTaskDetail {
  productName: string | null;
  sku: string | null;
}

/**
 * PlannerPage - Automatically fetch and optimize print tasks from the database
 * for efficient printing
 */
export default function PlannerPage(): React.ReactNode {
  const [optimizedTasks, setOptimizedTasks] = useState<PrintTaskCardProps[]>([]);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [optimizing, setOptimizing] = useState<boolean>(false);
  const [polling, setPolling] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    totalTasks: number;
    totalItems: number;
    pendingTasks: number;
    completedTasks: number;
    lastUpdated: string;
  }>({
    totalTasks: 0,
    totalItems: 0,
    pendingTasks: 0,
    completedTasks: 0,
    lastUpdated: new Date().toISOString(),
  });
  const [optimizingRunId, setOptimizingRunId] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [savedRuns, setSavedRuns] = useState<
    { id: string; finishedAt: string; reportType: string }[]
  >([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const startTimer = () => {
    setElapsedTime(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedTime(prevTime => prevTime + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      setPolling(false);
      setOptimizingRunId(null);
    }
  }, []);

  useEffect(() => {
    // Cleanup timers on unmount
    return () => {
      stopTimer();
      stopPolling();
    };
  }, [stopPolling]);

  const transformOptimizedTasks = useCallback(
    (
      tasks: AiTask[],
      originalJobList: OriginalJobData[] = [],
      currentStatusMap: StatusMap, // New argument for current statuses
      freshDetailsMap: Map<string, BulkTaskDetail> // Use defined type
    ): PrintTaskCardProps[] => {
      // console.log(
      //   '[transformOptimizedTasks] Received tasks array input:\n',
      //   JSON.stringify(tasks, null, 2).substring(0, 500) + '...'
      // );
      // console.log(
      //   '[transformOptimizedTasks] Received originalJobList for lookup:\n',
      //   JSON.stringify(originalJobList, null, 2).substring(0, 500) + '...'
      // );
      // console.log(
      //   '[transformOptimizedTasks] Received currentStatusMap:\n',
      //   JSON.stringify(currentStatusMap, null, 2).substring(0, 500) + '...'
      // );

      if (!tasks || !Array.isArray(tasks)) {
        console.warn(
          '[transformOptimizedTasks] Invalid or empty tasks array received. Returning empty array.'
        );
        return [];
      }

      // Build a map from original job list for fallback details
      const jobDetailsMap = new Map(originalJobList.map(job => [job.id, job]));

      const mappedTasks = tasks.map(task => {
        const items = (task.assignedJobs || []).map(aiJob => {
          const id = aiJob.id || 'Unknown ID';
          const originalJobDetails = jobDetailsMap.get(id);
          const freshDetails = freshDetailsMap.get(id);

          // Get current status from the map, default to pending if somehow missing
          const currentStatus = currentStatusMap[id] || PrintTaskStatus.pending;

          // Prioritize fresh details, then fallback to original snapshot, then AI, then placeholder
          const sku = freshDetails?.sku || originalJobDetails?.sku || aiJob.sku || 'SKU Not Found';
          const productName =
            freshDetails?.productName || originalJobDetails?.productName || 'Unknown Product'; // No fallback to SKU here
          const quantity = aiJob.quantity;
          const color1 = aiJob.color1 || originalJobDetails?.color1 || null;
          const color2 = aiJob.color2 || originalJobDetails?.color2 || null;
          const customText = aiJob.customText || originalJobDetails?.customText || null;

          const mappedItem = {
            name: id, // This is the PrintOrderTask ID
            quantity: quantity,
            sku: sku,
            productName: productName,
            customText: customText,
            color1: color1,
            color2: color2,
            status: currentStatus, // Use the current status
          };
          return mappedItem;
        });

        const calculatedColors = new Set<string>();
        items.forEach(item => {
          if (item.color1) calculatedColors.add(item.color1);
          if (item.color2) calculatedColors.add(item.color2);
        });
        const colorsLoadedArray = Array.from(calculatedColors).sort();

        const mappedTaskData = {
          taskId: String(task.taskNumber),
          orderId: 'Optimized Batch',
          status: PrintTaskStatus.pending, // Overall plate status is less relevant now
          items: items,
          colorsLoaded: colorsLoadedArray,
        };
        return mappedTaskData;
      });
      return mappedTasks;
    },
    []
  );

  // Effect to load data ONLY on initial mount - Simplified
  // Define loadLatestPlan with proper dependencies
  const loadLatestPlan = useCallback(
    async (showLoading = true) => {
      if (showLoading) setInitialLoading(true);
      setError(null);
      console.log('[PlannerPage] Loading latest plan...');

      let runData: LatestRunData | null = null; // Use the defined interface

      try {
        // Step 1: Fetch the latest run structure and original input data
        const runResponse = await fetch('/api/planner/latest-run');
        const runRawResponseText = await runResponse.text();

        if (!runResponse.ok) {
          let errorBody = 'Failed to load latest plan structure';
          try {
            // Try to parse as Partial<LatestRunData> to get error message
            const errorData = JSON.parse(runRawResponseText) as Partial<LatestRunData>;
            errorBody = errorData.message || errorData.error || runResponse.statusText;
          } catch (e) {
            // Ignore JSON parse errors and continue with default error message
          }
          throw new Error(`${runResponse.status} ${errorBody}`);
        }

        // Parse the response and assert the type
        runData = JSON.parse(runRawResponseText) as LatestRunData;
        // console.log(
        //   '[PlannerPage] Parsed data from /api/planner/latest-run:\n',
        //   JSON.stringify(runData, null, 2)
        // );

        const taskSequenceSource = runData.taskSequence || runData.outputJson?.taskSequence;

        if (!runData.success || !taskSequenceSource) {
          // Use the error message from the response if available
          throw new Error(
            runData.message ||
              runData.error ||
              'No valid planner history or task sequence found in latest run data.'
          );
        }

        // Step 2: Extract Task IDs from the original input job list
        // Safely access nested jobList using optional chaining and nullish coalescing
        const originalJobListForRun: OriginalJobData[] =
          runData.outputJson?.inputJson?.jobList ?? runData.inputJson?.jobList ?? [];

        const taskIds = originalJobListForRun.map(job => job.id).filter(Boolean);

        if (taskIds.length === 0) {
          console.log('[PlannerPage] No task IDs found in the latest run, displaying empty.');
          setOptimizedTasks([]);
          setStats({
            totalTasks: 0,
            totalItems: 0,
            pendingTasks: 0,
            completedTasks: 0,
            lastUpdated: runData.finishedAt || new Date().toISOString(),
          });
          return; // Exit early if no tasks
        }

        // Step 3: Fetch current statuses AND fresh product details for these Task IDs
        console.log(
          `[PlannerPage] Fetching current statuses & details for ${taskIds.length} task IDs...`
        );

        const [statusResponse, freshDetailsResponse] = await Promise.all([
          fetch(`/api/print-tasks/bulk-status?ids=${taskIds.join(',')}`),
          fetch(`/api/print-tasks/bulk-details?ids=${taskIds.join(',')}`), // NEW API CALL
        ]);

        // Check status response
        if (!statusResponse.ok) {
          throw new Error(`Failed to fetch bulk statuses: ${statusResponse.statusText}`);
        }
        const statusData = await statusResponse.json();
        if (!statusData.success || !statusData.statuses) {
          throw new Error(
            statusData.error || 'Failed to get valid status data from bulk endpoint.'
          );
        }
        const currentStatusMap: StatusMap = statusData.statuses;

        // Check details response (NEW)
        if (!freshDetailsResponse.ok) {
          // Log warning but continue, we can fallback to snapshot data
          console.warn(
            `[PlannerPage] Failed to fetch bulk details: ${freshDetailsResponse.statusText}. Will use snapshot data.`
          );
        }
        let freshDetailsMap = new Map<string, BulkTaskDetail>(); // Use defined type
        try {
          const detailsData = await freshDetailsResponse.json();
          if (detailsData.success && detailsData.details) {
            freshDetailsMap = new Map(
              // Cast detail to BulkTaskDetail after getting entries
              Object.entries(detailsData.details).map(([id, detail]) => {
                const taskDetail = detail as BulkTaskDetail; // Explicit cast
                return [
                  id,
                  { productName: taskDetail.productName ?? null, sku: taskDetail.sku ?? null },
                ];
              })
            );
          } else {
            console.warn(
              `[PlannerPage] Bulk details endpoint response invalid or empty. Will use snapshot data. Error: ${detailsData.error}`
            );
          }
        } catch (detailsError) {
          console.warn(
            `[PlannerPage] Error parsing bulk details response. Will use snapshot data. Error: ${detailsError instanceof Error ? detailsError.message : String(detailsError)}`
          );
        }
        // console.log('[PlannerPage] Received freshDetailsMap:', freshDetailsMap);

        // Step 4: Transform the tasks using the current statuses and fresh details
        let tasksToTransform: AiTask[] | null = null;
        const sequenceData = taskSequenceSource as unknown;
        let taskMetadata: PlanMetadata = {}; // Initialize metadata object

        if (Array.isArray(sequenceData)) {
          tasksToTransform = sequenceData as AiTask[];
        } else if (
          sequenceData &&
          typeof sequenceData === 'object' &&
          'tasks' in sequenceData &&
          Array.isArray(sequenceData.tasks)
        ) {
          tasksToTransform = sequenceData.tasks as AiTask[];
          // Extract metadata if the sequenceData is an object containing tasks and metadata
          if (
            'metadata' in sequenceData &&
            typeof sequenceData.metadata === 'object' &&
            sequenceData.metadata !== null
          ) {
            taskMetadata = sequenceData.metadata as PlanMetadata;
          }
        } else {
          throw new Error('Invalid task sequence format in run data.');
        }

        if (tasksToTransform) {
          const optimizedTasksData = transformOptimizedTasks(
            tasksToTransform,
            originalJobListForRun, // Pass original details (snapshot)
            currentStatusMap, // Pass current statuses
            freshDetailsMap // Pass fresh details map
          );
          setOptimizedTasks(optimizedTasksData); // Update state

          // Calculate stats based on FRESH statuses
          const totalItems = optimizedTasksData.reduce(
            (sum, plate) => sum + plate.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
            0
          );
          const totalTasks = optimizedTasksData.length;
          // Calculate statistics for task counts
          // Note: We track these separately but don't use them in the UI yet
          // const totalItemsInPlan = optimizedTasksData.reduce(
          //   (sum, task) => sum + task.items.length,
          //   0
          // );
          // // Use the currentStatusMap for accurate counts
          // const completedItemsCount = taskIds.filter(
          //   (id: string) => currentStatusMap[id] === PrintTaskStatus.completed
          // ).length;
          // const pendingItemsCount = taskIds.filter(
          //   (id: string) => currentStatusMap[id] === PrintTaskStatus.pending
          // ).length;
          // const inProgressItemsCount = taskIds.filter(
          //   (id: string) => currentStatusMap[id] === PrintTaskStatus.in_progress
          // ).length;

          // Note: The stats below might differ slightly if the total number of *items* (considering quantity)
          // is desired instead of the number of task *entries*. We'll stick to task entries count for now.
          // completedTasks should probably reflect completed *entries*.
          const completedTaskEntriesCount = optimizedTasksData.reduce(
            (sum, task) =>
              sum + task.items.filter(item => item.status === PrintTaskStatus.completed).length,
            0
          );
          const pendingTaskEntriesCount = optimizedTasksData.reduce(
            (sum, task) =>
              sum + task.items.filter(item => item.status === PrintTaskStatus.pending).length,
            0
          );

          // Combine metadata from different possible locations
          const combinedMetadata: PlanMetadata = {
            ...(runData.metadata ?? {}), // Top-level metadata from runData
            ...taskMetadata, // Metadata from nested taskSequence object (takes precedence)
          };

          setStats({
            totalTasks: Number(combinedMetadata?.totalTasks ?? totalTasks),
            totalItems: Number(combinedMetadata?.totalItems ?? totalItems), // Use combined, prefer specific
            pendingTasks: pendingTaskEntriesCount, // Based on task entries
            completedTasks: completedTaskEntriesCount, // Based on task entries
            lastUpdated: runData.finishedAt || new Date().toISOString(),
          });
        } else {
          console.warn('[PlannerPage] No valid tasks array found after processing.');
          setError('No valid tasks array found after processing run data.');
          setOptimizedTasks([]);
        }
      } catch (err) {
        setError(`Error loading latest plan: ${(err as Error).message}`);
        console.error('Error fetching/processing latest plan:', err);
        // Optionally clear tasks or keep stale ones on error? Clear for now.
        setOptimizedTasks([]);
        setStats({
          totalTasks: 0,
          totalItems: 0,
          pendingTasks: 0,
          completedTasks: 0,
          lastUpdated: runData?.finishedAt || new Date().toISOString(), // Use fetched time if available
        });
      } finally {
        if (showLoading) setInitialLoading(false);
        console.log('[PlannerPage] Load latest plan complete.');
      }
    },
    [transformOptimizedTasks] // Add transformOptimizedTasks as a dependency
  );

  // Load data on initial mount
  useEffect(() => {
    console.log('[PlannerPage] Initial mount: Loading latest plan...');
    loadLatestPlan(true); // Pass true to indicate initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array: Run only once on mount

  const pollOptimizationStatus = useCallback(
    async (runId: string | null) => {
      try {
        if (!runId) {
          console.warn('[PlannerPage] pollOptimizationStatus called with null runId.');
          stopPolling();
          stopTimer();
          setOptimizing(false);
          return;
        }
        const response = await fetch(`/api/ai/reports/runs/${runId}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch run status: ${response.statusText}`);
        }
        const data = await response.json();

        if (data.success) {
          const runStatus = data.run.status;
          if (runStatus === 'success') {
            console.log(`[PlannerPage] Optimization run ${runId} succeeded.`);
            stopPolling();
            stopTimer();
            setOptimizing(false);
            await loadLatestPlan(false); // Refresh data using the updated function
          } else if (runStatus === 'error') {
            console.error(`[PlannerPage] Optimization run ${runId} failed.`);
            stopPolling();
            stopTimer();
            setOptimizing(false);
            setError(data.run.errorMsg || 'Optimization run failed.');
          } else {
            // Status is still in-progress or another state
            console.log(
              `[PlannerPage] Optimization run ${runId} status: ${runStatus}. Continuing poll.`
            );
          }
        } else {
          throw new Error(data.error || 'Failed to get valid run status response.');
        }
      } catch (err) {
        console.error('Error polling optimization status:', err);
        setError(`Error checking optimization status for run ${runId}: ${(err as Error).message}`);
        stopPolling();
        stopTimer();
        setOptimizing(false);
      }
    },
    [loadLatestPlan, stopPolling, stopTimer] // Now depends on the recreated loadLatestPlan
  );

  const runNewOptimization = async () => {
    if (optimizing || polling) return;

    setOptimizing(true);
    setPolling(false); // Stop any previous polling just in case
    setError(null);
    startTimer();
    setOptimizingRunId(null);

    try {
      // Use POST for triggering optimization
      const response = await fetch('/api/print-tasks/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        let errorBody = 'Failed to start optimization';
        try {
          const errorData = await response.json();
          errorBody = errorData.error || response.statusText;
        } catch {}
        throw new Error(`${response.status} ${errorBody}`);
      }

      const data = await response.json();
      console.log('[PlannerPage] Start Optimization Response:', data);

      if (data.success && data.runId) {
        console.log(`[PlannerPage] Optimization started. Run ID: ${data.runId}. Starting polling.`);
        setOptimizingRunId(data.runId);
        setPolling(true);
        if (pollRef.current) clearInterval(pollRef.current); // Clear previous interval if any
        // Start polling immediately
        pollOptimizationStatus(data.runId); // Initial check
        pollRef.current = setInterval(() => pollOptimizationStatus(data.runId), 5000); // Subsequent checks
      } else if (data.success && data.taskSequence) {
        // Handle immediate completion case (e.g., no tasks to optimize or very fast run)
        console.log('[PlannerPage] Optimization finished immediately (or no tasks found).');
        stopTimer();
        setOptimizing(false);
        // Load the result (even if it's empty)
        await loadLatestPlan(false);
      } else {
        // Handle case where API call succeeded but didn't return runId or taskSequence
        throw new Error(
          data.error || 'Optimization endpoint returned success but no run ID or immediate result.'
        );
      }
    } catch (err) {
      setError(`Error starting optimization: ${(err as Error).message}`);
      console.error('Error starting new optimization:', err);
      stopTimer();
      setOptimizing(false);
      setPolling(false); // Ensure polling stops on error
      setOptimizingRunId(null);
      if (pollRef.current) clearInterval(pollRef.current); // Clear interval on error
    }
  };

  const runTodayOptimization = async () => {
    if (optimizing || polling) return;

    setOptimizing(true);
    setPolling(false);
    setError(null);
    startTimer();
    setOptimizingRunId(null);

    try {
      // Use POST with a filter parameter for shipping date (today only)
      const response = await fetch('/api/print-tasks/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterDays: 1 }), // Only today
      });

      if (!response.ok) {
        let errorBody = 'Failed to start optimization';
        try {
          const errorData = await response.json();
          errorBody = errorData.error || response.statusText;
        } catch {}
        throw new Error(`${response.status} ${errorBody}`);
      }

      const data = await response.json();
      console.log('[PlannerPage] Start Today Optimization Response:', data);

      if (data.success && data.runId) {
        console.log(
          `[PlannerPage] Today optimization started. Run ID: ${data.runId}. Starting polling.`
        );
        setOptimizingRunId(data.runId);
        setPolling(true);
        if (pollRef.current) clearInterval(pollRef.current);
        pollOptimizationStatus(data.runId);
        pollRef.current = setInterval(() => pollOptimizationStatus(data.runId), 5000);
      } else if (data.success && data.taskSequence) {
        console.log('[PlannerPage] Today optimization finished immediately.');
        stopTimer();
        setOptimizing(false);
        await loadLatestPlan(false);
      } else {
        throw new Error(
          data.error || 'Today optimization returned success but no run ID or result.'
        );
      }
    } catch (err) {
      setError(`Error starting today optimization: ${(err as Error).message}`);
      console.error('Error starting today optimization:', err);
      stopTimer();
      setOptimizing(false);
      setPolling(false);
      setOptimizingRunId(null);
      if (pollRef.current) clearInterval(pollRef.current);
    }
  };

  const runTodayTomorrowOptimization = async () => {
    if (optimizing || polling) return;

    setOptimizing(true);
    setPolling(false);
    setError(null);
    startTimer();
    setOptimizingRunId(null);

    try {
      // Use POST with a filter parameter for shipping dates (today + tomorrow)
      const response = await fetch('/api/print-tasks/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterDays: 2 }), // Today & tomorrow
      });

      if (!response.ok) {
        let errorBody = 'Failed to start optimization';
        try {
          const errorData = await response.json();
          errorBody = errorData.error || response.statusText;
        } catch {}
        throw new Error(`${response.status} ${errorBody}`);
      }

      const data = await response.json();
      console.log('[PlannerPage] Start Today/Tomorrow Optimization Response:', data);

      if (data.success && data.runId) {
        console.log(
          `[PlannerPage] Today/Tomorrow optimization started. Run ID: ${data.runId}. Starting polling.`
        );
        setOptimizingRunId(data.runId);
        setPolling(true);
        if (pollRef.current) clearInterval(pollRef.current);
        pollOptimizationStatus(data.runId);
        pollRef.current = setInterval(() => pollOptimizationStatus(data.runId), 5000);
      } else if (data.success && data.taskSequence) {
        console.log('[PlannerPage] Today/Tomorrow optimization finished immediately.');
        stopTimer();
        setOptimizing(false);
        await loadLatestPlan(false);
      } else {
        throw new Error(
          data.error || 'Today/Tomorrow optimization returned success but no run ID or result.'
        );
      }
    } catch (err) {
      setError(`Error starting today/tomorrow optimization: ${(err as Error).message}`);
      console.error('Error starting today/tomorrow optimization:', err);
      stopTimer();
      setOptimizing(false);
      setPolling(false);
      setOptimizingRunId(null);
      if (pollRef.current) clearInterval(pollRef.current);
    }
  };

  // New function for tomorrow only optimization
  const runTomorrowOptimization = async () => {
    if (optimizing || polling) return;

    setOptimizing(true);
    setPolling(false);
    setError(null);
    startTimer();
    setOptimizingRunId(null);

    try {
      // Use POST with a filter parameter for tomorrow only
      const response = await fetch('/api/print-tasks/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterDays: 1, dayOffset: 1 }), // Tomorrow only with offset
      });

      if (!response.ok) {
        let errorBody = 'Failed to start optimization';
        try {
          const errorData = await response.json();
          errorBody = errorData.error || response.statusText;
        } catch {}
        throw new Error(`${response.status} ${errorBody}`);
      }

      const data = await response.json();
      console.log('[PlannerPage] Start Tomorrow Optimization Response:', data);

      if (data.success && data.runId) {
        console.log(
          `[PlannerPage] Tomorrow optimization started. Run ID: ${data.runId}. Starting polling.`
        );
        setOptimizingRunId(data.runId);
        setPolling(true);
        if (pollRef.current) clearInterval(pollRef.current);
        pollOptimizationStatus(data.runId);
        pollRef.current = setInterval(() => pollOptimizationStatus(data.runId), 5000);
      } else if (data.success && data.taskSequence) {
        console.log('[PlannerPage] Tomorrow optimization finished immediately.');
        stopTimer();
        setOptimizing(false);
        await loadLatestPlan(false);
      } else {
        throw new Error(
          data.error || 'Tomorrow optimization returned success but no run ID or result.'
        );
      }
    } catch (err) {
      setError(`Error starting tomorrow optimization: ${(err as Error).message}`);
      console.error('Error starting tomorrow optimization:', err);
      stopTimer();
      setOptimizing(false);
      setPolling(false);
      setOptimizingRunId(null);
      if (pollRef.current) clearInterval(pollRef.current);
    }
  };

  // New function for small orders optimization
  const runSmallOrdersOptimization = async () => {
    if (optimizing || polling) return;

    setOptimizing(true);
    setPolling(false);
    setError(null);
    startTimer();
    setOptimizingRunId(null);

    try {
      // Use POST with a filter parameter for small orders (qty <= 2)
      const response = await fetch('/api/print-tasks/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxQuantity: 2 }), // Small orders only
      });

      if (!response.ok) {
        let errorBody = 'Failed to start optimization';
        try {
          const errorData = await response.json();
          errorBody = errorData.error || response.statusText;
        } catch {}
        throw new Error(`${response.status} ${errorBody}`);
      }

      const data = await response.json();
      console.log('[PlannerPage] Start Small Orders Optimization Response:', data);

      if (data.success && data.runId) {
        console.log(
          `[PlannerPage] Small Orders optimization started. Run ID: ${data.runId}. Starting polling.`
        );
        setOptimizingRunId(data.runId);
        setPolling(true);
        if (pollRef.current) clearInterval(pollRef.current);
        pollOptimizationStatus(data.runId);
        pollRef.current = setInterval(() => pollOptimizationStatus(data.runId), 5000);
      } else if (data.success && data.taskSequence) {
        console.log('[PlannerPage] Small Orders optimization finished immediately.');
        stopTimer();
        setOptimizing(false);
        await loadLatestPlan(false);
      } else {
        throw new Error(
          data.error || 'Small Orders optimization returned success but no run ID or result.'
        );
      }
    } catch (err) {
      setError(`Error starting small orders optimization: ${(err as Error).message}`);
      console.error('Error starting small orders optimization:', err);
      stopTimer();
      setOptimizing(false);
      setPolling(false);
      setOptimizingRunId(null);
      if (pollRef.current) clearInterval(pollRef.current);
    }
  };

  // fetch recent runs once
  useEffect(() => {
    fetch('/api/ai/reports/runs?reportId=planner')
      .then(r => r.json())
      .then(json => {
        const runsWithTypes = (json.runs || []).map(
          (run: { id: string; finishedAt: string; reportType?: string }) => ({
            id: run.id,
            finishedAt: run.finishedAt,
            reportType: run.reportType || 'Unknown',
          })
        );
        setSavedRuns(runsWithTypes.slice(0, 10));
      })
      .catch(console.error);
  }, []);

  // when dropdown changes load that plan
  useEffect(() => {
    if (!selectedRunId) return;
    (async () => {
      try {
        setInitialLoading(true);
        const res = await fetch(`/api/ai/reports/runs/${selectedRunId}`);
        const data = await res.json();
        if (data.success && data.run.outputJson) {
          const parsed = JSON.parse(data.run.outputJson);
          // reuse transform logic
          if (Array.isArray(parsed.taskSequence)) {
            const transformed = transformOptimizedTasks(
              parsed.taskSequence,
              parsed.inputJson?.jobList ?? [],
              {},
              new Map()
            );
            setOptimizedTasks(transformed);
          }
        }
      } finally {
        setInitialLoading(false);
      }
    })();
  }, [selectedRunId, transformOptimizedTasks]);

  return (
    <TaskPage
      tasks={optimizedTasks}
      stats={stats}
      isLoading={initialLoading}
      isOptimizing={optimizing || polling}
      optimizingElapsedTime={elapsedTime}
      error={error}
      onRefresh={() => loadLatestPlan(false)} // Refresh without initial loading indicator
      onGeneratePlan={runNewOptimization}
      onGenerateTodayPlan={runTodayOptimization}
      onGenerateTodayTomorrowPlan={runTodayTomorrowOptimization}
      onGenerateTomorrowPlan={runTomorrowOptimization}
      onGenerateSmallOrdersPlan={runSmallOrdersOptimization}
      setTasks={setOptimizedTasks} // Pass down the state setter
      setError={setError} // Pass down the state setter
      recentRuns={savedRuns}
      selectedRunId={selectedRunId}
      onSelectRun={setSelectedRunId}
    />
  );
}
