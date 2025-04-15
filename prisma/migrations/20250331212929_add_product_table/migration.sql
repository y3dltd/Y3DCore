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
  - You are about to drop the column `image_url` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `model_file_path` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `model_name` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `shorthandProductName` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `sku` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to alter the column `created_at` on the `OrderItem` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updated_at` on the `OrderItem` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to drop the column `product_name` on the `PrintOrderTask` table. All the data in the column will be lost.
  - You are about to drop the column `shorthandProductName` on the `PrintOrderTask` table. All the data in the column will be lost.
  - You are about to drop the column `sku` on the `PrintOrderTask` table. All the data in the column will be lost.
  - You are about to alter the column `created_at` on the `PrintOrderTask` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updated_at` on the `PrintOrderTask` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - Added the required column `productId` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productId` to the `PrintOrderTask` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX `PrintOrderTask_shorthandProductName_idx` ON `PrintOrderTask`;

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
ALTER TABLE `OrderItem` DROP COLUMN `image_url`,
    DROP COLUMN `model_file_path`,
    DROP COLUMN `model_name`,
    DROP COLUMN `shorthandProductName`,
    DROP COLUMN `sku`,
    ADD COLUMN `productId` INTEGER NOT NULL,
    MODIFY `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updated_at` TIMESTAMP NULL;

-- AlterTable
ALTER TABLE `PrintOrderTask` DROP COLUMN `product_name`,
    DROP COLUMN `shorthandProductName`,
    DROP COLUMN `sku`,
    ADD COLUMN `productId` INTEGER NOT NULL,
    MODIFY `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updated_at` TIMESTAMP NULL;

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

    UNIQUE INDEX `Product_sku_key`(`sku`),
    INDEX `Product_sku_idx`(`sku`),
    INDEX `Product_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `OrderItem_productId_idx` ON `OrderItem`(`productId`);

-- CreateIndex
CREATE INDEX `PrintOrderTask_productId_idx` ON `PrintOrderTask`(`productId`);

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrintOrderTask` ADD CONSTRAINT `PrintOrderTask_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
