/*
  Warnings:

  - You are about to alter the column `created_at` on the `Customer` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updated_at` on the `Customer` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `order_date` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - You are about to alter the column `payment_date` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - You are about to alter the column `ship_by_date` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - You are about to alter the column `shipped_date` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - You are about to alter the column `last_sync_date` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - You are about to alter the column `created_at` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updated_at` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `void_date` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - You are about to alter the column `created_at` on the `OrderItem` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updated_at` on the `OrderItem` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `created_at` on the `PrintOrderTask` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updated_at` on the `PrintOrderTask` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.

*/
-- AlterTable
ALTER TABLE `Customer` MODIFY `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updated_at` TIMESTAMP NULL;

-- AlterTable
ALTER TABLE `Order` MODIFY `order_date` DATETIME NULL,
    MODIFY `payment_date` DATETIME NULL,
    MODIFY `ship_by_date` DATETIME NULL,
    MODIFY `shipped_date` DATETIME NULL,
    MODIFY `last_sync_date` DATETIME NULL,
    MODIFY `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updated_at` TIMESTAMP NULL,
    MODIFY `void_date` DATETIME NULL;

-- AlterTable
ALTER TABLE `OrderItem` MODIFY `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updated_at` TIMESTAMP NULL;

-- AlterTable
ALTER TABLE `PrintOrderTask` MODIFY `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updated_at` TIMESTAMP NULL;

-- CreateTable
CREATE TABLE `SyncProgress` (
    `id` VARCHAR(191) NOT NULL,
    `syncType` VARCHAR(191) NOT NULL,
    `startTime` DATETIME(3) NOT NULL,
    `endTime` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL,
    `totalOrders` INTEGER NOT NULL DEFAULT 0,
    `processedOrders` INTEGER NOT NULL DEFAULT 0,
    `failedOrders` INTEGER NOT NULL DEFAULT 0,
    `lastProcessedOrderId` VARCHAR(191) NULL,
    `lastProcessedTimestamp` DATETIME(3) NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SyncProgress_syncType_idx`(`syncType`),
    INDEX `SyncProgress_status_idx`(`status`),
    INDEX `SyncProgress_startTime_idx`(`startTime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SyncMetrics` (
    `id` VARCHAR(191) NOT NULL,
    `syncId` VARCHAR(191) NOT NULL,
    `totalApiCalls` INTEGER NOT NULL DEFAULT 0,
    `totalOrdersProcessed` INTEGER NOT NULL DEFAULT 0,
    `totalOrdersFailed` INTEGER NOT NULL DEFAULT 0,
    `totalItemsProcessed` INTEGER NOT NULL DEFAULT 0,
    `totalItemsFailed` INTEGER NOT NULL DEFAULT 0,
    `totalCustomersUpserted` INTEGER NOT NULL DEFAULT 0,
    `totalProductsUpserted` INTEGER NOT NULL DEFAULT 0,
    `avgProcessingTimePerOrder` INTEGER NOT NULL DEFAULT 0,
    `maxProcessingTimePerOrder` INTEGER NOT NULL DEFAULT 0,
    `minProcessingTimePerOrder` INTEGER NOT NULL DEFAULT 0,
    `totalProcessingTime` INTEGER NOT NULL DEFAULT 0,
    `startTime` DATETIME(3) NOT NULL,
    `endTime` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SyncMetrics_syncId_idx`(`syncId`),
    INDEX `SyncMetrics_startTime_idx`(`startTime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
