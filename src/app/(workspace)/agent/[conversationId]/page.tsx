"use client";

import dynamic from 'next/dynamic';

const AgentWorkspace = dynamic(() => import('@/components/codewix/AgentWorkspace'), { ssr: false });

export default function AgentConversationPage() {
  return <AgentWorkspace />;
}
