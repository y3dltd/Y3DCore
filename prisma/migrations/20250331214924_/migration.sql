/*
  Warnings:

  - You are about to alter the column `created_at` on the `Customer` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updated_at` on the `Customer` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to drop the column `order_source` on the `Order` table. All the data in the column will be lost.
  - You are about to alter the column `order_date` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - You are about to alter the column `payment_date` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - You are about to alter the column `ship_by_date` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - You are about to alter the column `shipped_date` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - You are about to alter the column `last_sync_date` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - You are about to alter the column `created_at` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updated_at` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `created_at` on the `OrderItem` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updated_at` on the `OrderItem` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `created_at` on the `PrintOrderTask` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updated_at` on the `PrintOrderTask` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - A unique constraint covering the columns `[shipstation_product_id]` on the table `Product` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Customer` ADD COLUMN `address_verified_status` VARCHAR(50) NULL,
    ADD COLUMN `is_residential` BOOLEAN NULL,
    MODIFY `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updated_at` TIMESTAMP NULL;

-- AlterTable
ALTER TABLE `Order` DROP COLUMN `order_source`,
    ADD COLUMN `amount_paid` DECIMAL(10, 2) NULL,
    ADD COLUMN `order_weight_units` VARCHAR(20) NULL,
    ADD COLUMN `order_weight_value` DECIMAL(10, 4) NULL,
    ADD COLUMN `payment_method` VARCHAR(50) NULL,
    ADD COLUMN `shipstation_store_id` INTEGER NULL,
    ADD COLUMN `tag_ids` JSON NULL,
    MODIFY `order_date` DATETIME NULL,
    MODIFY `payment_date` DATETIME NULL,
    MODIFY `ship_by_date` DATETIME NULL,
    MODIFY `shipped_date` DATETIME NULL,
    MODIFY `last_sync_date` DATETIME NULL,
    MODIFY `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updated_at` TIMESTAMP NULL;

-- AlterTable
ALTER TABLE `OrderItem` MODIFY `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updated_at` TIMESTAMP NULL;

-- AlterTable
ALTER TABLE `PrintOrderTask` MODIFY `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updated_at` TIMESTAMP NULL;

-- AlterTable
ALTER TABLE `Product` ADD COLUMN `fulfillment_sku` VARCHAR(255) NULL,
    ADD COLUMN `item_weight_units` VARCHAR(20) NULL,
    ADD COLUMN `item_weight_value` DECIMAL(10, 4) NULL,
    ADD COLUMN `shipstation_product_id` INTEGER NULL,
    ADD COLUMN `upc` VARCHAR(50) NULL,
    ADD COLUMN `warehouse_location` VARCHAR(100) NULL;

-- CreateIndex
CREATE INDEX `Order_shipstation_store_id_idx` ON `Order`(`shipstation_store_id`);

-- CreateIndex
CREATE UNIQUE INDEX `Product_shipstation_product_id_key` ON `Product`(`shipstation_product_id`);

-- CreateIndex
CREATE INDEX `Product_shipstation_product_id_idx` ON `Product`(`shipstation_product_id`);
