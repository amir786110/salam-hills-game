import { NextResponse } from "next/server";
import { db } from "@/db";
import { tribes, servers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { generateStrategyAdvice } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const me = await getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ success: false, error: "لطفاً وارد شو" }, { status: 401 });
  const { slug } = await ctx.params;
  const [s] = await db.select().from(servers).where(eq(servers.slug, slug));
  if (!s) return NextResponse.json({ success: false, error: "سرور یافت نشد" }, { status: 404 });
  const [myTribe] = await db.select().from(tribes).where(and(eq(tribes.serverId, s.id), eq(tribes.ownerId, me.id)));
  if (!myTribe) return NextResponse.json({ success: false, error: "قبیله نداری" }, { status: 400 });
  const all = await db.select().from(tribes).where(eq(tribes.serverId, s.id));
  const advice = await generateStrategyAdvice(myTribe, all);
  return NextResponse.json({ success: true, advice });
}
