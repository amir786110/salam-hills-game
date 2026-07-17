import { NextResponse } from "next/server";
import { db } from "@/db";
import { tribes, servers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { sendAllianceRequest, breakAlliance } from "@/lib/game-logic";

export const dynamic = "force-dynamic";

async function myTribeInServer(req: Request, slug: string, bodyToken?: string) {
  const me = await getCurrentUserFromRequest(req, bodyToken);
  if (!me) return { error: "لطفاً وارد شو" } as const;
  const [s] = await db.select().from(servers).where(eq(servers.slug, slug));
  if (!s) return { error: "سرور یافت نشد" } as const;
  const [t] = await db.select().from(tribes).where(and(eq(tribes.serverId, s.id), eq(tribes.ownerId, me.id)));
  if (!t) return { error: "قبیله‌ای در این سرور نداری" } as const;
  return { server: s, tribe: t } as const;
}

// ارسال درخواست اتحاد (نیاز به تأیید طرف مقابل دارد)
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const { otherTribeId, authToken } = await req.json();
    const info = await myTribeInServer(req, slug, authToken);
    if ("error" in info) return NextResponse.json({ success: false, error: info.error }, { status: 400 });
    if (typeof otherTribeId !== "number") return NextResponse.json({ success: false, error: "قبیله مقصد نامعتبر" }, { status: 400 });
    const r = await sendAllianceRequest(info.server.id, info.tribe.id, otherTribeId);
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطا";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

// شکستن اتحاد موجود (این کار نیاز به تأیید طرف مقابل ندارد)
export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const { otherTribeId, authToken } = await req.json();
    const info = await myTribeInServer(req, slug, authToken);
    if ("error" in info) return NextResponse.json({ success: false, error: info.error }, { status: 400 });
    if (typeof otherTribeId !== "number") return NextResponse.json({ success: false, error: "قبیله مقصد نامعتبر" }, { status: 400 });
    const r = await breakAlliance(info.tribe.id, otherTribeId);
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطا";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
