import { NextResponse } from "next/server";
import { db } from "@/db";
import { servers } from "@/db/schema";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { generateCoinsForServer } from "@/lib/game-logic";

export const dynamic = "force-dynamic";

// حداقل فاصله بین دو تیک تولید سکه (رفع باگ امنیتی: قبلاً این endpoint بدون
// محدودیت بود و با spam کردن می‌شد سکه‌ی نامحدود برای همه قبایل تولید کرد)
const MIN_TICK_INTERVAL_MS = 4000;

export async function POST(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const [s] = await db.select().from(servers).where(eq(servers.slug, slug));
  if (!s) return NextResponse.json({ error: "سرور یافت نشد" }, { status: 404 });

  const now = new Date();
  const cutoff = new Date(now.getTime() - MIN_TICK_INTERVAL_MS);

  // رفع باگ race condition: نسخه قبلی اول می‌خوند بعد جدا آپدیت می‌کرد که بین
  // این دو مرحله، دو درخواست همزمان (مثلاً از دو تب مرورگر) هر دو می‌تونستن
  // از چک رد بشن و سکه رو دوبار تولید کنن. حالا با یک UPDATE شرطی اتمیک، فقط
  // دقیقاً یکی از درخواست‌های همزمان موفق می‌شه (Postgres قفل ردیف رو تضمین می‌کنه)
  const updated = await db
    .update(servers)
    .set({ lastCoinTickAt: now })
    .where(
      and(
        eq(servers.id, s.id),
        or(isNull(servers.lastCoinTickAt), lt(servers.lastCoinTickAt, cutoff))
      )
    )
    .returning({ id: servers.id });

  if (updated.length === 0) {
    // یکی دیگه (یا خود این تب چند لحظه قبل) همین الان تیک رو زده
    return NextResponse.json({ success: true, skipped: true });
  }

  await generateCoinsForServer(s.id);
  return NextResponse.json({ success: true });
}
