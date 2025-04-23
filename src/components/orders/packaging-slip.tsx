'use client';

import { SerializableOrderDetailsData } from '@/types/order-details';

interface PackagingSlipProps {
  order: SerializableOrderDetailsData;
}

// Function to get appropriate class based on marketplace
const getMarketplaceClass = (order: SerializableOrderDetailsData) => {
  const marketplace = order.marketplace?.toLowerCase() || '';
  if (marketplace.includes('amazon')) return 'amazon-order';
  if (marketplace.includes('etsy')) return 'etsy-order';
  if (marketplace.includes('ebay')) return 'ebay-order';
  return 'website-order'; // Default or direct website
};

// Helper to get color string safely
const getColor = (color: string | null | undefined, defaultColor = 'transparent') => {
  if (!color || !/^#([0-9A-F]{3}){1,2}$/i.test(color)) return defaultColor;
  return color;
};

// Fixed barcode pattern heights
const barcodeHeights = [
  '95%',
  '90%',
  '98%',
  '88%',
  '92%',
  '97%',
  '85%',
  '99%',
  '89%',
  '94%',
  '96%',
  '87%',
  '93%',
  '91%',
  '98%',
  '86%',
  '90%',
  '94%',
  '88%',
  '97%',
  '92%',
  '85%',
  '99%',
  '91%',
  '95%',
  '89%',
  '96%',
  '87%',
  '93%',
  '90%',
];

export function PackagingSlip({ order }: PackagingSlipProps) {
  // Format date consistently
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  };

  const orderDate = formatDate(order.created_at);
  const orderNumber = order.shipstation_order_number || order.id;
  const marketplaceClass = getMarketplaceClass(order);
  const customerFirstName = order.customer?.name?.split(' ')[0] || 'there';

  return (
    <div
      id="packaging-slip-template"
      data-order-id={order.id}
      data-marketplace-class={marketplaceClass} // Pass class for JS access
      className="hidden" // Keep hidden in main UI
    >
      <div className="container" style={{ maxWidth: '750px' }}>
        {' '}
        {/* Enforce width */}
        <div className="barcode-area">
          <div className="barcode-graphic" aria-label="Order Barcode Placeholder">
            {/* Use a fixed pattern for barcode to prevent hydration mismatch */}
            {barcodeHeights.map((height, i) => (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  width: i % 3 === 0 ? '3px' : '2px',
                  height: height,
                  backgroundColor: '#000000',
                  margin: '0 1px',
                  verticalAlign: 'top',
                }}
              ></span>
            ))}
          </div>
          <div className="barcode-text">{orderNumber}</div>
        </div>
        <div className="header">
          <div className="marketplace-info">
            <span className="marketplace-name amazon-name">Sold on Amazon</span>
            <span className="marketplace-name etsy-name">Sold on Etsy</span>
            <span className="marketplace-name ebay-name">Sold on eBay</span>
            <span className="marketplace-name website-name">Yorkshire3D Direct</span>
          </div>
          <div
            style={{ fontSize: '28px', fontWeight: 'bold', color: '#ffffff', marginBottom: '15px' }}
          >
            Yorkshire3D
          </div>
          <h1>
            Specially Made For <span>{customerFirstName}</span>!
          </h1>
        </div>
        <div className="content-padding">
          <div className="order-info">
            <strong>Order #:</strong> {orderNumber}
            <br />
            <strong>Date:</strong> {orderDate}
          </div>

          <div className="addresses">
            <div className="address-block">
              <span className="yorkshire-badge">Made in Yorkshire</span>
              <h3>Ship To:</h3>
              {order.customer?.name || 'N/A'}
              <br />
              {order.customer?.address || 'N/A'}
              <br />
              {order.customer?.city || 'N/A'}, {order.customer?.state || ''}{' '}
              {order.customer?.postal_code || 'N/A'}
              <br />
              {order.customer?.country || 'N/A'}
            </div>
            <div className="address-block">
              <h3>From:</h3>
              Yorkshire3D Limited
              <br />
              53 Woodlea Avenue
              <br />
              Huddersfield, HD3 4EF
              <br />
              United Kingdom
            </div>
          </div>

          <div className="greeting">
            Hi {customerFirstName}, we really enjoyed creating this for you!
          </div>

          <table className="items-table">
            <thead>
              <tr>
                <th className="col-item">Item</th>
                <th className="col-qty">Qty</th>
                <th className="col-price">SKU</th>
              </tr>
            </thead>
            <tbody>
              {/* Ensure no extra whitespace around map or within tags */}
              {order.items?.map((item, index) => (
                <tr key={index}>
                  <td className="col-item">
                    {item.product?.name || 'N/A'}
                    <div className="item-details">
                      {item.printTasks?.[0]?.custom_text && (
                        <div>
                          <strong>Name/Text:</strong>
                          {` ${item.printTasks[0].custom_text}`}
                        </div>
                      )}
                      {item.printTasks?.[0]?.color_1 && (
                        <div>
                          <strong>Base Colour:</strong>
                          {` ${item.printTasks[0].color_1}`}
                          <span
                            className="color-swatch"
                            style={{ backgroundColor: getColor(item.printTasks[0].color_1) }}
                          ></span>
                        </div>
                      )}
                      {item.printTasks?.[0]?.color_2 && (
                        <div>
                          <strong>Text Colour:</strong>
                          {` ${item.printTasks[0].color_2}`}
                          <span
                            className="color-swatch"
                            style={{ backgroundColor: getColor(item.printTasks[0].color_2) }}
                          ></span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="col-qty">{item.quantity}</td>
                  <td className="col-price">{item.product?.sku || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginBottom: '35px' }}>
            <h3
              style={{
                fontSize: '1.1em',
                fontWeight: '600',
                color: '#222222',
                borderBottom: '2px solid var(--brand-accent)',
                paddingBottom: '6px',
                display: 'inline-block',
                marginBottom: '12px',
              }}
            >
              Order Notes:
            </h3>
            <p
              className="notes-content"
              style={{
                margin: '0',
                padding: '15px',
                border: '1px solid #e0e0e0',
                minHeight: '50px',
                color: '#555555',
                backgroundColor: '#f9f9f9',
                borderRadius: '8px',
                fontSize: '0.95em',
              }}
            >
              {order.customer_notes || 'No notes for this order.'}
            </p>
          </div>
        </div>
        <div className="footer">
          <div className="footer-thanks">
            Your support for our small Yorkshire business means the world! We hope your product
            brings a smile. Enjoy!
            <br />
            <i>- Jayson & The Yorkshire3D Team</i>
          </div>
          <div className="footer-qr">
            <div
              style={{
                width: '105px',
                height: '105px',
                border: '1px dashed #aaaaaa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px auto',
                backgroundColor: '#eeeeee',
              }}
            >
              <span style={{ fontSize: '0.8em', color: '#666666' }}>QR Code</span>
            </div>
            <span>Scan for a surprise!</span>
          </div>
        </div>
        <div className="contact-info">
          Questions? Email: <a href="mailto:support@yorkshire3d.co.uk">support@yorkshire3d.co.uk</a>{' '}
          | Visit:{' '}
          <a href="https://www.yorkshire3d.co.uk" target="_blank">
            yorkshire3d.co.uk
          </a>
        </div>
      </div>
    </div>
  );
}
