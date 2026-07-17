import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const u = await getCurrentUserFromRequest(req);
    if (!u) return NextResponse.json({ user: null });
    return NextResponse.json({
      user: {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatar: u.avatar,
        wins: u.wins,
        losses: u.losses,
        attacksLaunched: u.attacksLaunched,
        totalTerritoryGained: u.totalTerritoryGained,
        createdAt: u.createdAt,
      },
    });
  } catch {
    // رفع باگ: بدون try/catch، خطای غیرمنتظره (مثلاً قطعی موقت دیتابیس) باعث
    // می‌شد این route یک صفحه خطای HTML برگردونه به‌جای JSON، و چون کلاینت
    // انتظار JSON داشت، کل فرایند لاگین/رفرش کاربر کرش می‌کرد
    return NextResponse.json({ user: null }, { status: 200 });
  }
}
