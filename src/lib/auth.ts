import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies, headers } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const SECRET = process.env.JWT_SECRET ?? "dev-secret";
const COOKIE_NAME = "tribes_session";

export interface SessionPayload {
  userId: number;
  username: string;
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "30d" });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const p = jwt.verify(token, SECRET) as SessionPayload;
    return p;
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload) {
  const jar = await cookies();
  const token = signSession(payload);
  const isProd = process.env.NODE_ENV === "production";
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    // در production (HTTPS) از "none" استفاده می‌کنیم تا در iframe/embed هم کار کنه
    sameSite: isProd ? "none" : "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: isProd,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  // ۱) اول از cookie چک کن
  const jar = await cookies();
  const cookieToken = jar.get(COOKIE_NAME)?.value;
  if (cookieToken) {
    const s = verifySession(cookieToken);
    if (s) return s;
  }

  const h = await headers();

  // ۲) هدر سفارشی x-tribes-token (بعضی پروکسی‌ها/iframe ها هدر Authorization رو حذف می‌کنن،
  //    ولی هدرهای سفارشی معمولاً دست‌نخورده می‌مانن)
  const customHeaderToken = h.get("x-tribes-token");
  if (customHeaderToken) {
    const s = verifySession(customHeaderToken);
    if (s) return s;
  }

  // ۳) هدر استاندارد Authorization: Bearer <token>
  const auth = h.get("authorization");
  if (auth && auth.startsWith("Bearer ")) {
    const s = verifySession(auth.slice(7));
    if (s) return s;
  }

  return null;
}

// استخراج توکن از بدنه request (fallback نهایی — وقتی هیچ هدری رد نمی‌شه)
export async function getSessionFromBody(bodyToken: string | undefined | null): Promise<SessionPayload | null> {
  if (!bodyToken) return null;
  return verifySession(bodyToken);
}

export async function getCurrentUser(fallbackToken?: string | null) {
  let s = await getSession();
  // اگر از cookie/header چیزی پیدا نشد، از توکنی که در بدنه JSON فرستاده شده استفاده کن
  // (fallback نهایی برای محیط‌هایی که همه هدرها رو هم حذف می‌کنن)
  if (!s && fallbackToken) {
    s = await getSessionFromBody(fallbackToken);
  }
  if (!s) return null;
  const [u] = await db.select().from(users).where(eq(users.id, s.userId));
  return u ?? null;
}

// نسخه کامل: از روی Request مستقیم، هم query param و هم body رو fallback چک می‌کنه
// برای GET ها: ?authToken=xxx در URL هم پشتیبانی می‌شه
export async function getCurrentUserFromRequest(req: Request, bodyToken?: string | null) {
  let s = await getSession();
  if (!s) {
    try {
      const url = new URL(req.url);
      const qToken = url.searchParams.get("authToken");
      if (qToken) s = verifySession(qToken);
    } catch {
      // ignore
    }
  }
  if (!s && bodyToken) {
    s = await getSessionFromBody(bodyToken);
  }
  if (!s) return null;
  const [u] = await db.select().from(users).where(eq(users.id, s.userId));
  return u ?? null;
}
