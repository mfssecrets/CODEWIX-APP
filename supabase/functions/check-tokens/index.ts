import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Missing auth' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data: balance } = await supabase
      .from('token_balances')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!balance) return new Response(JSON.stringify({ allowed: false, remaining: 0, reason: 'No token balance found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const available = Math.max(0, balance.total_tokens - balance.tokens_used)
    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('plan_id, plans(name)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    const planName = (sub as any)?.plans?.name ?? 'Starter'
    if (available <= 0) {
      return new Response(JSON.stringify({ allowed: false, remaining: 0, reason: `No tokens remaining. Upgrade your ${planName} plan for more.` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Consume token
    await supabase
      .from('token_balances')
      .update({ tokens_used: balance.tokens_used + 1 })
      .eq('user_id', user.id)

    await supabase.from('token_usage').insert({ user_id: user.id, tokens_used: 1, action: (await req.json()).action || 'chat' })

    return new Response(JSON.stringify({ allowed: true, remaining: available - 1 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
