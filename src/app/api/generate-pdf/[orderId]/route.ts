import { Customer, Order, OrderItem, Product } from '@prisma/client';
import bwipjs from 'bwip-js';

// import fs from 'fs/promises'; // No longer needed
import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

import { prisma } from "@/lib/prisma";

// Type definitions to match your database schema


// Type aliases for database records with optional fields
type OrderRecord = Order & {
    shipstation_order_number?: string | null;
    customerId?: number | null;
    shipping_address1?: string | null;
    shipping_address2?: string | null;
    shipping_city?: string | null;
    shipping_postcode?: string | null;
    shipping_country?: string | null;
    shipping_cost?: number | null;
    marketplace?: string | null;
    notes?: string | null;
};

type OrderItemRecord = OrderItem & {
    product?: Product | null;
    personalization_text?: string | null;
    color1_name?: string | null;
    color1_hex?: string | null;
    color2_name?: string | null;
    color2_hex?: string | null;
    description?: string | null;
    price?: number | null;
    sku?: string | null;
};

type CustomerRecord = Customer & {
    first_name?: string | null;
    last_name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
};

// --- Full CSS with Paged Media Rules --- 
const packingSlipCSS = `
      /* Enhanced styling for packing slip - v5: Layout & More Color */
      :root {
        /* Define brand colors */
        --brand-dark-start: #303030;
        --brand-dark-end: #1a1a1a;
        --brand-dark: #222;
        --brand-accent-start: #00d4ee; /* Lighter accent */
        --brand-accent-end: #00a8c0; /* Darker accent */
        --brand-accent: #00bcd4; /* Main accent */
        --brand-accent-light: #e0f7fa; /* Very light accent for backgrounds */
        --brand-light: #ffffff;
        --text-primary: #333;
        --text-secondary: #555;
        --border-color: #e0e0e0;
        --background-light: #f9f9f9;
        --border-radius-main: 12px;
        --border-radius-inner: 8px;
        /* Marketplace colors (examples) */
        --amazon-orange: #ff9900;
        --etsy-orange: #f16521;
        /* Add other marketplace colors */
        --ebay-blue: #3366cc;
        --website-color: var(--brand-accent); /* Use brand accent for direct website orders */
      }

      @page {
        size: A4;
        margin: 15mm; /* Set overall page margins */
      }

      body {
        font-family:
          'Poppins',
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          Roboto,
          Helvetica,
          Arial,
          sans-serif;
        margin: 0; /* Body margin is 0, @page margin controls spacing */
        padding: 0; /* Body padding is 0 */
        color: var(--text-primary);
        background-color: var(--brand-light);
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      /* Simulate container for PDF - remove body padding/margin, use @page margin */
      .container-for-pdf {
         /* No border or shadow needed for direct PDF generation */
        /* border: 1px solid var(--border-color); */
        /* padding: 0; */
        max-width: 100%; /* Use full page width dictated by @page */
        /* margin: 0; */
        background-color: var(--brand-light);
        /* box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1); */
        /* border-radius: var(--border-radius-main); */
        /* overflow: hidden; */ /* Avoid overflow hidden for page breaking */
      }

      /* Barcode Area Styling */
      .barcode-area {
        padding: 10px 30px 8px 30px; /* Reduced padding */
        background-color: var(--brand-light); /* Changed to white */
        text-align: center;
        border-bottom: 1px solid var(--border-color);
      }
      /* Use img for barcode now, remove CSS barcode simulation */
      .barcode-graphic {
        display: inline-block;
        border: 1px solid #ccc;
        padding: 4px 6px;
        background-color: white;
        height: 40px;
        margin-bottom: 5px;
        line-height: 0; /* Important for img alignment */
      }
      .barcode-graphic img {
          display: block;
          height: 100%;
          width: auto;
      }
      .barcode-text {
        font-family: 'Courier New', Courier, monospace;
        font-size: 0.9em;
        color: var(--text-primary);
        letter-spacing: 1px;
      }

      /* Header Styling with Gradient */
      .header {
        background: linear-gradient(to bottom, var(--brand-dark-start), var(--brand-dark-end));
        color: var(--brand-light);
        padding: 20px 30px; /* Reduced padding */
        text-align: center;
        border-bottom: 4px solid var(--brand-accent);
        position: relative;
        /* transition: border-color 0.3s ease; */ /* Transition not useful for PDF */
        /* Apply top radius if header is first element */
        border-top-left-radius: var(--border-radius-main);
        border-top-right-radius: var(--border-radius-main);
        overflow: hidden;
      }
      .header img.logo {
        max-height: 60px;
        margin-bottom: 15px;
        filter: brightness(0) invert(1);
      }
      .header h1 {
        margin: 0;
        font-size: 1.7em;
        font-weight: 600;
        color: var(--brand-light);
      }
      .header h1 span {
        color: var(--brand-accent);
        font-weight: 700;
      }

      /* Marketplace Logo Styling & Header Color Change */
      .marketplace-info {
        position: absolute;
        top: 15px;
        right: 20px;
        text-align: right;
      }
      .marketplace-logo {
        max-height: 30px;
        max-width: 100px;
        display: none; /* Hide all by default */
        margin-bottom: 5px;
      }
      .marketplace-name {
        font-size: 0.8em;
        color: #ccc;
        display: none; /* Hide all by default */
      }
      /* Show logo/name AND change header border based on body class */
      body.amazon-order .marketplace-info .amazon-logo,
      body.amazon-order .marketplace-info .amazon-name {
        display: block;
      }
      body.amazon-order .header {
        border-bottom-color: var(--amazon-orange);
      }

      body.etsy-order .marketplace-info .etsy-logo,
      body.etsy-order .marketplace-info .etsy-name {
        display: block;
      }
      body.etsy-order .header {
        border-bottom-color: var(--etsy-orange);
      }

      body.ebay-order .marketplace-info .ebay-logo,
      body.ebay-order .marketplace-info .ebay-name {
        display: block;
      }
      body.ebay-order .header {
        border-bottom-color: var(--ebay-blue);
      }

      /* Add more classes/styles for other marketplaces (e.g., website) */
      body.website-order .marketplace-info .website-logo, /* Assuming you might add a 'website' logo */
      body.website-order .marketplace-info .website-name {
        display: block;
      }
      body.website-order .header {
        border-bottom-color: var(--website-color);
      } /* Uses brand accent */

      /* Content Padding */
      .content-padding {
        padding: 25px 30px; /* Reduced padding */
      }

      .order-info {
        text-align: right;
        font-size: 0.9em;
        color: var(--text-secondary);
        margin-bottom: 30px;
      }
      .order-info strong {
        color: var(--text-primary);
        font-weight: 600;
      }

      /* Addresses Styling - Ensure side-by-side */
      .addresses {
        display: flex;
        /* Removed flex-wrap: wrap; to force side-by-side, will rely on min-width for basic wrapping */
        justify-content: space-between;
        gap: 25px;
        margin-bottom: 35px;
        font-size: 0.95em;
        line-height: 1.5;
        page-break-inside: avoid;
      }
      .address-block {
        /* Use flex-grow: 1 to allow them to share space */
        flex-grow: 1;
        /* Use flex-basis: 0 to let flex-grow control the width primarily */
        flex-basis: 0;
        /* Set a min-width to force wrapping on very small screens */
        min-width: 250px; /* Adjust as needed */
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius-inner);
        padding: 20px;
        background-color: #fff;
        position: relative;
      }
      .address-block h3 {
        margin-top: 0;
        margin-bottom: 12px;
        font-size: 1.1em;
        font-weight: 600;
        color: var(--brand-dark);
        border-bottom: 2px solid var(--brand-accent);
        padding-bottom: 6px;
        display: inline-block;
      }
      .yorkshire-badge {
        position: absolute;
        top: 10px;
        right: 10px;
        font-size: 0.75em;
        font-weight: 600;
        color: var(--brand-accent);
        border: 1px solid var(--brand-accent);
        padding: 2px 5px;
        border-radius: 4px;
        opacity: 0.8;
      }

      /* Greeting Styling - Added Background Color */
      .greeting {
        text-align: center;
        margin: 15px auto 35px auto;
        font-size: 1.15em;
        font-weight: 500;
        color: var(--text-primary);
        max-width: 95%; /* Allow slightly wider */
        /* Added light accent background and padding */
        background-color: var(--brand-accent-light);
        padding: 15px 20px;
        border-radius: var(--border-radius-inner);
        border-left: 4px solid var(--brand-accent); /* Accent border */
        page-break-inside: avoid;
      }

      /* Items Table Styling - Rounded Headers */
      .items-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        margin-bottom: 35px;
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius-inner);
        overflow: hidden; /* Keep overflow hidden for table radius */
        page-break-inside: avoid;
      }
       .items-table tbody tr {
           page-break-inside: avoid !important; /* Attempt to prevent rows breaking */
       }
      .items-table th,
      .items-table td {
        border-bottom: 1px solid var(--border-color);
        padding: 15px 12px;
        text-align: left;
        font-size: 0.95em;
        vertical-align: top;
      }
      .items-table th {
        background: linear-gradient(to bottom, var(--brand-accent-start), var(--brand-accent-end));
        /* background-color: var(--brand-accent); */ /* Gradient provides fallback */
        color: var(--brand-light);
        font-weight: 600;
        border-bottom: none;
      }
      .items-table thead th:first-child {
        border-top-left-radius: calc(var(--border-radius-inner) - 1px);
      }
      .items-table thead th:last-child {
        border-top-right-radius: calc(var(--border-radius-inner) - 1px);
      }
      .items-table tbody tr:last-child td {
        border-bottom: none;
      }

      /* Item Details & Color Swatches */
      .items-table .item-details {
        padding-left: 5px;
        margin-top: 8px;
        font-size: 0.9em;
        color: var(--text-secondary);
        line-height: 1.7;
      }
      .item-details strong {
        color: var(--text-primary);
        font-weight: 500;
        margin-right: 3px;
        display: inline-block;
        min-width: 80px;
      }
      .color-swatch {
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 1px solid #ccc;
        margin-left: 5px;
        vertical-align: middle;
        position: relative;
        top: -1px;
      }

      .items-table .col-qty,
      .items-table .col-price {
        text-align: right;
        width: 15%;
        white-space: nowrap;
        font-weight: 500;
      }
      .items-table .col-item {
        width: 70%;
        font-weight: 500;
      }

      /* Totals Styling - Accent Border */
      .totals {
        text-align: right;
        margin-bottom: 35px;
        padding: 20px 0 0 0;
        /* Changed border to solid accent color */
        border-top: 2px solid var(--brand-accent);
        font-size: 1em;
        line-height: 1.8;
        page-break-inside: avoid;
      }
      .totals span {
        color: var(--text-secondary);
        margin-right: 15px;
      }
      .totals strong {
        font-size: 1.25em;
        font-weight: 700;
        color: var(--brand-accent);
      }
      .totals strong span {
        color: var(--brand-dark);
        font-size: 1rem;
        font-weight: 600;
      }

      /* Footer Styling with Gradient */
      .footer {
        background: linear-gradient(to top, var(--brand-dark-start), var(--brand-dark-end));
        color: #ccc;
        padding: 25px 30px; /* Reduced padding */
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 20px; /* Reduced gap slightly */
        /* Apply bottom radius if footer is last element */
        border-bottom-left-radius: var(--border-radius-main);
        border-bottom-right-radius: var(--border-radius-main);
        overflow: hidden;
        page-break-inside: avoid; /* Try to keep footer together */
      }
      .footer-thanks {
        font-size: 0.95em;
        font-style: italic;
        flex-basis: calc(60% - 18px);
        min-width: 260px;
        line-height: 1.6;
      }
      .footer-thanks i {
        color: var(--brand-light);
        font-weight: 500;
      }
      .footer-qr {
        text-align: center;
        flex-basis: calc(35% - 18px);
        min-width: 140px;
        background-color: var(--brand-light);
        padding: 20px 15px;
        border-radius: var(--border-radius-inner);
        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
      }
      .footer-qr img {
        max-width: 105px;
        height: auto;
        display: block;
        margin: 0 auto 12px auto;
      }
      .footer-qr span {
        font-size: 0.9em;
        color: var(--brand-dark);
        font-weight: 600;
      }

      /* Contact Info Styling - Accent Border */
      .contact-info {
        text-align: center;
        padding: 15px 30px; /* Reduced padding */
        font-size: 0.9em;
        color: var(--text-secondary);
        background-color: #f0f0f0;
        /* Added accent top border */
        border-top: 3px solid var(--brand-accent);
      }
      .contact-info a {
        color: var(--brand-accent);
        text-decoration: none;
        font-weight: 500;
      }
      .contact-info a:hover {
        text-decoration: underline;
      }

      /* Print-specific optimizations - Adapt for Puppeteer */
      /* Puppeteer uses screen styles primarily with printBackground: true */
      /* Some @media print rules might still be influential */
      @media print {
        body {
          /* margin: 0; */ /* Controlled by @page */
          /* padding: 0; */
          /* background-color: var(--brand-light); */ /* Should be inherited */
          /* color: #000 !important; */ /* Avoid !important if possible */
           color: #000;
           font-size: 10pt; /* Adjust base font size for print */
        }

        /* Headers and footers: Ensure background prints */
        .header,
        .footer,
        .items-table th {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

         /* Simplify borders for print if needed */
        .address-block {
            border: 1px solid #ccc;
        }
        .items-table {
            border: 1px solid #ccc;
        }
        .items-table th,
        .items-table td {
            border-bottom: 1px solid #ddd;
        }
         .items-table tbody tr:last-child td {
            border-bottom: none;
        }
        .footer-qr {
             border: 1px solid #ccc;
             box-shadow: none;
        }

        /* Hide elements not wanted in print */
         .yorkshire-badge {
            display: none;
         }
         /* Consider hiding marketplace info unless needed on printed slip */
         /* .marketplace-info { display: none; } */
      }
`;

