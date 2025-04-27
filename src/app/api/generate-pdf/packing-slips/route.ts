import puppeteer from 'puppeteer'
import bwipjs from 'bwip-js'
import fs from 'fs'
import path from 'path'

import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

// -----------------------------------------------------------------------------
//  Data Models
// -----------------------------------------------------------------------------
interface ItemInfo {
    name: string
    sku: string
    quantity: number
    price: number
    imageUrl: string | null
    personalization?: {
        text?: string | null
        color1?: string | null
        color2?: string | null
    }
}

interface SlipData {
    orderNumber: string
    orderDate: string
    customerFirstName: string
    customerLastName: string
    addressHtml: string
    marketplace: 'amazon' | 'etsy' | 'ebay' | 'website'
    items: ItemInfo[]
    subtotal: number
    shipping: number
    total: number
    notes: string | null
    barcodeDataUrl: string
    qrCodeImg: string
}

// --- Utility: Fetch & shape data for one order ---
async function fetchSlipData(id: number): Promise<SlipData> {
    const order = await prisma.order.findUnique({
        where: { id },
        include: {
            items: {
                include: { product: true, printTasks: true },
            },
            customer: true,
        },
    })

    if (!order) throw new Error(`Order ${id} not found`)

    // -------------------------------------------------------------
    //  Build item list & totals
    // -------------------------------------------------------------
    let subtotal = 0
    const items: ItemInfo[] = order.items.map((it) => {
        const price = Number(it.unit_price ?? 0)
        subtotal += price * (it.quantity ?? 1)
        return {
            name: it.product?.name ?? 'Item',
            sku: it.product?.sku ?? '',
            quantity: it.quantity ?? 1,
            price,
            imageUrl: it.product?.imageUrl
                ? it.product.imageUrl.startsWith('http')
                    ? it.product.imageUrl
                    : `${process.env.NEXT_PUBLIC_SITE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`}${it.product.imageUrl}`
                : null,
            personalization: {
                text: it.printTasks?.[0]?.custom_text ?? null,
                color1: it.printTasks?.[0]?.color_1 ?? null,
                color2: it.printTasks?.[0]?.color_2 ?? null,
            },
        }
    })

    const shipping = Number(order.shipping_price ?? 0)
    const total = subtotal + shipping

    // -------------------------------------------------------------
    //  Customer / address
    // -------------------------------------------------------------
    const customerFirstName = order.customer?.name?.split(' ')[0] ?? 'Customer'
    const customerLastName = order.customer?.name?.split(' ').slice(1).join(' ') ?? ''
    const addressHtml = [
        order.customer?.street1,
        order.customer?.street2,
        order.customer?.street3,
        [order.customer?.city, order.customer?.state].filter(Boolean).join(' '),
        order.customer?.postal_code,
        order.customer?.country,
    ]
        .filter(Boolean)
        .join('<br/>')

    // -------------------------------------------------------------
    //  Barcode as data URL (Code128)
    // -------------------------------------------------------------
    let barcodeDataUrl = ''
    try {
        const buf = await bwipjs.toBuffer({
            bcid: 'code128',
            text: order.shipstation_order_number ?? `Order-${order.id}`,
            scale: 3,
            height: 10,
            includetext: false,
        })
        barcodeDataUrl = `data:image/png;base64,${buf.toString('base64')}`
    } catch (e) {
        barcodeDataUrl = '#error'
    }

    // Real QR pointing to promo link
    let qrDataUrl = ''
    try {
        const qrBuf = await bwipjs.toBuffer({
            bcid: 'qrcode',
            text: `https://qr.yorkshire3d.co.uk/qr/redirect?order_no=${order.shipstation_order_number ?? order.id}`,
            scale: 4,
            includetext: false,
        })
        qrDataUrl = `data:image/png;base64,${qrBuf.toString('base64')}`
    } catch {
        // fallback placeholder svg
        qrDataUrl = `data:image/svg+xml;base64,${Buffer.from('<svg width="105" height="105" xmlns="http://www.w3.org/2000/svg"><rect width="105" height="105" fill="#eee"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#888">QR</text></svg>').toString('base64')}`
    }

    return {
        orderNumber: order.shipstation_order_number || `Order-${order.id}`,
        orderDate: new Date(order.created_at ?? order.updated_at ?? new Date())
            .toISOString()
            .split('T')[0],
        customerFirstName,
        customerLastName,
        addressHtml,
        marketplace: (order.marketplace as SlipData['marketplace']) ?? 'website',
        items,
        subtotal,
        shipping,
        total,
        notes: order.notes ?? null,
        barcodeDataUrl,
        qrCodeImg: `<img src="${qrDataUrl}" width="105" height="105" alt="QR Code"/>`,
    }
}

