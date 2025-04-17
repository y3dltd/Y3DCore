import { existsSync, mkdirSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';

import { Prisma, AmazonCustomizationFile } from '@prisma/client'; // Type should now be available

import { prisma } from '@/lib/shared/database';
import { logger } from '@/lib/shared/logging';

import { fetchAndProcessAmazonCustomization } from './customization';

// --- Options Interface ---
// Matches the options defined in TODO_V2.md for the amazon sync command
export interface AmazonSyncOptions {
  orderId?: number;
  itemId?: number;
  retryFailed?: boolean;
  maxRetries?: number;
  limit?: number;
  dryRun?: boolean;
  verbose?: boolean; // Added verbose for potential future use
}

// --- Constants ---
const DOWNLOAD_DIR = path.join(process.cwd(), 'data', 'amazon-customizations');
const STATUSES = {
  PENDING: 'pending',
  DOWNLOADED: 'downloaded',
  PROCESSED: 'processed',
  FAILED: 'failed',
};

// Ensure download directory exists
if (!existsSync(DOWNLOAD_DIR)) {
  logger.info(`[Amazon Sync] Creating download directory: ${DOWNLOAD_DIR}`);
  mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// --- Types ---
// Define type for the order item processed by this script
type OrderItemWithDetails = Prisma.OrderItemGetPayload<{
  include: {
    order: {
      select: {
        id: true;
        shipstation_order_number: true;
        marketplace: true;
      };
    };
    product: {
      select: {
        id: true;
        name: true;
        sku: true;
      };
    };
    amazonCustomizationFiles: true; // Relation should now be recognized
  };
}>;

// Define return type for the main sync function
export interface AmazonSyncResult {
  success: boolean;
  itemsFound: number;
  itemsProcessed: number;
  itemsSucceeded: number;
  itemsFailed: number;
  errors: Array<{ orderId: number; itemId: number; error: string }>;
}

// --- Main Exported Function ---

/**
 * Finds Amazon orders with customization URLs, downloads, processes,
 * and updates the database.
 */
export async function syncCustomizationFiles(
  options: AmazonSyncOptions
): Promise<AmazonSyncResult> {
  const result: AmazonSyncResult = {
    success: true,
    itemsFound: 0,
    itemsProcessed: 0,
    itemsSucceeded: 0,
    itemsFailed: 0,
    errors: [],
  };

  try {
    logger.info('[Amazon Sync] Starting Amazon customization sync process', { ...options });

    // Find order items with customization URLs that need processing
    logger.info('[Amazon Sync] Finding order items with customization URLs...');
    const orderItems = await findOrderItemsToProcess(options);
    result.itemsFound = orderItems.length;

    if (orderItems.length === 0) {
      logger.info(
        '[Amazon Sync] No Amazon order items with customization URLs found for processing.'
      );
      return result; // Return early, success is true
    }

    logger.info(
      `[Amazon Sync] Found ${orderItems.length} Amazon order items with customization URLs to process.`
    );

    // Process each order item
    for (const item of orderItems) {
      result.itemsProcessed++;
      try {
        const processResult = await processOrderItem(item, options);
        if (processResult.success) {
          result.itemsSucceeded++;
        } else {
          result.itemsFailed++;
          if (processResult.error) {
            result.errors.push({
              orderId: item.orderId,
              itemId: item.id,
              error: processResult.error,
            });
          }
        }
      } catch (err: unknown) {
        // Use unknown instead of any
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error(`[Amazon Sync] Uncaught error processing order item ${item.id}`, {
          error: errorMessage,
          orderId: item.orderId,
          itemId: item.id,
        });
        result.itemsFailed++;
        result.errors.push({
          orderId: item.orderId,
          itemId: item.id,
          error: `Uncaught: ${errorMessage}`,
        });
      }
    }

    logger.info(`[Amazon Sync] Completed processing ${result.itemsProcessed} items.`);
    logger.info(`[Amazon Sync] Success: ${result.itemsSucceeded}, Failed: ${result.itemsFailed}`);
    if (result.itemsFailed > 0) {
      result.success = false; // Mark overall success as false if any item failed
    }
  } catch (err: unknown) {
    // Use unknown instead of any
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('[Amazon Sync] Critical error during sync process', { error: errorMessage });
    result.success = false;
    result.errors.push({ orderId: 0, itemId: 0, error: `Critical: ${errorMessage}` }); // Add a general error
  }
  // No finally block needed here as prisma client is managed globally

  return result;
}

// --- Helper Functions (Adapted from original script) ---

/**
 * Find order items with customization URLs that need processing based on options.
 */
async function findOrderItemsToProcess(
  options: AmazonSyncOptions
): Promise<OrderItemWithDetails[]> {
  const where: Prisma.OrderItemWhereInput = {
    order: {
      marketplace: {
        contains: 'Amazon',
      },
      order_status: 'awaiting_shipment',
    },
  };

  // Add specific order ID filter if provided
  if (options.orderId) {
    logger.info(`[Amazon Sync] Filtering by Order ID: ${options.orderId}`);
    where.orderId = options.orderId;
  }

  // Add specific item ID filter if provided
  if (options.itemId) {
    logger.info(`[Amazon Sync] Filtering by Item ID: ${options.itemId}`);
    where.id = options.itemId;
  }

  // Handle retry logic - relation should now be recognized
  if (options.retryFailed) {
    logger.info(
      `[Amazon Sync] Including failed items for retry (max ${options.maxRetries} retries)`
    );
    where.OR = [
      {
        amazonCustomizationFiles: {
          // Relation should now be recognized
          is: null, // Find items with NO customization file record
        },
      },
      {
        amazonCustomizationFiles: {
          // Relation should now be recognized
          is: {
            // Find items with customization file matching failure & retryCount conditions
            OR: [{ downloadStatus: STATUSES.FAILED }, { processingStatus: STATUSES.FAILED }],
            retryCount: {
              lt: options.maxRetries ?? 3,
            },
          },
        },
      },
    ];
  } else if (options.orderId || options.itemId) {
    logger.info(
      '[Amazon Sync] Processing specific order/item, not filtering by customization file status.'
    );
  } else {
    logger.info('[Amazon Sync] Processing only items without existing customization file records.');
    where.amazonCustomizationFiles = {
      // Relation should now be recognized
      is: null, // Find items with NO customization file record
    };
  }

  // Fetch order items
  const items = await prisma.orderItem.findMany({
    where,
    include: {
      order: {
        select: {
          id: true,
          shipstation_order_number: true,
          marketplace: true,
        },
      },
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
        },
      },
      amazonCustomizationFiles: true, // Relation should now be recognized
    },
    take: options.limit ?? 50,
    orderBy: {
      order: {
        order_date: 'asc',
      },
    },
  });

  logger.debug(
    `[Amazon Sync] Found ${items.length} potential Amazon order items before filtering for CustomizedURL`
  );

  // Filter items to only include those with a valid CustomizedURL in print_settings
  const filteredItems = items.filter(item => {
    const url = extractCustomizationUrl(item as OrderItemWithDetails); // Type assertion should be valid now
    return !!url;
  });

  logger.info(`[Amazon Sync] Filtered to ${filteredItems.length} items with a valid CustomizedURL`);

  return filteredItems as OrderItemWithDetails[]; // Type assertion should be valid now
}

