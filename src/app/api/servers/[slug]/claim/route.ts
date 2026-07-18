// یک بازیکن یک قبیله را در سرور برای خود ادعا می‌کند
import { NextResponse } from "next/server";
import { db } from "@/db";
import { servers, tribes } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getCurrentUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const body = await req.json().catch(() => ({}));
  const me = await getCurrentUserFromRequest(req, body?.authToken);
  if (!me) return NextResponse.json({ success: false, error: "لطفاً وارد شو" }, { status: 401 });
  const { slug } = await ctx.params;
  const { tribeId } = body;

  if (typeof tribeId !== "number") {
    return NextResponse.json({ success: false, error: "قبیله نامعتبر" }, { status: 400 });
  }

  const [s] = await db.select().from(servers).where(eq(servers.slug, slug));
  if (!s) return NextResponse.json({ success: false, error: "سرور یافت نشد" }, { status: 404 });

  try {
    // رفع باگ race condition: قبلاً وضعیت قبیله (owner_id IS NULL) با یک SELECT
    // جدا چک می‌شد و بعد یک UPDATE جداگانه اجرا می‌شد. اگر دو بازیکن هم‌زمان
    // روی یک قبیله‌ی آزاد کلیک می‌کردند، هر دو می‌توانستند از SELECT عبور کنند
    // (چون هنوز owner_id هیچ‌کدام ثبت نشده بود) و هر دو قبیله را مالک بشوند.
    // حالا با یک تراکنش که هم چک «قبلاً قبیله داری؟» و هم UPDATE شرطی
    // (WHERE owner_id IS NULL) را اتمیک انجام می‌دهد، فقط یکی از دو درخواست
    // هم‌زمان موفق می‌شود.
    const result = await db.transaction(async (tx) => {
      const [alreadyMine] = await tx
        .select()
        .from(tribes)
        .where(and(eq(tribes.serverId, s.id), eq(tribes.ownerId, me.id)))
        .for("update");
      if (alreadyMine) {
        return { success: false as const, error: `تو این سرور قبلاً قبیله "${alreadyMine.name}" رو داری` };
      }

      const [t] = await tx
        .select()
        .from(tribes)
        .where(and(eq(tribes.id, tribeId), eq(tribes.serverId, s.id)))
        .for("update");
      if (!t) return { success: false as const, error: "قبیله یافت نشد" };
      if (!t.isAlive) return { success: false as const, error: "این قبیله نابود شده" };
      if (t.ownerId) return { success: false as const, error: "این قبیله قبلاً گرفته شده" };

      // آپدیت شرطی: فقط اگر واقعاً هنوز بدون مالک باشه (دفاع دوم در برابر race)
      const updated = await tx
        .update(tribes)
        .set({ ownerId: me.id, aiEnabled: false, updatedAt: new Date() })
        .where(and(eq(tribes.id, t.id), isNull(tribes.ownerId)))
        .returning({ id: tribes.id });

      if (updated.length === 0) {
        return { success: false as const, error: "این قبیله همین الان توسط بازیکن دیگری گرفته شد" };
      }
      return { success: true as const };
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطا در گرفتن قبیله";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
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
