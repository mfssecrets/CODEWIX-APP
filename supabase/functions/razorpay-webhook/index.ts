import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const event = body.event
    const payload = body.payload?.payment?.entity

    if (event === 'payment.captured' && payload) {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const userId = payload.notes?.userId
      const planId = payload.notes?.planId

      if (!userId || !planId) {
        return new Response(JSON.stringify({ error: 'Missing notes' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Update payment record
      await supabase
        .from('payments')
        .update({ status: 'captured', razorpay_pay_id: payload.id })
        .eq('razorpay_order_id', payload.order_id)

      // Upgrade subscription
      const { data: plan } = await supabase.from('plans').select('monthly_tokens').eq('id', planId).single()
      if (plan) {
        await supabase
          .from('user_subscriptions')
          .update({
            plan_id: planId,
            status: 'active',
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq('user_id', userId)

        await supabase
          .from('token_balances')
          .update({
            total_tokens: (plan as any).monthly_tokens,
            tokens_used: 0,
            reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq('user_id', userId)
      }
    }

    return new Response(JSON.stringify({ received: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