/**
 * Extracts the customization URL from various print_settings formats.
 */
function extractCustomizationUrl(item: OrderItemWithDetails): string | null {
  const printSettings = item.print_settings;

  if (!printSettings) return null;

  // Handle array format: [{name: 'CustomizedURL', value: 'https://...'}]
  if (Array.isArray(printSettings)) {
    const urlSetting = printSettings.find(
      setting =>
        setting &&
        typeof setting === 'object' &&
        'name' in setting &&
        setting.name === 'CustomizedURL'
    );
    if (
      urlSetting &&
      typeof urlSetting === 'object' &&
      'value' in urlSetting &&
      typeof urlSetting.value === 'string'
    ) {
      return urlSetting.value;
    }
  }
  // Handle object format: {CustomizedURL: 'https://...'}
  else if (typeof printSettings === 'object') {
    // Safer access for object format
    const settingsRecord = printSettings as Record<string, unknown>;
    if ('CustomizedURL' in settingsRecord && typeof settingsRecord.CustomizedURL === 'string') {
      return settingsRecord.CustomizedURL;
    }
  }

  // Log if URL couldn't be extracted but print_settings exist
  logger.debug(`[Amazon Sync] Could not extract CustomizedURL from item ${item.id}`, {
    printSettings,
  });
  return null;
}

