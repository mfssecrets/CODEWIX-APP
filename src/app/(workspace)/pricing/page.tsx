"use client";

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Zap, Crown, Rocket, Loader2, CreditCard, MapPin, Building, Globe, ArrowRight } from 'lucide-react';
import { useUser } from '@/components/Providers';
import { Skeleton } from '@/components/skeleton/SkeletonCard';

const planIcons = { starter: Zap, pro: Crown, 'pro-max': Rocket };

export default function PricingPage() {
  const { user, profile } = useUser();
  const [plans, setPlans] = useState<any[]>([]);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [showBilling, setShowBilling] = useState(false);
  const [billingForm, setBillingForm] = useState({ name: '', line1: '', line2: '', city: '', state: '', postal_code: '', country: 'IN' });

  useEffect(() => {
    Promise.all([
      fetch('/api/billing/plans').then(r => r.json()).catch(() => ({ plans: [] })),
      user ? fetch('/api/billing/portal').then(r => r.json()).catch(() => null) : Promise.resolve(null),
    ]).then(([plansData, portalData]) => {
      // /api/billing/plans returns { plans: [...] }; guard against an error object.
      const planList = Array.isArray(plansData?.plans) ? plansData.plans : (Array.isArray(plansData) ? plansData : []);
      setPlans(planList);
      if (portalData?.subscription) {
        setCurrentPlan(portalData.subscription.plans?.slug ?? null);
      }
      setLoading(false);
    }).catch(() => { setPlans([]); setLoading(false); });
  }, [user]);

  const handleSubscribe = async (planId: string) => {
    if (!user) return;
    setSubscribing(planId);
    try {
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (data?.orderId) {
        const options: any = {
          key: data.key,
          order_id: data.orderId,
          amount: data.amount,
          currency: data.currency,
          name: 'CodeWIX',
          description: data.planName || 'Subscription',
          handler: function (response: any) {
            window.location.href = '/pricing?success=true';
          },
          prefill: { name: profile?.name || '', email: profile?.email || '' },
          theme: { color: '#7C3AED' },
        };
        if (typeof (window as any).Razorpay !== 'undefined') {
          const rzp = new (window as any).Razorpay(options);
          rzp.open();
        }
      }
    } catch (e) { console.error(e); }
    finally { setSubscribing(null); }
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto">
          <Skeleton className="h-10 w-64 mx-auto mb-2" />
          <Skeleton className="h-5 w-96 mx-auto mb-10" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <div key={i} className="rounded-2xl border border-slate-100 p-6 space-y-4"><Skeleton className="h-6 w-24" /><Skeleton className="h-10 w-20" /><Skeleton className="h-px w-full" />{[1,2,3,4,5].map(j => <div key={j} className="flex items-center gap-2"><Skeleton className="w-4 h-4 rounded-full" /><Skeleton className="h-4 flex-1" /></div>)}<Skeleton className="h-10 w-full mt-4" /></div>)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8">
      <div className="max-w-5xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 mb-2">Choose Your Plan</h1>
          <p className="text-[14px] text-slate-500">Start free, upgrade when you need more power</p>
          {currentPlan && (
            <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-violet-50 border border-violet-200/60">
              <CreditCard className="w-3.5 h-3.5 text-violet-600" />
              <span className="text-[12px] font-medium text-violet-700">Current plan: {plans.find(p => p.slug === currentPlan)?.name || 'Starter'}</span>
            </div>
          )}
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.length === 0 ? (
            <div className="col-span-full text-center py-16">
              <p className="text-[15px] text-slate-500 mb-1">Couldn&apos;t load plans right now.</p>
              <p className="text-[13px] text-slate-400">Please refresh the page or try again in a moment.</p>
            </div>
          ) : plans.map((plan: any, i: number) => {
            const Icon = planIcons[plan.slug as keyof typeof planIcons] || Zap;
            const isCurrent = plan.slug === currentPlan;
            const features = typeof plan.features === 'string' ? JSON.parse(plan.features) : (plan.features || []);

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`relative rounded-2xl border-2 p-6 flex flex-col transition-all duration-300 ${
                  plan.slug === 'pro' ? 'border-violet-300 shadow-xl shadow-violet-500/10 scale-[1.02]' :
                  isCurrent ? 'border-violet-200 bg-violet-50/30' : 'border-slate-100 hover:border-slate-200 hover:shadow-lg'
                }`}
              >
                {plan.slug === 'pro' && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-violet-600 to-purple-600 text-white text-[11px] font-semibold">Most Popular</div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${plan.slug === 'pro-max' ? 'bg-amber-50' : plan.slug === 'pro' ? 'bg-violet-50' : 'bg-slate-50'}`}>
                    <Icon className={`w-5 h-5 ${plan.slug === 'pro-max' ? 'text-amber-600' : 'text-violet-600'}`} strokeWidth={1.8} />
                  </div>
                  <div>
                    <h3 className="text-[16px] font-semibold text-slate-800">{plan.name}</h3>
                    <p className="text-[12px] text-slate-400">{plan.monthly_tokens} tokens/mo</p>
                  </div>
                </div>

                <div className="flex items-baseline gap-1 mb-5">
                  <span className="text-3xl font-bold text-slate-800">${plan.price_monthly}</span>
                  <span className="text-[13px] text-slate-400">/month</span>
                </div>

                <div className="h-px bg-slate-100 mb-5" />

                <ul className="flex-1 space-y-3 mb-6">
                  {features.map((f: string, j: number) => (
                    <li key={j} className="flex items-start gap-2.5 text-[13px] text-slate-600">
                      <Check className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" strokeWidth={2} />
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <button disabled className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-500 text-[13.5px] font-semibold cursor-not-allowed">
                    Current Plan
                  </button>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={subscribing === plan.id}
                    className={`w-full py-2.5 rounded-xl text-[13.5px] font-semibold flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-60 ${
                      plan.slug === 'pro' ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/25' :
                      'bg-slate-800 text-white hover:bg-slate-900'
                    }`}
                  >
                    {subscribing === plan.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{isCurrent ? 'Current' : 'Upgrade'} <ArrowRight className="w-4 h-4" /></>}
                  </motion.button>
                )}
              </motion.div>
            );
          })}
        </div>

        {showBilling && (
          <BillingForm form={billingForm} setForm={setBillingForm} onClose={() => setShowBilling(false)} />
        )}
      </div>
    </div>
  );
}

function BillingForm({ form, setForm, onClose }: { form: any; setForm: any; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Billing Address</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
            <MapPin className="w-4 h-4 text-slate-400" /><input placeholder="Full Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="flex-1 bg-transparent text-sm outline-none" />
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
            <Building className="w-4 h-4 text-slate-400" /><input placeholder="Address Line 1" value={form.line1} onChange={e => setForm({ ...form, line1: e.target.value })} className="flex-1 bg-transparent text-sm outline-none" />
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
            <Building className="w-4 h-4 text-slate-400" /><input placeholder="Address Line 2" value={form.line2} onChange={e => setForm({ ...form, line2: e.target.value })} className="flex-1 bg-transparent text-sm outline-none" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input placeholder="City" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm outline-none" />
            <input placeholder="State" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm outline-none" />
            <input placeholder="PIN" value={form.postal_code} onChange={e => setForm({ ...form, postal_code: e.target.value })} className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm outline-none" />
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
            <Globe className="w-4 h-4 text-slate-400" /><input placeholder="Country" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} className="flex-1 bg-transparent text-sm outline-none" />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button className="flex-1 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors">Save & Continue</button>
        </div>
      </motion.div>
    </motion.div>
  );
}