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
  - You are about to alter the column `created_at` on the `OrderItem` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updated_at` on the `OrderItem` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `created_at` on the `PrintOrderTask` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updated_at` on the `PrintOrderTask` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - A unique constraint covering the columns `[orderItemId,taskIndex]` on the table `PrintOrderTask` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `orderItemId` to the `PrintOrderTask` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `PrintOrderTask` DROP FOREIGN KEY `PrintOrderTask_orderId_fkey`;

-- DropIndex
DROP INDEX `PrintOrderTask_orderId_sku_product_name_key` ON `PrintOrderTask`;

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
    MODIFY `updated_at` TIMESTAMP NULL;

-- AlterTable
ALTER TABLE `OrderItem` MODIFY `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updated_at` TIMESTAMP NULL;

-- AlterTable
ALTER TABLE `PrintOrderTask` ADD COLUMN `orderItemId` INTEGER NOT NULL,
    ADD COLUMN `taskIndex` INTEGER NOT NULL DEFAULT 0,
    MODIFY `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updated_at` TIMESTAMP NULL;

-- CreateIndex
CREATE INDEX `PrintOrderTask_orderItemId_idx` ON `PrintOrderTask`(`orderItemId`);

-- CreateIndex
CREATE UNIQUE INDEX `PrintOrderTask_orderItemId_taskIndex_key` ON `PrintOrderTask`(`orderItemId`, `taskIndex`);

-- AddForeignKey
ALTER TABLE `PrintOrderTask` ADD CONSTRAINT `PrintOrderTask_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrintOrderTask` ADD CONSTRAINT `PrintOrderTask_orderItemId_fkey` FOREIGN KEY (`orderItemId`) REFERENCES `OrderItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
