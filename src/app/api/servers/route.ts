import { NextResponse } from "next/server";
import { db } from "@/db";
import { servers, tribes } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { ensureDefaultServers } from "@/lib/servers";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureDefaultServers();
  const list = await db.select().from(servers).orderBy(servers.id);
  const withCounts = await Promise.all(
    list.map(async (s) => {
      const [{ takenCount }] = await db
        .select({ takenCount: sql<number>`count(*)::int` })
        .from(tribes)
        .where(sql`${tribes.serverId} = ${s.id} AND ${tribes.ownerId} IS NOT NULL`);
      const [{ aliveCount }] = await db
        .select({ aliveCount: sql<number>`count(*)::int` })
        .from(tribes)
        .where(sql`${tribes.serverId} = ${s.id} AND ${tribes.isAlive} = true`);
      return { ...s, takenCount, aliveCount };
    })
  );
  return NextResponse.json({ servers: withCounts });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawName = typeof body?.name === "string" ? body.name.trim() : "";
    const rawDescription = typeof body?.description === "string" ? body.description.trim().slice(0, 300) : undefined;

    if (rawName.length < 3) {
      return NextResponse.json({ success: false, error: "نام سرور باید حداقل ۳ کاراکتر باشد" }, { status: 400 });
    }
    if (rawName.length > 60) {
      return NextResponse.json({ success: false, error: "نام سرور خیلی طولانیه (حداکثر ۶۰ کاراکتر)" }, { status: 400 });
    }

    // رفع باگ: بررسی تکراری بودن نام قبل از insert (وگرنه unique constraint در دیتابیس
    // خطای خام و کرش ناخوانا برمی‌گردوند)
    const [existingName] = await db.select().from(servers).where(eq(servers.name, rawName));
    if (existingName) {
      return NextResponse.json({ success: false, error: "سروری با این نام قبلاً ساخته شده" }, { status: 400 });
    }

    // رفع باگ امنیتی: قبلاً slug از روی متن نام (بدون پاکسازی) ساخته می‌شد که می‌تونست
    // شامل کاراکترهای غیرمجاز (مثل "/") باشه و URL بازی رو بشکنه. حالا slug کاملاً
    // مستقل و امن (فقط حروف/عدد لاتین) تولید می‌شه.
    let slug = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = "srv-" + Math.random().toString(36).slice(2, 10);
      const [existingSlug] = await db.select().from(servers).where(eq(servers.slug, candidate));
      if (!existingSlug) {
        slug = candidate;
        break;
      }
    }
    if (!slug) {
      return NextResponse.json({ success: false, error: "خطا در ساخت سرور، دوباره تلاش کن" }, { status: 500 });
    }

    const { ensureServer } = await import("@/lib/servers");
    const s = await ensureServer(rawName, slug, rawDescription);
    return NextResponse.json({ success: true, server: s });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطا در ساخت سرور";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
