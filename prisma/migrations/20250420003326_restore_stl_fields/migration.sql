-- AlterTable
ALTER TABLE `PrintOrderTask` ADD COLUMN `render_retries` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `stl_path` VARCHAR(512) NULL,
    ADD COLUMN `stl_render_state` ENUM('pending', 'running', 'completed', 'failed') NOT NULL DEFAULT 'pending';

