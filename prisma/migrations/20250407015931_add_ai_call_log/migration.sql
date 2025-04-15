-- DropIndex
DROP INDEX `SyncMetrics_startTime_idx` ON `SyncMetrics`;

-- DropIndex
DROP INDEX `SyncMetrics_syncId_idx` ON `SyncMetrics`;

-- CreateTable
CREATE TABLE `AiCallLog` (
    `id` VARCHAR(191) NOT NULL,
    `scriptName` VARCHAR(100) NOT NULL,
    `orderId` INTEGER NOT NULL,
    `orderNumber` VARCHAR(100) NULL,
    `marketplace` VARCHAR(50) NULL,
    `aiProvider` VARCHAR(50) NOT NULL,
    `modelUsed` VARCHAR(100) NOT NULL,
    `promptSent` LONGTEXT NOT NULL,
    `rawResponse` LONGTEXT NOT NULL,
    `processingTimeMs` INTEGER NOT NULL,
    `success` BOOLEAN NOT NULL,
    `errorMessage` TEXT NULL,
    `tasksGenerated` INTEGER NOT NULL DEFAULT 0,
    `needsReviewCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AiCallLog_orderId_idx`(`orderId`),
    INDEX `AiCallLog_scriptName_idx`(`scriptName`),
    INDEX `AiCallLog_success_idx`(`success`),
    INDEX `AiCallLog_createdAt_idx`(`createdAt`),
    INDEX `AiCallLog_aiProvider_idx`(`aiProvider`),
    INDEX `AiCallLog_modelUsed_idx`(`modelUsed`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
