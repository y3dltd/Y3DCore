import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // Echo endpoint for playground
  const body = await req.json();
  return NextResponse.json({ received: body, timestamp: new Date().toISOString() });
}
