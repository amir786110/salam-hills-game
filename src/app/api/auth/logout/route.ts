import { NextResponse } from "next/server";
import { clearSessionCookie, getCurrentUserFromRequest } from "@/lib/auth";
import { releaseAllTribesOfUser } from "@/lib/servers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const me = await getCurrentUserFromRequest(req);
  if (me) {
    // آزاد کردن همه قبایل مالکیت کاربر و ریست قلمروشون
    await releaseAllTribesOfUser(me.id);
  }
  await clearSessionCookie();
  return NextResponse.json({ success: true });
}
