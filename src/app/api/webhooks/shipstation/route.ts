import crypto from 'crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sendNewOrderNotification } from '@/lib/email/order-notifications';
import type { OrderData } from '@/lib/email/order-notifications';

/**
 * Verify ShipStation webhook HMAC-SHA256 signature (base64).
 */
function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const computed = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'base64'),
      Buffer.from(computed, 'base64')
    );
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('X-ShipStation-Hmac-Sha256');
  const secret = process.env.SHIPSTATION_WEBHOOK_SECRET ?? '';
  const body = await req.text();

  if (!verifySignature(body, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Malformed JSON' }, { status: 400 });
  }

  // Handle only new order events
  if (event.eventType === 'ORDER_CREATED' && event.resource?.resourceType === 'ORDER') {
    const data = event.resource.resourceData;
    const order: OrderData = {
      orderId: data.orderId,
      orderNumber: data.orderNumber,
      orderDate: data.orderDate,
      orderStatus: data.orderStatus,
      orderTotal: data.orderTotal,
      amountPaid: data.amountPaid,
      tagIds: data.tagIds,
      items: data.items?.map((i: any) => ({ quantity: i.quantity, name: i.name })) || [],
      shipTo: { name: data.shipTo?.name || '' },
      customerUsername: data.customerUsername,
      advancedOptions: { storeId: data.advancedOptions?.storeId },
    };

    const adminEmails = process.env.NEW_ORDER_NOTIFICATION_EMAILS?.split(',').map(e => e.trim()) || [];
    await sendNewOrderNotification(order, { adminEmails });
  }

  return NextResponse.json({ ok: true });
}
