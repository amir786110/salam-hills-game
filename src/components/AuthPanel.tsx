"use client";
import { apiFetch, setAuthToken } from "@/lib/api-client";
import { useState } from "react";
import { AVATAR_OPTIONS } from "@/lib/tribes-data";

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  avatar: string;
  wins?: number;
  losses?: number;
  attacksLaunched?: number;
  totalTerritoryGained?: number;
}

interface Props {
  onSuccess: (u: AuthUser) => void;
  errorBanner?: string | null;
}

export default function AuthPanel({ onSuccess, errorBanner }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState("🎯");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      const url = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        mode === "login"
          ? { username, password }
          : { username, password, displayName: displayName || username, avatar };
      const res = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        // token رو در localStorage ذخیره کن (fallback برای cookie block)
        if (data.token) setAuthToken(data.token);
        onSuccess(data.user);
      } else {
        setError(data.error || "خطا");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-red-950">
      <div className="w-full max-w-md bg-slate-900/90 backdrop-blur border border-slate-700 rounded-3xl p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">⚔️</div>
          <h1 className="text-4xl font-bold text-amber-300 tracking-tight">سلام هیلز گیم</h1>
          <p className="text-[10px] text-slate-500 mt-1 tracking-widest uppercase" dir="ltr">
            created by CEO of Salam Hills
          </p>
          <p className="text-slate-400 text-sm mt-3">وارد شو و یک قبیله بگیر!</p>
        </div>

        {errorBanner && (
          <div className="mb-4 bg-red-500/20 border border-red-500 text-red-200 rounded-lg px-3 py-2 text-xs text-center">
            {errorBanner}
          </div>
        )}

        <div className="flex gap-1 bg-slate-800 rounded-lg p-1 mb-5">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 py-2 rounded-md text-sm transition ${
              mode === "login" ? "bg-amber-500 text-slate-900 font-bold" : "text-slate-300"
            }`}
          >
            ورود
          </button>
          <button
            onClick={() => setMode("register")}
            className={`flex-1 py-2 rounded-md text-sm transition ${
              mode === "register" ? "bg-amber-500 text-slate-900 font-bold" : "text-slate-300"
            }`}
          >
            ثبت‌نام
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">یوزرنیم</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              // رفع باگ UX: قبلاً فرم فقط با کلیک روی دکمه ارسال می‌شد. حالا با
              // زدن Enter در هر کدوم از فیلدها هم فرم ارسال می‌شه (رفتار استاندارد فرم‌های ورود)
              onKeyDown={(e) => { if (e.key === "Enter" && username && password && !loading) submit(); }}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm"
              placeholder="مثلاً ali123"
              dir="ltr"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">پسورد</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && username && password && !loading) submit(); }}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm"
              placeholder="حداقل ۴ کاراکتر"
              dir="ltr"
            />
          </div>

          {mode === "register" && (
            <>
              <div>
                <label className="text-xs text-slate-400 block mb-1">اسم نمایشی</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm"
                  placeholder="مثلاً علی خان"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-2">آواتار</label>
                <div className="grid grid-cols-10 gap-1">
                  {AVATAR_OPTIONS.map((a) => (
                    <button
                      key={a}
                      onClick={() => setAvatar(a)}
                      className={`text-2xl rounded-lg aspect-square hover:bg-slate-700 ${
                        avatar === a ? "bg-amber-500/30 ring-2 ring-amber-500" : "bg-slate-800"
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-200 rounded-lg px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={loading || !username || !password}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold py-3 rounded-lg transition"
          >
            {loading ? "..." : mode === "login" ? "ورود" : "ثبت‌نام و شروع بازی"}
          </button>
        </div>
      </div>
    </div>
  );
}
