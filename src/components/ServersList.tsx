"use client";
import { apiFetch, setAuthToken } from "@/lib/api-client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { AuthUser } from "./AuthPanel";

interface ServerInfo {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  maxPlayers: number;
  takenCount: number;
  aliveCount: number;
}

export default function ServersList({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const load = async () => {
    // رفع باگ: بدون try/catch، پاسخ غیر-JSON (مثلاً خطای شبکه) کل تابع رو
    // crash می‌کرد و لیست سرورها خالی می‌موند بدون هیچ پیام خطایی به کاربر
    try {
      const res = await apiFetch("/api/servers");
      const data = await res.json().catch(() => ({ servers: [] }));
      setServers(data.servers ?? []);
    } catch {
      setServers([]);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    // رفع باگ: قبلاً setCreating(false) بیرون از finally بود — اگر res.json()
    // throw می‌کرد (پاسخ غیر-JSON)، دکمه برای همیشه در حالت "در حال ساخت" گیر
    // می‌کرد چون کد بعدی که false ش می‌کرد هیچ‌وقت اجرا نمی‌شد
    try {
      const res = await apiFetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json().catch(() => ({ success: false, error: "خطای ارتباط با سرور" }));
      if (data.success) {
        setNewName("");
        setShowCreate(false);
        await load();
      } else {
        alert(data.error || "خطا");
      }
    } catch {
      alert("خطا در ارتباط با سرور");
    } finally {
      setCreating(false);
    }
  };

  const logout = async () => {
    const ok = confirm(
      "با خروج از حساب:\n\n• همه قبایلی که مالکشون هستی از مالکیتت خارج می‌شن\n• قلمرو، منابع، سرباز و کارخانه‌های اون قبایل ریست می‌شه\n\nمطمئنی؟"
    );
    if (!ok) return;
    await apiFetch("/api/auth/logout", { method: "POST" });
    setAuthToken(null);
    onLogout();
  };

  return (
    <div className="min-h-screen p-4 lg:p-8 max-w-5xl mx-auto">
      {/* هدر بازیکن */}
      <div className="bg-slate-900/80 border border-slate-700 rounded-2xl p-4 mb-6 flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={() => setShowProfile(!showProfile)}
          className="flex items-center gap-3 hover:opacity-80"
        >
          <div className="text-4xl">{user.avatar}</div>
          <div className="text-right">
            <div className="text-lg font-bold text-amber-300">{user.displayName}</div>
            <div className="text-xs text-slate-400" dir="ltr">@{user.username}</div>
          </div>
        </button>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-emerald-300">🏆 {user.wins ?? 0} برد</div>
          <div className="text-red-300">💀 {user.losses ?? 0} باخت</div>
          <div className="text-blue-300">⚔️ {user.attacksLaunched ?? 0} حمله</div>
          <div className="text-amber-300">🗺 {user.totalTerritoryGained ?? 0}m خاک</div>
          <button
            onClick={logout}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded-lg text-xs"
          >
            خروج
          </button>
        </div>
      </div>

      {showProfile && <ProfileEditor user={user} onClose={() => setShowProfile(false)} />}

      <div className="mb-6 text-center">
        <h1 className="text-4xl font-bold text-amber-300 tracking-tight">⚔️ سلام هیلز گیم</h1>
        <p className="text-[10px] text-slate-500 mt-1 tracking-widest uppercase" dir="ltr">
          created by CEO of Salam Hills
        </p>
      </div>

      {/* راهنمای گام به گام */}
      <div className="bg-gradient-to-br from-amber-500/20 to-emerald-500/10 border-2 border-amber-500/50 rounded-2xl p-5 mb-6">
        <h2 className="text-lg font-bold text-amber-300 mb-3 flex items-center gap-2">
          🎯 چطور بازی کنم؟ (راهنمای سریع)
        </h2>
        <ol className="space-y-2 text-sm text-slate-200">
          <li className="flex gap-3">
            <span className="bg-amber-500 text-slate-900 font-bold w-6 h-6 rounded-full grid place-items-center flex-shrink-0">۱</span>
            <span>یکی از سرورهای زیر رو انتخاب کن (روی کارتش کلیک کن)</span>
          </li>
          <li className="flex gap-3">
            <span className="bg-amber-500 text-slate-900 font-bold w-6 h-6 rounded-full grid place-items-center flex-shrink-0">۲</span>
            <span>وارد صفحه بازی می‌شی. روی نقشه ماهواره‌ای تهران، روی یکی از قبایل «سلام» که <b className="text-emerald-300">مالک نداره (🆓 آزاد)</b> کلیک کن</span>
          </li>
          <li className="flex gap-3">
            <span className="bg-amber-500 text-slate-900 font-bold w-6 h-6 rounded-full grid place-items-center flex-shrink-0">۳</span>
            <span>یه پنجره باز می‌شه با اطلاعات قبیله. دکمه <b className="text-emerald-300">«✅ بله، بگیر»</b> رو بزن</span>
          </li>
          <li className="flex gap-3">
            <span className="bg-amber-500 text-slate-900 font-bold w-6 h-6 rounded-full grid place-items-center flex-shrink-0">۴</span>
            <span>تبریک! رهبر قبیله شدی. حالا از پنل سمت راست <b className="text-amber-300">🛒 خرید</b> کن، <b className="text-amber-300">🏭 کارخانه</b> بساز و <b className="text-amber-300">⚔️ حمله</b> کن!</span>
          </li>
        </ol>
        <div className="mt-3 pt-3 border-t border-amber-500/30 text-xs text-slate-400">
          💡 نکته: هر بازیکن فقط <b>یک قبیله</b> در هر سرور می‌تونه داشته باشه. اگه پشیمون شدی، از داخل بازی می‌تونی قبیله رو رها کنی و یکی دیگه بگیری.
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-amber-300">🌐 سرورهای در دسترس (روی یکی کلیک کن)</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg"
        >
          + سرور جدید بساز
        </button>
      </div>

      {showCreate && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-4 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="اسم سرور جدید..."
            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={create}
            disabled={creating}
            className="bg-amber-500 text-slate-900 font-bold px-4 py-2 rounded-lg disabled:opacity-50"
          >
            بساز
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {servers.map((s) => (
          <Link
            key={s.id}
            href={`/play/${s.slug}`}
            className="bg-slate-900/80 border border-slate-700 hover:border-amber-500 rounded-2xl p-5 transition group"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-amber-300 group-hover:text-amber-200">
                🎮 {s.name}
              </h3>
              <span className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded">
                {s.slug}
              </span>
            </div>
            {s.description && <p className="text-sm text-slate-400 mb-3">{s.description}</p>}
            <div className="flex items-center gap-4 text-xs text-slate-300">
              <span>👥 {s.takenCount}/{s.maxPlayers} بازیکن</span>
              <span>🏰 {s.aliveCount} قبیله زنده</span>
              <span className="text-emerald-400">▶ ورود</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ProfileEditor({ user, onClose }: { user: AuthUser; onClose: () => void }) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatar, setAvatar] = useState(user.avatar);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    // رفع باگ: قبلاً نتیجه‌ی درخواست اصلاً چک نمی‌شد — حتی اگر ذخیره‌سازی به‌خاطر
    // خطای اعتبارسنجی یا شبکه شکست می‌خورد، صفحه بدون هیچ پیامی رفرش می‌شد و
    // کاربر فکر می‌کرد تغییراتش ذخیره شده در حالی که نشده بود
    setSaving(true);
    try {
      const res = await apiFetch("/api/auth/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, avatar }),
      });
      const data = await res.json().catch(() => ({ success: false, error: "خطای ارتباط با سرور" }));
      if (data.success) {
        onClose();
        location.reload();
      } else {
        alert(data.error || "خطا در ذخیره پروفایل");
      }
    } catch {
      alert("خطا در ارتباط با سرور");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="bg-slate-900 border border-amber-500/50 rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="text-4xl">{avatar}</div>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1"
        />
        <button onClick={save} disabled={saving} className="bg-emerald-600 disabled:bg-slate-700 text-white px-3 py-1 rounded">
          {saving ? "..." : "ذخیره"}
        </button>
        <button onClick={onClose} className="bg-slate-700 text-white px-3 py-1 rounded">
          ✕
        </button>
      </div>
      <div className="grid grid-cols-10 gap-1">
        {["🎯","⚔️","🛡️","🚀","✈️","🦁","🐺","🦅","🐉","👑","🥷","🧙","🦾","💀","🔥","⚡","🌟","🎖️","🏆","🗡️"].map((a) => (
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
  );
}
