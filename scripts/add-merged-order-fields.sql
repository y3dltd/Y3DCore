-- Add merged order tracking fields to the Order table
ALTER TABLE `Order`
ADD COLUMN `is_merged` BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN `merged_to_order_id` INT NULL,
ADD COLUMN `merged_from_order_ids` JSON NULL;

-- Add indexes to improve query performance for merged orders
CREATE INDEX `Order_is_merged_idx` ON `Order` (`is_merged`);
CREATE INDEX `Order_merged_to_order_id_idx` ON `Order` (`merged_to_order_id`);
