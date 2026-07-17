import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, setSessionCookie, signSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!username || !password) {
      return NextResponse.json({ success: false, error: "یوزرنیم و پسورد الزامیه" }, { status: 400 });
    }

    const [u] = await db.select().from(users).where(eq(users.username, username));
    if (!u) {
      return NextResponse.json({ success: false, error: "کاربر یافت نشد" }, { status: 400 });
    }
    const ok = await verifyPassword(password, u.passwordHash);
    if (!ok) {
      return NextResponse.json({ success: false, error: "پسورد اشتباهه" }, { status: 400 });
    }
    const payload = { userId: u.id, username: u.username };
    await setSessionCookie(payload);
    const token = signSession(payload);
    return NextResponse.json({
      success: true,
      token,
      user: { id: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطا";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
