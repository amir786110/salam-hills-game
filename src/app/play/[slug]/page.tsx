"use client";
import { use } from "react";
import AppShell from "@/components/AppShell";
import GamePlay from "@/components/GamePlay";

export default function PlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return (
    <AppShell>
      {(user) => <GamePlay user={user} slug={slug} />}
    </AppShell>
  );
}
