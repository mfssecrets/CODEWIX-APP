"use client";

import { Suspense } from 'react';
import SigninContent from './SigninContent';

export default function SigninPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" /></div>}>
      <SigninContent />
    </Suspense>
  );
}