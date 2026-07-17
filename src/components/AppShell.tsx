"use client";
import { apiFetch, setAuthToken } from "@/lib/api-client";
import { useEffect, useState } from "react";
import AuthPanel, { type AuthUser } from "./AuthPanel";

interface Props {
  children: (user: AuthUser, refresh: () => void) => React.ReactNode;
}

export default function AppShell({ children }: Props) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState<string | null>(null);

  const refresh = async () => {
    // رفع باگ: قبلاً res.json() بدون try/catch بود — اگر سرور پاسخ غیر-JSON
    // برمی‌گردوند (مثلاً خطای ۵۰۰ یا قطعی شبکه)، این تابع throw می‌کرد و چون
    // در useEffect بدون catch صدا زده می‌شد، "loaded" هیچ‌وقت true نمی‌شد و
    // کاربر برای همیشه روی صفحه‌ی "در حال بارگذاری..." گیر می‌کرد.
    try {
      const res = await apiFetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json().catch(() => ({ user: null }));
      setUser(data.user ?? null);
      return data.user ?? null;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // اگر یک درخواست ۴۰۱ برگردوند (توکن/کوکی نامعتبر یا حذف‌شده توسط پروکسی)،
  // خودکار کاربر رو خارج کن و صفحه ورود رو با پیام واضح نشون بده
  useEffect(() => {
    const handler = () => {
      setAuthToken(null);
      setUser(null);
      setSessionExpiredMsg(
        "⚠️ نشست شما نامعتبر شد (احتمالاً مرورگر یا شبکه، اطلاعات ورود رو مسدود کرده). لطفاً دوباره وارد شو."
      );
    };
    window.addEventListener("tribes:unauthorized", handler);
    return () => window.removeEventListener("tribes:unauthorized", handler);
  }, []);

  const onLoginSuccess = (u: AuthUser) => {
    setSessionExpiredMsg(null);
    setUser(u);
  };

  if (!loaded) {
    return (
      <div className="min-h-screen grid place-items-center text-amber-300 animate-pulse">
        در حال بارگذاری...
      </div>
    );
  }
  if (!user) return <AuthPanel onSuccess={onLoginSuccess} errorBanner={sessionExpiredMsg} />;
  return <>{children(user, () => { refresh(); })}</>;
}
