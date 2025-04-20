-- Delete print tasks for product SKU 'PER-KEY3D-STY3-Y3D'
DELETE FROM `PrintOrderTask`
WHERE productId IN (
    SELECT id FROM `Product` WHERE sku = 'PER-KEY3D-STY3-Y3D'
);
