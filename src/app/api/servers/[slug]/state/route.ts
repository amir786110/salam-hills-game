import { NextResponse } from "next/server";
import { db } from "@/db";
import { servers, tribes, alliances, attackLogs, users, proclamations } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { territoryPercent, calcAttackTotalPower, calcDefensePower, factoryIncomePerTick } from "@/lib/game-logic";
import type { Polygon } from "@/lib/geo";
import { polygonAreaKm2 } from "@/lib/geo";
import type { FactoryInstance } from "@/lib/units-catalog";
import type { UnitInventory } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const [srv] = await db.select().from(servers).where(eq(servers.slug, slug));
  if (!srv) return NextResponse.json({ error: "سرور یافت نشد" }, { status: 404 });

  const [tribesList, alliancesList, logs, procs] = await Promise.all([
    db.select().from(tribes).where(eq(tribes.serverId, srv.id)).orderBy(tribes.id),
    db.select().from(alliances).where(eq(alliances.serverId, srv.id)),
    db.select().from(attackLogs).where(eq(attackLogs.serverId, srv.id)).orderBy(desc(attackLogs.createdAt)).limit(30),
    db.select().from(proclamations).where(eq(proclamations.serverId, srv.id)).orderBy(desc(proclamations.createdAt)).limit(30),
  ]);

  const ownerIds = Array.from(new Set(tribesList.map((t) => t.ownerId).filter((x): x is number => x !== null)));
  const ownersMap = new Map<number, { username: string; displayName: string; avatar: string }>();
  if (ownerIds.length > 0) {
    const allUsers = await db.select().from(users);
    for (const o of allUsers) {
      if (ownerIds.includes(o.id)) ownersMap.set(o.id, { username: o.username, displayName: o.displayName, avatar: o.avatar });
    }
  }

  const decorated = tribesList.map((t) => ({
    ...t,
    territoryPct: territoryPercent(t),
    areaKm2: polygonAreaKm2(t.territoryPolygon as Polygon),
    owner: t.ownerId ? ownersMap.get(t.ownerId) ?? null : null,
    attackPower: calcAttackTotalPower(t),
    defensePower: calcDefensePower(t),
    income: factoryIncomePerTick((t.factories as FactoryInstance[]) ?? []),
    jetsInventory: (t.jetsInventory ?? {}) as UnitInventory,
    missilesInventory: (t.missilesInventory ?? {}) as UnitInventory,
    defensesInventory: (t.defensesInventory ?? {}) as UnitInventory,
    factories: (t.factories ?? []) as FactoryInstance[],
  }));

  return NextResponse.json({
    server: srv,
    tribes: decorated,
    alliances: alliancesList,
    logs,
    proclamations: procs,
  });
}
