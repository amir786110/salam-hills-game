import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const me = await getCurrentUserFromRequest(req, body?.authToken);
  if (!me) return NextResponse.json({ success: false, error: "لطفاً وارد شو" }, { status: 401 });
  const { displayName, avatar } = body;
  const patch: { displayName?: string; avatar?: string } = {};
  if (typeof displayName === "string" && displayName.trim().length > 0) {
    patch.displayName = displayName.trim().slice(0, 40);
  }
  if (typeof avatar === "string" && avatar.length > 0) {
    patch.avatar = avatar.slice(0, 8);
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: false, error: "چیزی برای تغییر نیست" }, { status: 400 });
  }
  await db.update(users).set(patch).where(eq(users.id, me.id));
  return NextResponse.json({ success: true });
}