// --- Utility: Render one slip to HTML ---
function renderSlipHTML(data: SlipData): string {
    const marketplaceClass = `${data.marketplace}-order`

    const colorNameToHex: Record<string, string> = {
        // Whites
        'white': '#FFFFFF',
        'cold white': '#F0F8FF',
        'bone white': '#F9F6EE',
        // Skin tones
        'skin': '#FFDBAC',
        // Yellows / Golds
        'yellow': '#FFFF00',
        'gold': '#FFD700',
        'rose gold': '#FFDA00',
        // Greens
        'green': '#008000',
        'peak green': '#32CD32',
        'pine green': '#01796F',
        'olive green': '#808000',
        'olive': '#808000',
        'lime green': '#00FF00',
        // Pinks & Magentas
        'pink': '#FFC0CB',
        'magenta': '#FF00FF',
        'silk pink ': '#FF69B4',
        // Oranges
        'orange': '#FFA500',
        // Reds
        'red': '#FF0000',
        'fire engine red': '#CE2029',
        // Blues
        'light blue': '#ADD8E6',
        'blue': '#0000FF',
        'sky blue': '#87CEEB',
        'dark blue': '#00008B',
        'navy': '#000080',
        // Purples
        'purple': '#800080',
        // Greys / Silvers
        'silver': '#C0C0C0',
        'gray': '#808080',
        'grey': '#808080',
        // Browns
        'brown': '#A52A2A',
        'light brown': '#C4A484',
        // Black
        'black': '#000000',
    }

    const itemRows = data.items
        .map(
            (i) => {
                const c1 = (i.personalization?.color1 || '').toLowerCase();
                const c2 = (i.personalization?.color2 || '').toLowerCase();
                const sw1 = colorNameToHex[c1] || i.personalization?.color1 || '#ccc';
                const sw2 = colorNameToHex[c2] || i.personalization?.color2 || '#ccc';

                return `
        <tr>
          <td class="col-item">
            ${i.imageUrl ? `<img src="${i.imageUrl}" class="item-thumb"/>` : ''}
            ${i.name} (SKU: ${i.sku})
            ${i.personalization?.text || i.personalization?.color1 ? `
              <div class="item-details">
                ${i.personalization.text ? `<strong>Name/Text:</strong> ${i.personalization.text}<br/>` : ''}
                ${i.personalization.color1 ? `<strong>Base&nbsp;Colour:</strong> ${i.personalization.color1} <span class="swatch" style="background:${sw1}"></span><br/>` : ''}
                ${i.personalization.color2 ? `<strong>Text&nbsp;Colour:</strong> ${i.personalization.color2} <span class="swatch" style="background:${sw2}"></span>` : ''}
              </div>
            ` : ''}
          </td>
          <td class="col-qty">${i.quantity}</td>
          <td class="col-price">£${i.price.toFixed(2)}</td>
        </tr>`
            }
        )
        .join('')

    return `
      <section class="slip ${marketplaceClass}">
        <div class="barcode-area">
          ${logoDataUrl ? `<img src="${logoDataUrl}" alt="Yorkshire3D Logo" class="slip-logo" />` : ''}
          <div class="barcode-block">
            <div class="barcode-graphic">
              ${data.barcodeDataUrl !== '#error' ? `<img src="${data.barcodeDataUrl}" alt="Barcode"/>` : ''}
            </div>
            <div class="barcode-text">${data.orderNumber}</div>
          </div>
        </div>

        <div class="header">
          <h1>Specially Made For <span>${data.customerFirstName}</span>!</h1>
        </div>

        <div class="content-padding">
          <div class="order-info"><strong>Order #:</strong> ${data.orderNumber}<br/><strong>Date:</strong> ${data.orderDate}</div>
          <div class="addresses">
            <div class="address-block"><h3>Ship To:</h3>${data.customerFirstName.charAt(0).toUpperCase() + data.customerFirstName.slice(1)} ${data.customerLastName.charAt(0).toUpperCase() + data.customerLastName.slice(1)}<br/>${data.addressHtml}</div>
            <div class="address-block"><h3>From:</h3>Yorkshire3D Limited<br/>53 Woodlea Avenue<br/>Huddersfield, HD3 4EF<br/>United Kingdom</div>
          </div>
          <div class="greeting">Hi ${data.customerFirstName}, we really enjoyed creating this for you!</div>
          <table class="items-table"><thead><tr><th class="col-item">Item</th><th class="col-qty">Qty</th><th class="col-price">Price</th></tr></thead><tbody>${itemRows}</tbody></table>
          ${data.notes ? `<div class="notes-content-wrapper"><h3>Order Notes:</h3><div class="notes-content">${data.notes}</div></div>` : ''}
          <div class="totals"><span>Subtotal:</span> £${data.subtotal.toFixed(2)}<br/><span>Shipping:</span> £${data.shipping.toFixed(2)}<br/><strong><span>Total:</span> £${data.total.toFixed(2)}</strong></div>
          <div class="footer">
            <div class="footer-qr">${data.qrCodeImg}<span>Scan &amp; claim your offer!</span></div>
            <div class="footer-thanks">Thank you for supporting our small Yorkshire business – we hope your order brings a smile.<br/>The Y3D Team</div>
          </div>
        </div>
      </section>`
}

