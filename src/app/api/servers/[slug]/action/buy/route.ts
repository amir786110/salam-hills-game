import { NextResponse } from "next/server";
import { db } from "@/db";
import { tribes, servers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { buy, type BuyPayload } from "@/lib/game-logic";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const payload = (await req.json()) as BuyPayload & { authToken?: string };
    const me = await getCurrentUserFromRequest(req, payload.authToken);
    if (!me) return NextResponse.json({ success: false, error: "لطفاً وارد شو" }, { status: 401 });
    const { slug } = await ctx.params;
    const [s] = await db.select().from(servers).where(eq(servers.slug, slug));
    if (!s) return NextResponse.json({ success: false, error: "سرور یافت نشد" }, { status: 404 });
    const [myTribe] = await db.select().from(tribes).where(and(eq(tribes.serverId, s.id), eq(tribes.ownerId, me.id)));
    if (!myTribe) return NextResponse.json({ success: false, error: "تو این سرور قبیله نداری" }, { status: 400 });
    const r = await buy(myTribe.id, payload);
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطا";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
