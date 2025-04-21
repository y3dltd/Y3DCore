-- First, fix any existing invalid values
UPDATE PrintOrderTask
SET stl_render_state = 'pending'
WHERE stl_render_state = '' OR stl_render_state IS NULL;

-- Then, modify the column to be non-nullable with a default value
ALTER TABLE `PrintOrderTask` MODIFY `stl_render_state` ENUM('pending', 'running', 'completed', 'failed') NOT NULL DEFAULT 'pending';
