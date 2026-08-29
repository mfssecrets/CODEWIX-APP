"use client";

import { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sparkles, Zap } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Token-exhausted dialog. Rendered once per app session via a global signal
 * (window event `codewix:token-exhausted`). When a Chat/Agent/Build request
 * returns 429 with `tokenExhausted: true`, the client dispatches that event
 * and this dialog appears with an Upgrade CTA that navigates to /pricing.
 *
 * Usage from any client component:
 *   fetch('/api/chat', ...).then(r => {
 *     if (r.status === 429) {
 *       const d = await r.json();
 *       if (d.tokenExhausted) window.dispatchEvent(new CustomEvent('codewix:token-exhausted', { detail: d }));
 *     }
 *   });
 */
export default function TokenExhaustedDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setMessage(detail?.error || "You have used all your available prompts. Upgrade your plan to keep building.");
      setOpen(true);
    };
    window.addEventListener("codewix:token-exhausted", handler);
    return () => window.removeEventListener("codewix:token-exhausted", handler);
  }, []);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center">
            <Zap className="w-6 h-6 text-violet-600" strokeWidth={1.8} />
          </div>
          <AlertDialogTitle className="text-center text-[17px] font-semibold text-slate-800">
            You&apos;re out of prompts
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-[13.5px] text-slate-500 leading-relaxed">
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-2 sm:gap-2">
          <AlertDialogCancel className="mt-0 flex-1">Maybe later</AlertDialogCancel>
          <AlertDialogAction
            className="flex-1 bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:opacity-90"
            onClick={() => {
              setOpen(false);
              router.push("/pricing");
            }}
          >
            <Sparkles className="w-4 h-4 mr-1.5" /> Upgrade
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
