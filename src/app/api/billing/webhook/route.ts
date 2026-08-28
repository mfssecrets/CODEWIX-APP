import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import { upgradeSubscription } from '@/lib/subscription';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    // Verify signature
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSig !== signature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(body);
    const { event: eventType, payload } = event;

    if (eventType === 'payment.captured') {
      const payment = payload.payment.entity;
      const notes = payment.notes || {};
      const userId = notes.userId;
      const planId = notes.planId;

      if (!userId || !planId) {
        return NextResponse.json({ error: 'Missing userId or planId in payment notes' }, { status: 400 });
      }

      const svc = createServiceClient();

      // Update payment record
      await svc
        .from('payments')
        .update({
          status: 'captured',
          razorpay_payment_id: payment.id,
          razorpay_signature: signature,
        })
        .eq('razorpay_order_id', payment.order_id);

      // Upgrade subscription
      await upgradeSubscription(userId, planId);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
