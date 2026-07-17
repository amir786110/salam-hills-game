import { NextResponse } from "next/server";
import { db } from "@/db";
import { tribes, servers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getPendingRequestsFor, getOutgoingRequestsFrom } from "@/lib/game-logic";

export const dynamic = "force-dynamic";

// دریافت لیست درخواست‌های اتحاد ورودی/خروجی برای قبیله بازیکن
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const me = await getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ success: false, error: "لطفاً وارد شو" }, { status: 401 });
  const { slug } = await ctx.params;
  const [s] = await db.select().from(servers).where(eq(servers.slug, slug));
  if (!s) return NextResponse.json({ success: false, error: "سرور یافت نشد" }, { status: 404 });
  const [myTribe] = await db.select().from(tribes).where(and(eq(tribes.serverId, s.id), eq(tribes.ownerId, me.id)));
  if (!myTribe) return NextResponse.json({ success: false, error: "قبیله نداری" }, { status: 400 });

  const [incoming, outgoing] = await Promise.all([
    getPendingRequestsFor(myTribe.id),
    getOutgoingRequestsFrom(myTribe.id),
  ]);

  // اضافه کردن نام قبیله‌ها برای نمایش بهتر
  const allTribes = await db.select().from(tribes).where(eq(tribes.serverId, s.id));
  const nameOf = (id: number) => allTribes.find((t) => t.id === id)?.name ?? `#${id}`;

  return NextResponse.json({
    success: true,
    incoming: incoming.map((r) => ({ ...r, fromTribeName: nameOf(r.fromTribeId) })),
    outgoing: outgoing.map((r) => ({ ...r, toTribeName: nameOf(r.toTribeId) })),
  });
}