// --- Gorgeous CSS (trimmed but rich) inc. page-breaks ---
const baseCSS = `
  @page { size: A4; margin: 15mm; }
  body { font-family: 'Poppins', sans-serif; color:#333; }
  :root{
    --accent:#00bcd4; --brand-dark:#1a1a1a; --brand-light:#fff;
    --amazon:#ff9900; --etsy:#f16521; --ebay:#3366cc;
  }
  .slip { page-break-after: always; }
  .amazon-order .header{border-bottom-color:var(--amazon);} .etsy-order .header{border-bottom-color:var(--etsy);} .ebay-order .header{border-bottom-color:var(--ebay);} .website-order .header{border-bottom-color:var(--accent);}
  .barcode-area{ display:flex;align-items:center;gap:16px;padding:8px 0;margin-bottom:12px;justify-content:center;flex-wrap:nowrap; }
  .slip-logo{height:60px;width:auto;object-fit:contain;}
  .barcode-block{display:flex;flex-direction:column;align-items:center;}
  .barcode-graphic{ display:inline-block;padding:2px;background:#fff;height:40px;line-height:0; max-width:450px;overflow:hidden; }
  .barcode-text{margin-top:4px;font-family:'Courier New',monospace;font-size:0.8rem;letter-spacing:1px;}
  .header{background:linear-gradient(to bottom,#303030,var(--brand-dark));color:#fff;padding:14px;text-align:center;border-bottom:4px solid var(--accent);margin-bottom:12px;}
  .header h1{margin:0;font-size:1.4rem;font-weight:600;}
  .header h1 span{color:var(--accent);}
  .content-padding{padding:0 4px 12px;}
  .order-info{font-size:0.9rem;text-align:right;margin-bottom:12px;}
  .addresses{display:flex;gap:10px;margin-bottom:16px;font-size:0.9rem;}
  .addresses .address-block+ .address-block{border-left:4px solid var(--accent);}
  .address-block{flex:1;border:1px solid #e0e0e0;border-radius:8px;padding:10px;background:#fbfbfb;min-height:90px;}
  .greeting{background:#e0f7fa;border-left:4px solid var(--accent);padding:10px;margin:8px 0 16px;text-align:center;font-weight:500;}
  .items-table{width:100%;border-collapse:collapse;font-size:0.9rem;margin-top:8px;}
  .items-table th{background:var(--accent);color:#fff;text-align:left;padding:6px;border-right:1px solid #fff;}
  .items-table th:last-child{border-right:none;}
  .items-table td{border-bottom:1px solid #ddd;padding:6px;vertical-align:top;border-right:1px solid #eee;}
  .items-table td:last-child{border-right:none;}
  .col-qty,.col-price{text-align:right;white-space:nowrap;}
  .totals{margin-top:10px;text-align:right;font-size:0.95rem;}
  .totals span{display:inline-block;width:90px;text-align:left;}
  .notes-content-wrapper{margin-top:12px;}
  .notes-content{border:1px solid #e0e0e0;border-radius:6px;padding:8px;background:#f9f9f9;}
  img.item-thumb{height:60px;width:60px;object-fit:cover;margin-right:8px;border:1px solid #ccc;border-radius:6px;vertical-align:middle;}
  .swatch{display:inline-block;width:12px;height:12px;border:1px solid #777;margin-left:4px;vertical-align:middle;border-radius:2px;}
  .item-details div{margin:2px 0;}
  .footer{margin-top:24px;padding:12px;border-top:6px solid var(--accent);display:flex;justify-content:space-between;align-items:center;background:#fff;}
  .footer-qr{text-align:center;font-size:0.75rem;}
  .footer-qr img{display:block;margin:0 auto 4px;border-radius:4px;}
  .footer-thanks{font-size:0.8rem;max-width:65%;line-height:1.4;}
`

// --- Embed logo once ---
const logoDataUrl = (() => {
    try {
        const buff = fs.readFileSync(path.join(process.cwd(), 'public', 'y3dlogo-pdf.png'))
        return `data:image/png;base64,${buff.toString('base64')}`
    } catch { return '' }
})();

// --- API: /api/generate-pdf/packing-slips?ids=1,2,3 ---
export async function GET(req: Request) {
    const url = new URL(req.url)
    const idsParam = url.searchParams.get('ids')
    if (!idsParam) {
        return new NextResponse('Query param "ids" required', { status: 400 })
    }

    const ids = idsParam
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter(Boolean)
    if (ids.length === 0) {
        return new NextResponse('No valid order IDs provided', { status: 400 })
    }

    try {
        // Fetch all slips in parallel
        const slips = await Promise.all(ids.map((id) => fetchSlipData(id)))

        // Compose single HTML document (one CSS in <head>)
        const html = `<!doctype html><html><head><meta charset="utf-8"><style>${baseCSS}</style></head><body>${slips
            .map(renderSlipHTML)
            .join('')}</body></html>`

        // Render PDF via Puppeteer
        const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
        const page = await browser.newPage()
        await page.setContent(html, { waitUntil: 'networkidle0' })
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true })
        await browser.close()

        const filename = `packing-slips_${new Date().toISOString().split('T')[0]}.pdf`
        return new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="${filename}"`,
            },
        })
    } catch (e) {
        console.error('Packing-slip PDF error:', e)
        return new NextResponse('Failed to generate packing slips', { status: 500 })
    }
} 
