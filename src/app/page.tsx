"use client";

import dynamic from "next/dynamic";
import Sidebar from "@/components/codewix/Sidebar";
import Header from "@/components/codewix/Header";
import HeroSection from "@/components/codewix/HeroSection";
import TemplatesSection from "@/components/codewix/TemplatesSection";
import IntegrationsSection from "@/components/codewix/IntegrationsSection";

const Background3D = dynamic(
  () => import("@/components/codewix/Background3D"),
  { ssr: false }
);

export default function CodeWIXPage() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* 3D Background */}
      <Background3D />

      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className="relative flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header />

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <HeroSection />
          <TemplatesSection />
          <IntegrationsSection />
        </div>
      </main>
    </div>
  );
}