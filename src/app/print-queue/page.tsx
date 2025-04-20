// Remove unused imports
// import { PrintOrderTask, PrintTaskStatus } from '@prisma/client';
import { PrintTaskStatus, Prisma } from '@prisma/client'; // Import enum and Prisma namespace

// Unused imports removed:
// import { AutoRefresher } from '@/components/auto-refresher';
// import { LimitSelector } from '@/components/limit-selector';
// import { OrdersPagination } from '@/components/orders-pagination';
// import { PrintQueueFilters } from '@/components/print-queue-filters';
// import { PrintQueueHeader } from '@/components/print-queue-header';
import { ClientPrintTaskData } from '@/types/print-tasks'; // Import the new client-safe type
// import { PrintQueueTaskTotals } from '@/components/print-queue-task-totals';
// import { cleanShippedOrderTasks } from '@/lib/actions/print-queue-actions';
import { detectMarketplaceOrderNumber } from '@/lib/order-utils'; // Import order number detection
import { prisma } from '@/lib/prisma';

// import PrintQueueSummaryServer from './PrintQueueSummaryServer';
import PrintQueueClient from './PrintQueueClient'; // Import the new client component

// Restore dynamic rendering
export const dynamic = 'force-dynamic';

// Function to get distinct product names linked to tasks
async function getDistinctProductNamesForTasks(): Promise<string[]> {
  try {
    const products = await prisma.product.findMany({
      where: {
        // Only include products that are actually linked to print tasks
        printTasks: {
          some: {},
        },
        // Ensure name is not null or empty (simplifying check)
        name: {
          not: '', // Primarily check for non-empty string
        },
      },
      select: {
        name: true,
      },
      distinct: ['name'],
      orderBy: {
        name: 'asc',
      },
    });
    // Extract names, filter out any potential nulls/empties just in case
    return products.map(p => p.name).filter(Boolean) as string[];
  } catch (error) {
    console.error('Error fetching distinct product names:', error);
    return []; // Return empty array on error
  }
}

// --- Add Interface for Search Params ---
// Export the interface so Client component can use it
export interface PrintQueuePageSearchParams {
  page?: string;
  limit?: string;
  status?: string; // Changed from PrintTaskStatus to string for easier validation
  needsReview?: string; // Changed from boolean to string
  query?: string;
  shipByDateStart?: string;
  shipByDateEnd?: string;
  color1?: string;
  color2?: string;
  productName?: string;
  shippingMethod?: string;
}
// --- End Interface ---

