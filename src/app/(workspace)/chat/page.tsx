"use client";

import dynamic from 'next/dynamic';

const ChatWorkspace = dynamic(() => import('@/components/codewix/ChatWorkspace'), { ssr: false });

export default function ChatPage() {
  return <ChatWorkspace />;
}
