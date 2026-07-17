"use client";
import AppShell from "@/components/AppShell";
import ServersList from "@/components/ServersList";

export default function HomePage() {
  return (
    <AppShell>
      {(user, refresh) => <ServersList user={user} onLogout={refresh} />}
    </AppShell>
  );
}
