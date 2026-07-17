// روشن/خاموش کردن AI برای قبیله بازیکن
// وقتی روشنه، AI به‌جای بازیکن تصمیم می‌گیره (auto-play)
import { NextResponse } from "next/server";
import { db } from "@/db";
import { servers, tribes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const me = await getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ success: false, error: "لطفاً وارد شو" }, { status: 401 });
  const { slug } = await ctx.params;
  const [s] = await db.select().from(servers).where(eq(servers.slug, slug));
  if (!s) return NextResponse.json({ success: false, error: "سرور یافت نشد" }, { status: 404 });
  const [t] = await db.select().from(tribes).where(and(eq(tribes.serverId, s.id), eq(tribes.ownerId, me.id)));
  if (!t) return NextResponse.json({ success: false, error: "قبیله نداری" }, { status: 400 });
  await db.update(tribes).set({ aiEnabled: !t.aiEnabled, updatedAt: new Date() }).where(eq(tribes.id, t.id));
  return NextResponse.json({ success: true, aiEnabled: !t.aiEnabled });
}
