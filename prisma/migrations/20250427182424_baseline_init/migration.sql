-- CreateTable
CREATE TABLE `Product` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sku` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `imageUrl` VARCHAR(512) NULL,
    `weight` DECIMAL(10, 4) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `fulfillment_sku` VARCHAR(255) NULL,
    `item_weight_units` VARCHAR(20) NULL,
    `item_weight_value` DECIMAL(10, 4) NULL,
    `shipstation_product_id` INTEGER NULL,
    `upc` VARCHAR(50) NULL,
    `warehouse_location` VARCHAR(100) NULL,

    UNIQUE INDEX `Product_sku_key`(`sku`),
    UNIQUE INDEX `Product_shipstation_product_id_key`(`shipstation_product_id`),
    INDEX `Product_sku_idx`(`sku`),
    INDEX `Product_name_idx`(`name`),
    INDEX `Product_shipstation_product_id_idx`(`shipstation_product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shipstation_order_id` VARCHAR(50) NULL,
    `shipstation_order_number` VARCHAR(50) NULL,
    `customerId` INTEGER NULL,
    `customer_name` VARCHAR(100) NULL,
    `order_status` VARCHAR(50) NOT NULL DEFAULT 'awaiting_shipment',
    `order_key` VARCHAR(50) NULL,
    `order_date` DATETIME(0) NULL,
    `payment_date` DATETIME(0) NULL,
    `ship_by_date` DATETIME(0) NULL,
    `shipping_price` DECIMAL(10, 2) NULL,
    `tax_amount` DECIMAL(10, 2) NULL,
    `discount_amount` DECIMAL(10, 2) NULL,
    `shipping_amount_paid` DECIMAL(10, 2) NULL,
    `shipping_tax` DECIMAL(10, 2) NULL,
    `total_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `gift` BOOLEAN NOT NULL DEFAULT false,
    `gift_message` TEXT NULL,
    `gift_email` VARCHAR(100) NULL,
    `requested_shipping_service` VARCHAR(100) NULL,
    `carrier_code` VARCHAR(50) NULL,
    `service_code` VARCHAR(50) NULL,
    `package_code` VARCHAR(50) NULL,
    `confirmation` VARCHAR(50) NULL,
    `tracking_number` VARCHAR(100) NULL,
    `shipped_date` DATETIME(0) NULL,
    `warehouse_id` VARCHAR(50) NULL,
    `customer_notes` TEXT NULL,
    `internal_notes` TEXT NULL,
    `last_sync_date` DATETIME(0) NULL,
    `notes` TEXT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL,
    `marketplace` VARCHAR(50) NULL,
    `amount_paid` DECIMAL(10, 2) NULL,
    `order_weight_units` VARCHAR(20) NULL,
    `order_weight_value` DECIMAL(10, 4) NULL,
    `payment_method` VARCHAR(50) NULL,
    `shipstation_store_id` INTEGER NULL,
    `tag_ids` JSON NULL,
    `dimensions_height` DECIMAL(10, 2) NULL,
    `dimensions_length` DECIMAL(10, 2) NULL,
    `dimensions_units` VARCHAR(20) NULL,
    `dimensions_width` DECIMAL(10, 2) NULL,
    `insurance_insure_shipment` BOOLEAN NULL,
    `insurance_insured_value` DECIMAL(10, 2) NULL,
    `insurance_provider` VARCHAR(50) NULL,
    `internal_status` ENUM('new', 'processing', 'printing', 'completed', 'cancelled') NOT NULL DEFAULT 'new',
    `is_voided` BOOLEAN NULL DEFAULT false,
    `marketplace_notified` BOOLEAN NOT NULL DEFAULT false,
    `void_date` DATETIME(0) NULL,
    `lastPackingSlipAt` DATETIME(0) NULL,

    UNIQUE INDEX `Order_shipstation_order_id_key`(`shipstation_order_id`),
    INDEX `Order_created_at_idx`(`created_at`),
    INDEX `Order_updated_at_idx`(`updated_at`),
    INDEX `Order_order_status_idx`(`order_status`),
    INDEX `Order_customerId_idx`(`customerId`),
    INDEX `Order_marketplace_idx`(`marketplace`),
    INDEX `Order_shipstation_store_id_idx`(`shipstation_store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(100) NULL,
    `phone` VARCHAR(20) NULL,
    `address` TEXT NULL,
    `shipstation_customer_id` VARCHAR(50) NULL,
    `company` VARCHAR(100) NULL,
    `street1` VARCHAR(255) NULL,
    `street2` VARCHAR(255) NULL,
    `street3` VARCHAR(255) NULL,
    `city` VARCHAR(100) NULL,
    `state` VARCHAR(100) NULL,
    `postal_code` VARCHAR(20) NULL,
    `country` VARCHAR(2) NULL,
    `country_code` VARCHAR(2) NULL,
    `customer_notes` TEXT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL,
    `address_verified_status` VARCHAR(50) NULL,
    `is_residential` BOOLEAN NULL,

    UNIQUE INDEX `Customer_email_key`(`email`),
    UNIQUE INDEX `Customer_shipstation_customer_id_key`(`shipstation_customer_id`),
    INDEX `Customer_email_idx`(`email`),
    INDEX `Customer_shipstation_customer_id_idx`(`shipstation_customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unit_price` DECIMAL(10, 2) NOT NULL,
    `print_settings` JSON NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL,
    `shipstationLineItemKey` VARCHAR(50) NULL,
    `productId` INTEGER NOT NULL,

    UNIQUE INDEX `OrderItem_shipstationLineItemKey_key`(`shipstationLineItemKey`),
    INDEX `OrderItem_orderId_idx`(`orderId`),
    INDEX `OrderItem_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PrintOrderTask` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `marketplace_order_number` VARCHAR(100) NULL,
    `customerId` INTEGER NULL,
    `custom_text` TEXT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `color_1` VARCHAR(50) NULL,
    `color_2` VARCHAR(50) NULL,
    `ship_by_date` DATE NULL,
    `status` ENUM('pending', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    `needs_review` BOOLEAN NOT NULL DEFAULT false,
    `review_reason` TEXT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL,
    `orderItemId` INTEGER NOT NULL,
    `taskIndex` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `shorthandProductName` VARCHAR(100) NULL,
    `annotation` TEXT NULL,
    `stl_path` VARCHAR(512) NULL,
    `stl_render_state` ENUM('pending', 'running', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    `render_retries` INTEGER NOT NULL DEFAULT 0,

    INDEX `PrintOrderTask_orderId_idx`(`orderId`),
    INDEX `PrintOrderTask_orderItemId_idx`(`orderItemId`),
    INDEX `PrintOrderTask_productId_idx`(`productId`),
    INDEX `PrintOrderTask_status_idx`(`status`),
    INDEX `PrintOrderTask_ship_by_date_idx`(`ship_by_date`),
    INDEX `PrintOrderTask_customerId_idx`(`customerId`),
    INDEX `PrintOrderTask_needs_review_idx`(`needs_review`),
    INDEX `PrintOrderTask_status_updated_at_idx`(`status`, `updated_at`),
    INDEX `PrintOrderTask_stl_render_state_idx`(`stl_render_state`),
    UNIQUE INDEX `PrintOrderTask_orderItemId_taskIndex_key`(`orderItemId`, `taskIndex`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
CREATE TABLE `Tag` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shipstation_tag_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `color_hex` VARCHAR(7) NULL,
    `last_synced` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Tag_shipstation_tag_id_key`(`shipstation_tag_id`),
    INDEX `Tag_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScriptRunLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `scriptName` VARCHAR(100) NOT NULL,
    `runStartedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `runEndedAt` DATETIME(3) NULL,
    `status` VARCHAR(50) NOT NULL,
    `errorMessage` TEXT NULL,
    `errorStack` TEXT NULL,
    `details` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ScriptRunLog_scriptName_idx`(`scriptName`),
    INDEX `ScriptRunLog_status_idx`(`status`),
    INDEX `ScriptRunLog_runStartedAt_idx`(`runStartedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `emailVerified` DATETIME(3) NULL,
    `image` VARCHAR(191) NULL,
    `name` VARCHAR(191) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Account` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `providerAccountId` VARCHAR(191) NOT NULL,
    `refresh_token` TEXT NULL,
    `access_token` TEXT NULL,
    `expires_at` INTEGER NULL,
    `token_type` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NULL,
    `id_token` TEXT NULL,
    `session_state` VARCHAR(191) NULL,

    INDEX `Account_userId_idx`(`userId`),
    UNIQUE INDEX `Account_provider_providerAccountId_key`(`provider`, `providerAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionToken` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Session_sessionToken_key`(`sessionToken`),
    INDEX `Session_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VerificationToken` (
    `identifier` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VerificationToken_token_key`(`token`),
    UNIQUE INDEX `VerificationToken_identifier_token_key`(`identifier`, `token`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

-- CreateTable
CREATE TABLE `AiReportDefinition` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `systemPrompt` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AiReportDefinition_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiReportRun` (
    `id` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NOT NULL,
    `inputJson` JSON NOT NULL,
    `outputJson` JSON NULL,
    `rawResponse` LONGTEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'running',
    `errorMsg` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,

    INDEX `AiReportRun_reportId_idx`(`reportId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrintOrderTask` ADD CONSTRAINT `PrintOrderTask_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrintOrderTask` ADD CONSTRAINT `PrintOrderTask_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrintOrderTask` ADD CONSTRAINT `PrintOrderTask_orderItemId_fkey` FOREIGN KEY (`orderItemId`) REFERENCES `OrderItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrintOrderTask` ADD CONSTRAINT `PrintOrderTask_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AmazonCustomizationFile` ADD CONSTRAINT `AmazonCustomizationFile_orderItemId_fkey` FOREIGN KEY (`orderItemId`) REFERENCES `OrderItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Account` ADD CONSTRAINT `Account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiReportRun` ADD CONSTRAINT `AiReportRun_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `AiReportDefinition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

