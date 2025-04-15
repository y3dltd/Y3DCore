-- CreateTable
CREATE TABLE `Order` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shipstation_order_id` VARCHAR(50) NULL,
    `shipstation_order_number` VARCHAR(50) NULL,
    `customerId` INTEGER NULL,
    `customer_name` VARCHAR(100) NULL,
    `status` ENUM('new', 'processing', 'printing', 'completed', 'cancelled') NOT NULL DEFAULT 'new',
    `order_status` VARCHAR(50) NOT NULL DEFAULT 'awaiting_shipment',
    `order_key` VARCHAR(50) NULL,
    `order_date` DATETIME NULL,
    `payment_date` DATETIME NULL,
    `ship_by_date` DATETIME NULL,
    `order_source` VARCHAR(50) NULL,
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
    `shipped_date` DATETIME NULL,
    `warehouse_id` VARCHAR(50) NULL,
    `customer_notes` TEXT NULL,
    `internal_notes` TEXT NULL,
    `last_sync_date` DATETIME NULL,
    `notes` TEXT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE INDEX `Order_shipstation_order_id_key`(`shipstation_order_id`),
    INDEX `Order_created_at_idx`(`created_at`),
    INDEX `Order_updated_at_idx`(`updated_at`),
    INDEX `Order_order_status_idx`(`order_status`),
    INDEX `Order_customerId_idx`(`customerId`),
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
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

    INDEX `Customer_email_idx`(`email`),
    INDEX `Customer_shipstation_customer_id_idx`(`shipstation_customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `model_name` VARCHAR(255) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unit_price` DECIMAL(10, 2) NOT NULL,
    `model_file_path` VARCHAR(255) NULL,
    `print_settings` JSON NULL,
    `image_url` VARCHAR(255) NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

    INDEX `OrderItem_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PrintOrderTask` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `marketplace_order_number` VARCHAR(100) NULL,
    `customerId` INTEGER NULL,
    `sku` VARCHAR(255) NULL,
    `product_name` VARCHAR(255) NOT NULL,
    `custom_text` TEXT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `color_1` VARCHAR(50) NULL,
    `color_2` VARCHAR(50) NULL,
    `ship_by_date` DATE NULL,
    `status` ENUM('pending', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    `needs_review` BOOLEAN NOT NULL DEFAULT false,
    `review_reason` TEXT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

    INDEX `PrintOrderTask_orderId_idx`(`orderId`),
    INDEX `PrintOrderTask_status_idx`(`status`),
    INDEX `PrintOrderTask_ship_by_date_idx`(`ship_by_date`),
    INDEX `PrintOrderTask_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrintOrderTask` ADD CONSTRAINT `PrintOrderTask_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrintOrderTask` ADD CONSTRAINT `PrintOrderTask_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