// --- Define Order Data Structure (More Specific) ---
// Replace this with your actual Prisma type or a more detailed interface
interface OrderData {
    orderId: string;
    shipstation_order_number: string;
    orderDate: string; // Format: YYYY-MM-DD
    customerFirstName: string;
    customerLastName: string;
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    postcode: string;
    country: string;
    items: Array<{
        itemName: string;
        itemSKU: string;
        personalizationText?: string | null;
        personalizationColor1?: string | null; // e.g., "Yellow & Black"
        personalizationColor1Hex?: string | null; // e.g., "#FFEB3B"
        personalizationColor2?: string | null;
        personalizationColor2Hex?: string | null;
        quantity: number;
        price: number; // Price per item
    }>;
    subtotalPrice: number;
    shippingPrice: number;
    totalPrice: number;
    notes?: string | null;
    qrCodeUrl?: string | null;
    marketplace?: 'amazon' | 'etsy' | 'ebay' | 'website' | null;
    // Add any other fields needed for the template
}

// --- HTML Generation Functions --- 
async function generatePackingSlipHTML(orderData: OrderData): Promise<string> {
    const marketplaceClass = orderData.marketplace ? `${orderData.marketplace}-order` : 'website-order';
    let barcodeDataUrl = '';
    try {
        const pngBuffer = await bwipjs.toBuffer({
            bcid: 'code128',
            text: orderData.shipstation_order_number,
            scale: 3,
            height: 10,
            includetext: false,
            textxalign: 'center',
            backgroundcolor: 'ffffff',
        });
        barcodeDataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
    } catch (e) {
        console.error('bwip-js barcode PNG generation failed:', e);
        barcodeDataUrl = '#error';
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;

    // Use simple SVG placeholder for QR code to avoid external request
    const qrCodePlaceholderSvg =
        `<svg width="105" height="105" viewBox="0 0 105 105" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="105" height="105" fill="#eee"/>
            <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#888">QR Placeholder</text>
            <rect x="0.5" y="0.5" width="104" height="104" stroke="#ccc" stroke-dasharray="2 2"/>
        </svg>`;
    const qrCodeImgTag = orderData.qrCodeUrl
        ? `<img src="${orderData.qrCodeUrl.startsWith('http') ? orderData.qrCodeUrl : siteUrl + orderData.qrCodeUrl}" alt="Scan for care tips or special offer" />`
        : qrCodePlaceholderSvg; // Use SVG placeholder

    const itemRows = orderData.items.map(item => `
        <tr>
          <td class="col-item">
            ${item.itemName} (SKU: ${item.itemSKU})
            ${item.personalizationText || item.personalizationColor1 ? `
            <div class="item-details">
              ${item.personalizationText ? `<strong>Name/Text:</strong> ${item.personalizationText}<br />` : ''}
              ${item.personalizationColor1 ? `<strong>Base Colour:</strong> ${item.personalizationColor1} <span class="color-swatch" style="background-color: ${item.personalizationColor1Hex || '#ccc'};"></span><br />` : ''}
              ${item.personalizationColor2 ? `<strong>Text Colour:</strong> ${item.personalizationColor2} <span class="color-swatch" style="background-color: ${item.personalizationColor2Hex || '#ccc'};"></span>` : ''}
            </div>` : ''}
          </td>
          <td class="col-qty">${item.quantity}</td>
          <td class="col-price">£${item.price.toFixed(2)}</td>
        </tr>
    `).join('');

    return `
        <!doctype html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Packing Slip ${orderData.shipstation_order_number}</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>${packingSlipCSS}</style>
        </head>
        <body class="${marketplaceClass}">

            <!-- Header Section -->
            <div class="page-header-area">
                 <div class="barcode-area">
                    <div class="barcode-graphic">
                        ${barcodeDataUrl !== '#error' ? `<img src="${barcodeDataUrl}" alt="Barcode" />` : '<span style="color:red; font-size:10px;">Barcode Error</span>'} 
                    </div>
                    <div class="barcode-text">${orderData.shipstation_order_number}</div>
                </div>
                <div class="header">
                    <div class="marketplace-info">
                         <img src="${siteUrl}/fav/marketplace/amazon_logo.svg" alt="Amazon Logo" class="marketplace-logo amazon-logo" />
                         <img src="${siteUrl}/fav/marketplace/etsy_logo.svg" alt="Etsy Logo" class="marketplace-logo etsy-logo" />
                         <img src="${siteUrl}/fav/marketplace/ebay_logo.svg" alt="eBay Logo" class="marketplace-logo ebay-logo" />
                         <div class="marketplace-name amazon-name">Sold on Amazon</div>
                         <div class="marketplace-name etsy-name">Sold on Etsy</div>
                         <div class="marketplace-name ebay-name">Sold on eBay</div>
                         <div class="marketplace-name website-name">Sold on Yorkshire3D.co.uk</div> 
                    </div>
                    <img src="${siteUrl}/y3dlogo-pdf.png" alt="Yorkshire3D Logo" class="logo" />
                    <h1>Specially Made For <span>${orderData.customerFirstName}</span>!</h1>
                </div>
            </div>

            <!-- Main Content Section -->
            <div class="printable-content">
                <div class="content-padding">
                    <div class="order-info">
                      <strong>Order #:</strong> ${orderData.shipstation_order_number}<br />
                      <strong>Date:</strong> ${orderData.orderDate}
                    </div>
                    <div class="addresses">
                        <div class="address-block">
                            <span class="yorkshire-badge">Made in Yorkshire</span>
                            <h3>Ship To:</h3>
                            ${orderData.customerFirstName} ${orderData.customerLastName}<br />
                            ${orderData.addressLine1}<br />
                            ${orderData.addressLine2 ? `${orderData.addressLine2}<br />` : ''}
                            ${orderData.city}, ${orderData.postcode}<br />
                            ${orderData.country}
                          </div>
                          <div class="address-block">
                            <h3>From:</h3>
                            Yorkshire3D Limited<br />
                            53 Woodlea Avenue<br />
                            Huddersfield, HD3 4EF<br />
                            United Kingdom
                          </div>
                    </div>
                    <div class="greeting">
                         Hi ${orderData.customerFirstName}, we really enjoyed creating this for you!
                    </div>
                    <table class="items-table">
                       <thead>
                        <tr>
                          <th class="col-item">Item</th>
                          <th class="col-qty">Qty</th>
                          <th class="col-price">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${itemRows}
                      </tbody>
                    </table>
                     ${orderData.notes ? `
                     <div class="notes-content-wrapper">
                        <h3>Order Notes:</h3>
                        <div class="notes-content">${orderData.notes}</div>
                    </div>
                     ` : ''}
                     <div class="totals">
                        <span>Subtotal:</span> £${orderData.subtotalPrice.toFixed(2)}<br />
                        <span>Shipping:</span> £${orderData.shippingPrice.toFixed(2)}<br />
                        <strong><span>Total:</span> £${orderData.totalPrice.toFixed(2)}</strong>
                     </div>
                </div>
            </div>

             <!-- Footer Section -->
             <div class="page-footer-area">
                 <div class="footer">
                     <div class="footer-thanks">
                        Your support for our small Yorkshire business means the world! We hope your ${orderData.items[0]?.itemName || 'item'} brings a smile. Enjoy!<br />
                        <i>- Jayson & The Yorkshire3D Team</i>
                    </div>
                    <div class="footer-qr">
                        ${qrCodeImgTag}
                        <span>Scan for a surprise!</span>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
}

// --- Real Data Fetching --- 
async function getOrderData(orderId: string): Promise<OrderData> {
    console.log(`Fetching real data for order: ${orderId}`);

    try {
        // Using defined types instead of any
        const orderData = await prisma.order.findUnique({
            where: { id: parseInt(orderId, 10) }
        }) as OrderRecord;

        if (!orderData) {
            throw new Error(`Order not found: ${orderId}`);
        }

        // Fetch order items with product data
        const orderItems = await prisma.orderItem.findMany({
            where: { orderId: parseInt(orderId, 10) },
            include: { product: true }
        }) as OrderItemRecord[];

        // Fetch customer if customerId exists
        let customerData: CustomerRecord | null = null;
        if (orderData.customerId) {
            customerData = await prisma.customer.findUnique({
                where: { id: orderData.customerId }
            }) as CustomerRecord;
        }

        // Calculate prices
        let subtotalPrice = 0;
        const items = orderItems.map((item: OrderItemRecord) => {
            const itemPrice = Number(item.price || 0);
            subtotalPrice += itemPrice * (item.quantity || 1);

            return {
                itemName: item.product?.name || item.description || 'Product',
                itemSKU: item.product?.sku || item.sku || '',
                personalizationText: item.personalization_text || null,
                personalizationColor1: item.color1_name || null,
                personalizationColor1Hex: item.color1_hex || null,
                personalizationColor2: item.color2_name || null,
                personalizationColor2Hex: item.color2_hex || null,
                quantity: item.quantity || 1,
                price: itemPrice
            };
        });

        const shippingPrice = Number(orderData.shipping_cost || 0);
        const totalPrice = subtotalPrice + shippingPrice;

        // Extract customer info
        let firstName = 'Customer';
        let lastName = '';

        if (customerData) {
            firstName = customerData.first_name || customerData.firstName || 'Customer';
            lastName = customerData.last_name || customerData.lastName || '';
        }

        // Return formatted order data
        return {
            orderId: orderData.id.toString(),
            shipstation_order_number: orderData.shipstation_order_number || `Order-${orderData.id}`,
            orderDate: new Date(orderData.created_at || orderData.updated_at || new Date()).toISOString().split('T')[0],
            customerFirstName: firstName,
            customerLastName: lastName,
            addressLine1: orderData.shipping_address1 || '',
            addressLine2: orderData.shipping_address2 || null,
            city: orderData.shipping_city || '',
            postcode: orderData.shipping_postcode || '',
            country: orderData.shipping_country || 'United Kingdom',
            items,
            subtotalPrice,
            shippingPrice,
            totalPrice,
            notes: orderData.notes || null,
            qrCodeUrl: null,
            marketplace: orderData.marketplace as OrderData['marketplace'] || 'website',
        };
    } catch (error: unknown) {
        console.error('Error fetching order data:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to process order data: ${errorMessage}`);
    }
}

