import { NextResponse } from "next/server";
import { db } from "@/db";
import { tribes, servers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { respondAllianceRequest, cancelAllianceRequest } from "@/lib/game-logic";

export const dynamic = "force-dynamic";

// پاسخ به یک درخواست اتحاد ورودی (قبول یا رد)
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const body = await req.json();
    const { requestId, accept, authToken } = body;
    const me = await getCurrentUserFromRequest(req, authToken);
    if (!me) return NextResponse.json({ success: false, error: "لطفاً وارد شو" }, { status: 401 });
    const [s] = await db.select().from(servers).where(eq(servers.slug, slug));
    if (!s) return NextResponse.json({ success: false, error: "سرور یافت نشد" }, { status: 404 });
    const [myTribe] = await db.select().from(tribes).where(and(eq(tribes.serverId, s.id), eq(tribes.ownerId, me.id)));
    if (!myTribe) return NextResponse.json({ success: false, error: "قبیله نداری" }, { status: 400 });
    if (typeof requestId !== "number") return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });

    const r = await respondAllianceRequest(requestId, myTribe.id, Boolean(accept));
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطا";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

// لغو یک درخواست اتحاد که خودم فرستادم
export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const body = await req.json();
    const { requestId, authToken } = body;
    const me = await getCurrentUserFromRequest(req, authToken);
    if (!me) return NextResponse.json({ success: false, error: "لطفاً وارد شو" }, { status: 401 });
    const [s] = await db.select().from(servers).where(eq(servers.slug, slug));
    if (!s) return NextResponse.json({ success: false, error: "سرور یافت نشد" }, { status: 404 });
    const [myTribe] = await db.select().from(tribes).where(and(eq(tribes.serverId, s.id), eq(tribes.ownerId, me.id)));
    if (!myTribe) return NextResponse.json({ success: false, error: "قبیله نداری" }, { status: 400 });
    if (typeof requestId !== "number") return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });

    const r = await cancelAllianceRequest(requestId, myTribe.id);
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطا";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
