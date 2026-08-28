import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getUserSubscription, upgradeSubscription, Plan } from '@/lib/subscription';
import Razorpay from 'razorpay';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;

  try {
    const body = await req.json();
    const { planId, billingAddressId } = body;

    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }

    const svc = createServiceClient();
    const { data: plan, error: planError } = await svc
      .from('plans')
      .select('*')
      .eq('id', planId)
      .eq('is_active', true)
      .single();

    if (planError || !plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const typedPlan = plan as unknown as Plan;
    const amount = typedPlan.price_monthly * 100; // Razorpay expects paise

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return NextResponse.json({ error: 'Razorpay not configured' }, { status: 500 });
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    const receipt = `rcpt_${userId.slice(0, 8)}_${Date.now()}`;

    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt,
      notes: {
        userId,
        planId,
        billingAddressId: billingAddressId || '',
      },
    });

    // Save the payment record
    await svc.from('payments').insert({
      user_id: userId,
      razorpay_order_id: order.id,
      amount: typedPlan.price_monthly,
      currency: 'INR',
      status: 'created',
      plan_id: planId,
    });

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      planName: typedPlan.name,
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    const msg = error instanceof Error ? error.message : 'Subscription failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
