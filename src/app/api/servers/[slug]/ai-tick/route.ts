import { NextResponse } from "next/server";
import { db } from "@/db";
import { servers } from "@/db/schema";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { runAllAiForServer } from "@/lib/ai";

export const dynamic = "force-dynamic";

// رفع باگ امنیتی مشابه tick: بدون محدودیت، اسپم این endpoint باعث اجرای
// مکرر و بی‌رویه‌ی منطق هوش مصنوعی (و حملات پیاپی) می‌شد
const MIN_AI_TICK_INTERVAL_MS = 9000;

export async function POST(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const [s] = await db.select().from(servers).where(eq(servers.slug, slug));
  if (!s) return NextResponse.json({ error: "سرور یافت نشد" }, { status: 404 });

  const now = new Date();
  const cutoff = new Date(now.getTime() - MIN_AI_TICK_INTERVAL_MS);

  // رفع باگ race condition (مشابه tick): UPDATE شرطی اتمیک به‌جای read-then-write
  const updated = await db
    .update(servers)
    .set({ lastAiTickAt: now })
    .where(
      and(
        eq(servers.id, s.id),
        or(isNull(servers.lastAiTickAt), lt(servers.lastAiTickAt, cutoff))
      )
    )
    .returning({ id: servers.id });

  if (updated.length === 0) {
    return NextResponse.json({ success: true, skipped: true, logs: [] });
  }

  const logs = await runAllAiForServer(s.id);
  return NextResponse.json({ success: true, logs });
}