// --- API Route Handler --- 
export async function GET(
    request: Request,
    { params }: { params: { orderId: string } }
) {
    const orderId = params.orderId;
    if (!orderId) {
        return new NextResponse('Order ID is required', { status: 400 });
    }

    let browser = null;
    try {
        console.log(`Generating PDF for order ${orderId}...`);
        const orderData = await getOrderData(orderId);
        if (!orderData || !orderData.shipstation_order_number) {
            throw new Error('Failed to retrieve valid order data.');
        }

        // Generate the single, complete HTML document
        const fullHtml = await generatePackingSlipHTML(orderData);

        console.log('Launching browser...');
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none']
        });
        const page = await browser.newPage();

        // --- Add Page Console/Error Logging --- 
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', error => {
            console.error(`PAGE ERROR: ${error.message}`);
        });
        page.on('requestfailed', request => {
            console.error(`Puppeteer Request Failed: ${request.url()} (${request.failure()?.errorText})`);
        });
        page.on('response', response => {
            if (!response.ok()) {
                console.warn(`Puppeteer Response Issue: ${response.url()} (${response.status()} ${response.statusText()})`);
            }
        });
        // ------------------------------------

        console.log('Setting content...');
        await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

        console.log('Generating PDF...');
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
            timeout: 60000, // Restore default PDF timeout
            preferCSSPageSize: true
        });

        console.log(`PDF generated successfully for order ${orderId}. Size: ${pdfBuffer.length} bytes.`);
        await browser.close();

        const filename = `Yorkshire3D_Order_${orderData.shipstation_order_number}_${new Date().toISOString().split('T')[0]}.pdf`;
        return new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="${filename}"`
            },
        });

    } catch (error) {
        console.error(`Error generating PDF for order ${orderId}:`, error);
        // Add more specific error logging if needed
        if (error instanceof Error && error.message.includes('Timeout')) {
            console.error('Timeout likely waiting for Paged.js. Check CSS/HTML complexity or selector.');
        }
        return new NextResponse('Error generating PDF', { status: 500 });
    }
} 