/**
 * Process a single order item: find/create DB record, fetch/process data, update DB.
 */
async function processOrderItem(
  item: OrderItemWithDetails,
  options: AmazonSyncOptions
): Promise<{ success: boolean; error?: string }> {
  const orderId = item.orderId;
  const itemId = item.id;
  const orderNumber = item.order.shipstation_order_number;

  logger.info(
    `[Amazon Sync] Processing order item ${itemId} from order ${orderNumber} (ID: ${orderId})`
  );

  // Extract customization URL
  const customizationUrl = extractCustomizationUrl(item);

  if (!customizationUrl) {
    // This should ideally not happen due to pre-filtering, but check anyway
    logger.warn(
      `[Amazon Sync] No CustomizedURL found for order item ${itemId} during processing step.`,
      {
        orderId,
        itemId,
        printSettings: item.print_settings,
      }
    );
    return { success: false, error: 'No CustomizedURL found' };
  }

  logger.debug(`[Amazon Sync] Order item ${itemId} - CustomizedURL: ${customizationUrl}`);

  // Skip if already processed successfully - relation should now be recognized
  // Check if amazonCustomizationFiles is an array and has items
  if (Array.isArray(item.amazonCustomizationFiles) && item.amazonCustomizationFiles.length > 0) {
    // Add types to sort parameters
    const latestFile = item.amazonCustomizationFiles.sort(
      (a: AmazonCustomizationFile, b: AmazonCustomizationFile) =>
        b.createdAt.getTime() - a.createdAt.getTime()
    )[0];
    if (
      latestFile.processingStatus === STATUSES.PROCESSED &&
      !options.retryFailed &&
      !options.orderId &&
      !options.itemId
    ) {
      logger.info(`[Amazon Sync] Skipping item ${itemId} as it's already processed successfully.`);
      return { success: true };
    }
  }
  // Find or create a record in the database for tracking
  let customizationFile = await findOrCreateCustomizationFile(itemId, customizationUrl, options);

  // If in dry run and file didn't exist, findOrCreate returns a mock object with id 0
  // If not dry run and creation failed, it might return null
  if (!customizationFile) {
    logger.error(
      `[Amazon Sync] Failed to find or create customization file record for item ${itemId}. Skipping.`,
      { orderId, itemId }
    );
    return { success: false, error: 'Failed to create DB record' };
  }

  try {
    // Download and process the customization file using the function from customization.ts
    const customizationData = await fetchAndProcessAmazonCustomization(customizationUrl);

    if (!customizationData) {
      // fetchAndProcessAmazonCustomization logs its own errors
      throw new Error('Failed to fetch or process customization data');
    }

    // Generate a unique filename (even in dry run for logging consistency)
    const filename = `${orderNumber}_${itemId}_${Date.now()}.json`;
    const filePath = path.join(DOWNLOAD_DIR, filename);

    // Save the raw JSON data to a file
    if (!options.dryRun) {
      logger.info(`[Amazon Sync] Saving processed JSON to ${filePath}`);
      await fs.writeFile(filePath, JSON.stringify(customizationData.rawJsonData || {}, null, 2)); // Save the rawJsonData part
    } else {
      logger.info(`[DRY RUN] Would save processed JSON to ${filePath}`);
    }

    // Update the customization file record in the database - use lowercase model access
    if (!options.dryRun) {
      if (customizationFile.id !== 0) {
        logger.info(
          `[Amazon Sync] Updating customization file record ${customizationFile.id} for item ${itemId} as processed.`
        );
        // Use prisma.amazonCustomizationFile (lowercase a)
        customizationFile = await prisma.amazonCustomizationFile.update({
          where: { id: customizationFile.id },
          data: {
            downloadStatus: STATUSES.DOWNLOADED, // Mark download successful
            processingStatus: STATUSES.PROCESSED, // Mark processing successful
            localFilePath: filePath,
            // Store extracted fields
            customText: customizationData.customText,
            color1: customizationData.color1,
            color2: customizationData.color2,
            rawJsonData: customizationData.rawJsonData as Prisma.InputJsonValue | undefined, // Allow undefined
            errorMessage: null, // Clear previous errors
            lastProcessedAt: new Date(),
            // Reset retry count on success? Optional, depends on desired behavior.
            // retryCount: 0,
          },
        });
      } else {
        // Should not happen if not dry run, but log just in case
        logger.warn(
          `[Amazon Sync] Skipping DB update for item ${itemId} due to invalid customizationFile ID (0) even though not in dry run.`,
          { orderId, itemId }
        );
      }
    } else {
      logger.info(
        `[DRY RUN] Would update customization file record for item ${itemId} as processed.`
      );
    }

    logger.info(`[Amazon Sync] Successfully processed customization for order item ${itemId}`, {
      orderId,
      itemId,
      extracted: {
        // Log only extracted fields, not raw JSON
        customText: customizationData.customText,
        color1: customizationData.color1,
        color2: customizationData.color2,
      },
    });

    return { success: true };
  } catch (err: unknown) {
    // Use unknown instead of any
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`[Amazon Sync] Failed to process customization for order item ${itemId}`, {
      orderId,
      itemId,
      error: errorMessage,
      url: customizationUrl,
    });

    // Update the customization file record with error status - use lowercase model access
    if (!options.dryRun) {
      if (customizationFile && customizationFile.id !== 0) {
        // Add null check for customizationFile
        logger.info(
          `[Amazon Sync] Updating customization file record ${customizationFile.id} for item ${itemId} as failed.`
        );
        // Use prisma.amazonCustomizationFile (lowercase a)
        await prisma.amazonCustomizationFile.update({
          where: { id: customizationFile.id },
          data: {
            // Keep downloadStatus as is, or mark as failed? Depends if download or processing failed.
            // Assuming processing failed here.
            processingStatus: STATUSES.FAILED,
            errorMessage: errorMessage.substring(0, 1000), // Limit error message length
            retryCount: { increment: 1 },
            lastProcessedAt: new Date(),
          },
        });
      } else {
        logger.warn(
          `[Amazon Sync] Skipping DB error update for item ${itemId} due to invalid customizationFile ID (0) even though not in dry run.`,
          { orderId, itemId, error: errorMessage }
        );
      }
    } else {
      logger.info(`[DRY RUN] Would update customization file record for item ${itemId} as failed.`);
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Find or create a customization file record in the database.
 * Returns a mock object in dry run if the record doesn't exist.
 */
async function findOrCreateCustomizationFile(
  orderItemId: number,
  url: string,
  options: AmazonSyncOptions
): Promise<AmazonCustomizationFile | null> {
  try {
    // Check if a record already exists - use lowercase model access
    // Use prisma.amazonCustomizationFile (lowercase a)
    let customizationFile = await prisma.amazonCustomizationFile.findFirst({
      where: {
        orderItemId,
      },
    });

    // If no record exists, create one (unless dry run) - use lowercase model access
    if (!customizationFile) {
      if (!options.dryRun) {
        logger.info(`[Amazon Sync] Creating new customization file record for item ${orderItemId}`);
        // Use prisma.amazonCustomizationFile (lowercase a)
        customizationFile = await prisma.amazonCustomizationFile.create({
          data: {
            orderItemId,
            originalUrl: url,
            downloadStatus: STATUSES.PENDING,
            processingStatus: STATUSES.PENDING,
            retryCount: 0,
          },
        });
      } else {
        logger.info(`[DRY RUN] Would create new customization file record for item ${orderItemId}`);
        // For dry run, create a mock record with ID 0
        customizationFile = {
          id: 0, // Use 0 to indicate a mock object
          orderItemId,
          originalUrl: url,
          localFilePath: null,
          downloadStatus: STATUSES.PENDING,
          processingStatus: STATUSES.PENDING,
          customText: null,
          color1: null,
          color2: null,
          rawJsonData: null,
          errorMessage: null,
          retryCount: 0,
          lastProcessedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
    } else {
      logger.debug(
        `[Amazon Sync] Found existing customization file record ${customizationFile.id} for item ${orderItemId}`
      );
    }

    return customizationFile;
  } catch (error: unknown) {
    // Use unknown instead of any
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      `[Amazon Sync] Error finding or creating customization file record for item ${orderItemId}`,
      { error: message }
    );
    return null; // Indicate failure
  }
}
