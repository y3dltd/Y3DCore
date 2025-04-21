-- Fix empty stl_render_state values in PrintOrderTask table
UPDATE PrintOrderTask
SET stl_render_state = 'pending'
WHERE stl_render_state = '' OR stl_render_state IS NULL;
