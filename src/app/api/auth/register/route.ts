import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, setSessionCookie, signSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const displayNameRaw = typeof body?.displayName === "string" ? body.displayName.trim() : "";
    const avatarRaw = typeof body?.avatar === "string" ? body.avatar.trim() : "";

    if (!username || !password) {
      return NextResponse.json({ success: false, error: "یوزرنیم و پسورد الزامیه" }, { status: 400 });
    }
    if (username.length < 3 || username.length > 32) {
      return NextResponse.json({ success: false, error: "یوزرنیم باید بین ۳ تا ۳۲ کاراکتر باشد" }, { status: 400 });
    }
    // رفع باگ: قبلاً هیچ محدودیتی روی کاراکترهای یوزرنیم نبود — کاربر می‌تونست
    // کاراکترهای کنترلی، RTL-override (برای گمراه کردن بقیه کاربران با نمایش
    // معکوس اسم) یا فاصله‌های نامرئی رو در یوزرنیم بذاره. حالا فقط حروف/عدد
    // انگلیسی و خط زیر/تیره مجازن — یوزرنیم صرفاً برای ورود استفاده می‌شه.
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return NextResponse.json({ success: false, error: "یوزرنیم فقط می‌تواند شامل حروف انگلیسی، عدد، خط تیره و زیرخط باشد" }, { status: 400 });
    }
    if (password.length < 4 || password.length > 128) {
      return NextResponse.json({ success: false, error: "پسورد باید بین ۴ تا ۱۲۸ کاراکتر باشد" }, { status: 400 });
    }
    // حذف کاراکترهای کنترلی/غیرقابل‌چاپ از displayName و avatar (رفع باگ مشابه امنیتی)
    const cleanDisplayName = displayNameRaw.replace(/[\u0000-\u001F\u007F]/g, "");
    const cleanAvatar = avatarRaw.replace(/[\u0000-\u001F\u007F]/g, "");
    const displayName = (cleanDisplayName || username).slice(0, 40);
    const avatar = (cleanAvatar || "🎯").slice(0, 8);

    const [exists] = await db.select().from(users).where(eq(users.username, username));
    if (exists) {
      return NextResponse.json({ success: false, error: "این یوزرنیم قبلاً گرفته شده" }, { status: 400 });
    }
    const hash = await hashPassword(password);
    let u;
    try {
      [u] = await db
        .insert(users)
        .values({ username, passwordHash: hash, displayName, avatar })
        .returning();
    } catch (dbErr) {
      // رفع باگ: در صورت race condition (دو ثبت‌نام همزمان با یک یوزرنیم)، constraint دیتابیس
      // خطای خام می‌ده — پیام دوستانه برگردون
      const msg = dbErr instanceof Error ? dbErr.message : "";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return NextResponse.json({ success: false, error: "این یوزرنیم قبلاً گرفته شده" }, { status: 400 });
      }
      throw dbErr;
    }
    const payload = { userId: u.id, username: u.username };
    await setSessionCookie(payload);
    const token = signSession(payload);
    return NextResponse.json({
      success: true,
      token, // fallback برای محیط‌هایی که cookie رو block می‌کنن
      user: { id: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطا";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