// --- Refactored getPrintTasks ---
// Accepts validated, individual parameters
async function getPrintTasks({
  validatedPage,
  validatedLimit,
  validatedStatus,
  validatedNeedsReview,
  validatedQuery,
  validatedShipByDateStart,
  validatedShipByDateEnd,
  validatedColor1,
  validatedColor2,
  validatedProductName,
  validatedShippingMethod,
}: {
  validatedPage: number;
  validatedLimit: number;
  validatedStatus: PrintTaskStatus | 'all' | 'active';
  validatedNeedsReview: 'yes' | 'no' | 'all';
  validatedQuery: string;
  validatedShipByDateStart?: string;
  validatedShipByDateEnd?: string;
  validatedColor1?: string;
  validatedColor2?: string;
  validatedProductName?: string;
  validatedShippingMethod?: string;
}): Promise<{ tasks: ClientPrintTaskData[]; total: number }> { // Update return type annotation
  // --- No more validation or getQueryParam needed here ---

  const skip = Math.max(0, (validatedPage - 1) * validatedLimit);
  const whereClause: Prisma.PrintOrderTaskWhereInput = {};

  // Status filter
  if (validatedStatus === 'active') {
    // Show only pending and in_progress tasks
    whereClause.status = {
      in: [PrintTaskStatus.pending, PrintTaskStatus.in_progress],
    };
  } else if (validatedStatus !== 'all') {
    // Show tasks with a specific status
    whereClause.status = validatedStatus;
  }
  if (validatedNeedsReview !== 'all') {
    whereClause.needs_review = validatedNeedsReview === 'yes';
  }
  if (validatedQuery) {
    // Trim spaces from search query
    const trimmedQuery = validatedQuery.trim();

    if (trimmedQuery) {
      // Check if the search query looks like a marketplace order number
      const detection = detectMarketplaceOrderNumber(trimmedQuery);

      if (detection.isMarketplaceNumber) {
        // If it's a marketplace order number, do an exact match instead of contains
        whereClause.OR = [
          { marketplace_order_number: trimmedQuery }, // Exact match
          // Fallback to contains search if exact match doesn't work
          { marketplace_order_number: { contains: trimmedQuery } },
          { custom_text: { contains: trimmedQuery } },
          { color_1: { contains: trimmedQuery } },
          { color_2: { contains: trimmedQuery } },
          { product: { name: { contains: trimmedQuery } } },
          { product: { sku: { contains: trimmedQuery } } },
        ];
      } else {
        // Regular search
        whereClause.OR = [
          { marketplace_order_number: { contains: trimmedQuery } },
          { custom_text: { contains: trimmedQuery } },
          { color_1: { contains: trimmedQuery } },
          { color_2: { contains: trimmedQuery } },
          { product: { name: { contains: trimmedQuery } } },
          { product: { sku: { contains: trimmedQuery } } },
        ];

        // If the query is numeric, also search by ID
        const parsedId = parseInt(trimmedQuery, 10);
        if (!isNaN(parsedId)) {
          whereClause.OR.push({ id: parsedId });
          // Also search by orderItemId
          whereClause.OR.push({ orderItemId: parsedId });
        }
      }
    }
  }

  // Color 1 filter
  if (validatedColor1) {
    whereClause.color_1 = { contains: validatedColor1 };
  }

  // Color 2 filter
  if (validatedColor2) {
    whereClause.color_2 = { contains: validatedColor2 };
  }

  // Product Name filter
  if (validatedProductName && validatedProductName !== 'all') {
    whereClause.product = {
      name: validatedProductName,
    };
  }

  // Shipping Method filter
  if (validatedShippingMethod && validatedShippingMethod !== 'all') {
    whereClause.order = {
      is: {
        requested_shipping_service: validatedShippingMethod,
      },
    };
  }

  const dateFilter: { gte?: Date; lte?: Date } = {};
  let dateFilterApplied = false;

  if (validatedShipByDateStart) {
    try {
      const startDate = new Date(validatedShipByDateStart);
      startDate.setUTCHours(0, 0, 0, 0);
      if (!isNaN(startDate.getTime())) {
        dateFilter.gte = startDate;
        dateFilterApplied = true;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_ignoredError) {
      console.warn('Invalid shipByDateStart format received:', validatedShipByDateStart);
    }
  }
  if (validatedShipByDateEnd) {
    try {
      const endDate = new Date(validatedShipByDateEnd);
      endDate.setUTCHours(23, 59, 59, 999);
      if (!isNaN(endDate.getTime())) {
        dateFilter.lte = endDate;
        dateFilterApplied = true;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_ignoredError) {
      console.warn('Invalid shipByDateEnd format received:', validatedShipByDateEnd);
    }
  }

  if (dateFilterApplied) {
    whereClause.ship_by_date = dateFilter;
  }

  console.log('[getPrintTasks] Using validated filters:', {
    status: validatedStatus,
    needsReview: validatedNeedsReview,
    query: validatedQuery,
    shipByDateStart: validatedShipByDateStart,
    shipByDateEnd: validatedShipByDateEnd,
  });
  console.log('[getPrintTasks] Generated Where Clause:', JSON.stringify(whereClause));

  const [tasks, total] = await prisma.$transaction([
    prisma.printOrderTask.findMany({
      where: whereClause,
      skip: skip,
      take: validatedLimit,
      orderBy: [
        { needs_review: 'desc' },
        { ship_by_date: 'asc' },
        { created_at: 'desc' }, // Changed to desc to show most recent tasks first
      ],
      include: {
        order: {
          select: {
            requested_shipping_service: true,
            marketplace: true, // Include marketplace
          },
        },
        product: true, // Add include for product relation
      },
    }),
    prisma.printOrderTask.count({ where: whereClause }),
  ]);

  const tasksWithLinks = tasks.map(task => ({
    ...task,
    orderLink: `/orders/${task.orderId}`,
  }));

  // --- Filter tasks missing products and Convert Decimal/Date fields ---
  const validTasks = tasksWithLinks.filter(task => task.product); // Filter out tasks without a product

  const serializableTasks: ClientPrintTaskData[] = validTasks.map(task => { // Use ClientPrintTaskData here
    // Now we know task.product is not null within this map
    const product = task.product!; // Use non-null assertion as we've filtered

    return {
      ...task,
      // Convert Date fields to strings
      created_at: task.created_at.toISOString(), // Assuming created_at is non-null
      updated_at: task.updated_at?.toISOString() ?? null, // Handle potential null
      ship_by_date: task.ship_by_date?.toISOString() ?? null, // Handle potential null

      // Map product name to product_name field for the column
      product_name: product.name || 'N/A', // Use non-null product
      // Ensure the order object exists before accessing its properties
      order: task.order
        ? {
            requested_shipping_service: task.order.requested_shipping_service,
            marketplace: task.order.marketplace, // Pass marketplace through
          }
        : undefined,
      // Convert product fields and dates
      product: {
        ...product, // Spread the non-null product
        // Convert Decimal fields to strings, handling nulls
        weight: product.weight?.toString() ?? null,
        item_weight_value: product.item_weight_value?.toString() ?? null,
        // Also serialize product dates (using correct names)
        createdAt: product.createdAt.toISOString(), // Corrected name
        updatedAt: product.updatedAt?.toISOString() ?? null, // Corrected name
        // Ensure all required fields from ClientSerializableProduct are present
        name: product.name, // Already present via spread
        id: product.id, // Already present via spread
        sku: product.sku, // Already present via spread
        imageUrl: product.imageUrl, // Already present via spread
        notes: product.notes, // Already present via spread
        // createdAt & updatedAt are handled above
        fulfillment_sku: product.fulfillment_sku, // Already present via spread
        item_weight_units: product.item_weight_units, // Already present via spread
        shipstation_product_id: product.shipstation_product_id, // Already present via spread
        warehouse_location: product.warehouse_location, // Already present via spread
      },
    };
  });

  // Return the data matching ClientPrintTaskData[] type signature
  return { tasks: serializableTasks, total };
}

// --- Restoring Validation in PrintQueuePage ---
export default async function PrintQueuePage({
  searchParams,
}: {
  // Use the specific interface here
  searchParams?: PrintQueuePageSearchParams;
}) {
  const now = new Date(); // Get current time on the server
  const formattedNow = now.toLocaleTimeString(); // Format the string on the server
  console.log('[PrintQueuePage] Received searchParams prop:', searchParams); // Log the initial prop

  try {
    // --- Explicitly await the searchParams object ---
    const resolvedSearchParams = (await searchParams) || {};
    console.log('[PrintQueuePage] Resolved searchParams:', resolvedSearchParams); // Log the resolved object

    // Access properties from the RESOLVED object
    const pageParamRaw = resolvedSearchParams.page;
    const limitParamRaw = resolvedSearchParams.limit;
    const statusParamRaw = resolvedSearchParams.status;
    const needsReviewParamRaw = resolvedSearchParams.needsReview;
    const queryParamRaw = resolvedSearchParams.query;
    const shipByDateStartParamRaw = resolvedSearchParams.shipByDateStart;
    const shipByDateEndParamRaw = resolvedSearchParams.shipByDateEnd;
    // Get color filter params
    const color1ParamRaw = resolvedSearchParams.color1;
    const color2ParamRaw = resolvedSearchParams.color2;
    // Get product name filter param
    const productNameParamRaw = resolvedSearchParams.productName;
    // Get shipping method filter param
    const shippingMethodParamRaw = resolvedSearchParams.shippingMethod;

    console.log('[PrintQueuePage] Accessed raw params from resolved object');

    // --- Validation ---
    // No need to check for array type now, as the interface enforces string
    const pageParam = pageParamRaw;
    const limitParam = limitParamRaw;
    const statusParam = statusParamRaw;
    const needsReviewParam = needsReviewParamRaw;
    const queryParam = queryParamRaw;
    const shipByDateStartParam = shipByDateStartParamRaw;
    const shipByDateEndParam = shipByDateEndParamRaw;
    const color1Param = color1ParamRaw;
    const color2Param = color2ParamRaw;
    const productNameParam = productNameParamRaw;
    const shippingMethodParam = shippingMethodParamRaw;

    // Validate and set defaults
    const page = parseInt(pageParam || '1', 10);
    // Default limit is set to 250 here if limitParam is missing
    const limit = parseInt(limitParam || '250', 10);
    const validatedPage = isNaN(page) || page < 1 ? 1 : page;
    // Fallback limit during validation is also 250
    const validatedLimit = isNaN(limit) || limit < 1 ? 250 : Math.min(limit, 1000); // Cap at 1000 items per page

    // Add debug logging
    console.log('[PrintQueuePage] Raw limit param:', limitParam);
    console.log('[PrintQueuePage] Parsed limit:', limit);
    console.log('[PrintQueuePage] Validated limit:', validatedLimit);

    const validStatuses: (PrintTaskStatus | 'all' | 'active')[] = [
      ...Object.values(PrintTaskStatus),
      'all',
      'active',
    ];
    // Default to 'active' (pending or in_progress) if no status is specified
    const currentStatus = statusParam || 'active';
    const validatedStatus = validStatuses.includes(
      currentStatus as PrintTaskStatus | 'all' | 'active'
    )
      ? (currentStatus as PrintTaskStatus | 'all' | 'active')
      : 'active';

    const validReviewOptions: ('yes' | 'no' | 'all')[] = ['yes', 'no', 'all'];
    const currentNeedsReview = needsReviewParam || 'all';
    const validatedNeedsReview = validReviewOptions.includes(
      currentNeedsReview as 'yes' | 'no' | 'all'
    )
      ? (currentNeedsReview as 'yes' | 'no' | 'all')
      : 'all';

    const validatedQuery = queryParam || '';

    // Validate product name (default to "all" if empty or invalid)
    const validatedProductName = productNameParam || 'all';

    // Validate shipping method (default to "all" if empty or invalid)
    const validatedShippingMethod = shippingMethodParam || 'all';

    // --- End Validation ---

    console.log('[PrintQueuePage] Successfully validated searchParams properties');
    console.log({
      validatedPage,
      validatedLimit,
      validatedStatus,
      validatedNeedsReview,
      validatedQuery,
      shipByDateStartParam,
      shipByDateEndParam,
      productNameParam,
    });

    // --- Call getPrintTasks & getDistinctProductNames --- Fetch in parallel
    const [{ tasks, total }, productNames] = await Promise.all([
      getPrintTasks({
        validatedPage,
        validatedLimit,
        validatedStatus,
        validatedNeedsReview,
        validatedQuery: validatedQuery,
        validatedShipByDateStart: shipByDateStartParam,
        validatedShipByDateEnd: shipByDateEndParam,
        validatedColor1: color1Param,
        validatedColor2: color2Param,
        validatedProductName: validatedProductName,
        validatedShippingMethod: validatedShippingMethod,
      }),
      getDistinctProductNamesForTasks(), // Fetch distinct product names
    ]);

    // Prepare initial filters object based on validated params for the client component
    const initialFilters: PrintQueuePageSearchParams = {
      page: String(validatedPage),
      limit: String(validatedLimit),
      status: validatedStatus,
      needsReview: String(validatedNeedsReview),
      query: validatedQuery,
      shipByDateStart: shipByDateStartParam,
      shipByDateEnd: shipByDateEndParam,
      color1: color1Param,
      color2: color2Param,
      productName: validatedProductName,
      shippingMethod: validatedShippingMethod,
    };

    return (
      <PrintQueueClient
        tasks={tasks} // This 'tasks' now conforms to ClientPrintTaskData[]
        totalTasks={total}
        page={validatedPage}
        limit={validatedLimit}
        productNames={productNames}
        initialFilters={initialFilters}
        formattedNow={formattedNow}
      />
    );
  } catch (error) {
    console.error('[PrintQueuePage] Error fetching data:', error);
    // Improved error display
    let errorMessage = 'Failed to load print queue data.';
    if (error instanceof Error) {
      errorMessage += ` Error: ${error.message}`;
    }

    return (
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Print Queue</h2>
        </div>
        <div
          className="flex h-[calc(100vh-200px)] items-center justify-center rounded-md border border-dashed p-8 text-center animate-in fade-in-50"
        >
          <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
            <p className="mt-4 text-lg font-semibold text-destructive">
              Error Loading Data
            </p>
            <p className="mb-4 mt-2 text-sm text-muted-foreground">
              {errorMessage}
            </p>
          </div>
        </div>
      </div>
    );
  }
}

// TODO: Add tests for validation logic
