import { NextResponse } from "next/server";
import { db } from "@/db";
import { proclamations, servers, tribes, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getCurrentUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const [s] = await db.select().from(servers).where(eq(servers.slug, slug));
  if (!s) return NextResponse.json({ error: "سرور یافت نشد" }, { status: 404 });
  const list = await db
    .select()
    .from(proclamations)
    .where(eq(proclamations.serverId, s.id))
    .orderBy(desc(proclamations.createdAt))
    .limit(50);
  return NextResponse.json({ proclamations: list });
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const { message, authToken } = await req.json();
    const me = await getCurrentUserFromRequest(req, authToken);
    if (!me) return NextResponse.json({ success: false, error: "لطفاً وارد شو" }, { status: 401 });
    if (!message || typeof message !== "string" || message.trim().length === 0)
      return NextResponse.json({ success: false, error: "پیام خالیه" }, { status: 400 });
    if (message.length > 500)
      return NextResponse.json({ success: false, error: "پیام خیلی طولانیه (حداکثر ۵۰۰)" }, { status: 400 });

    const [s] = await db.select().from(servers).where(eq(servers.slug, slug));
    if (!s) return NextResponse.json({ success: false, error: "سرور یافت نشد" }, { status: 404 });
    const [myTribe] = await db.select().from(tribes).where(and(eq(tribes.serverId, s.id), eq(tribes.ownerId, me.id)));
    if (!myTribe) return NextResponse.json({ success: false, error: "تو این سرور قبیله نداری" }, { status: 400 });

    const [u] = await db.select().from(users).where(eq(users.id, me.id));
    if (!u) return NextResponse.json({ success: false, error: "کاربر یافت نشد" }, { status: 404 });

    await db.insert(proclamations).values({
      serverId: s.id,
      tribeId: myTribe.id,
      tribeName: myTribe.name,
      tribeColor: myTribe.color,
      authorName: u.displayName,
      authorAvatar: u.avatar,
      message: message.trim(),
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطا";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
