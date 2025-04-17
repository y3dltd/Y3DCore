-- AlterTable
ALTER TABLE `PrintOrderTask` ADD COLUMN `annotation` TEXT NULL;

-- CreateTable
CREATE TABLE `AmazonCustomizationFile` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderItemId` INTEGER NOT NULL,
    `originalUrl` VARCHAR(1024) NOT NULL,
    `localFilePath` VARCHAR(512) NULL,
    `downloadStatus` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `processingStatus` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `customText` TEXT NULL,
    `color1` VARCHAR(50) NULL,
    `color2` VARCHAR(50) NULL,
    `rawJsonData` JSON NULL,
    `errorMessage` TEXT NULL,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `lastProcessedAt` TIMESTAMP(0) NULL,
    `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` TIMESTAMP(0) NOT NULL,

    UNIQUE INDEX `AmazonCustomizationFile_orderItemId_key`(`orderItemId`),
    INDEX `AmazonCustomizationFile_orderItemId_idx`(`orderItemId`),
    INDEX `AmazonCustomizationFile_downloadStatus_idx`(`downloadStatus`),
    INDEX `AmazonCustomizationFile_processingStatus_idx`(`processingStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `message` TEXT NULL,
    `level` VARCHAR(50) NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Metric` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `value` DOUBLE NOT NULL,
    `tags` JSON NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Metric_name_idx`(`name`),
    INDEX `Metric_timestamp_idx`(`timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AmazonCustomizationFile` ADD CONSTRAINT `AmazonCustomizationFile_orderItemId_fkey` FOREIGN KEY (`orderItemId`) REFERENCES `OrderItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
