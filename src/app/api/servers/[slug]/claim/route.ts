// یک بازیکن یک قبیله را در سرور برای خود ادعا می‌کند
import { NextResponse } from "next/server";
import { db } from "@/db";
import { servers, tribes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const body = await req.json().catch(() => ({}));
  const me = await getCurrentUserFromRequest(req, body?.authToken);
  if (!me) return NextResponse.json({ success: false, error: "لطفاً وارد شو" }, { status: 401 });
  const { slug } = await ctx.params;
  const { tribeId } = body;

  const [s] = await db.select().from(servers).where(eq(servers.slug, slug));
  if (!s) return NextResponse.json({ success: false, error: "سرور یافت نشد" }, { status: 404 });

  // آیا کاربر از قبل تو این سرور قبیله‌ای داره؟
  const [alreadyMine] = await db
    .select()
    .from(tribes)
    .where(and(eq(tribes.serverId, s.id), eq(tribes.ownerId, me.id)));
  if (alreadyMine)
    return NextResponse.json({ success: false, error: `تو این سرور قبلاً قبیله "${alreadyMine.name}" رو داری` }, { status: 400 });

  const [t] = await db.select().from(tribes).where(and(eq(tribes.id, tribeId), eq(tribes.serverId, s.id)));
  if (!t) return NextResponse.json({ success: false, error: "قبیله یافت نشد" }, { status: 404 });
  if (t.ownerId) return NextResponse.json({ success: false, error: "این قبیله قبلاً گرفته شده" }, { status: 400 });
  if (!t.isAlive) return NextResponse.json({ success: false, error: "این قبیله نابود شده" }, { status: 400 });

  await db
    .update(tribes)
    .set({ ownerId: me.id, aiEnabled: false, updatedAt: new Date() })
    .where(eq(tribes.id, t.id));

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  // رها کردن قبیله + ریست کامل قلمرو
  const me = await getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ success: false, error: "لطفاً وارد شو" }, { status: 401 });
  const { slug } = await ctx.params;
  const [s] = await db.select().from(servers).where(eq(servers.slug, slug));
  if (!s) return NextResponse.json({ success: false, error: "server not found" }, { status: 404 });
  const [t] = await db
    .select()
    .from(tribes)
    .where(and(eq(tribes.serverId, s.id), eq(tribes.ownerId, me.id)));
  if (!t) return NextResponse.json({ success: false, error: "قبیله‌ای در این سرور نداری" }, { status: 400 });
  const { resetTribe } = await import("@/lib/servers");
  await resetTribe(t.id);
  return NextResponse.json({ success: true });
}
