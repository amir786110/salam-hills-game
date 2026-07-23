"use client";
import { apiFetch } from "@/lib/api-client";
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { AuthUser } from "./AuthPanel";
import { JETS, MISSILES, DEFENSES, FACTORIES, FACTORY_BY_ID, UNIT_BY_ID, MAX_SOLDIERS, SOLDIER_PRICE, SOLDIER_ATTACK, REPAIR_COST_PER_PERCENT, upgradeCost, type FactoryInstance, type UnitDef } from "@/lib/units-catalog";

const TehranMap = dynamic(() => import("./TehranMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full rounded-2xl bg-slate-900 border border-slate-700 p-4 h-[620px] grid place-items-center text-amber-300 animate-pulse">
      🛰️ در حال بارگذاری نقشه...
    </div>
  ),
});

type UnitInv = Record<string, number>;

interface Tribe {
  id: number;
  name: string;
  district: string;
  color: string;
  lat: number;
  lng: number;
  coins: number;
  soldiers: number;
  isAlive: boolean;
  ownerId: number | null;
  aiEnabled: boolean;
  territoryPolygon: number[][];
  territoryPct: number;
  areaKm2: number;
  attackPower: number;
  defensePower: number;
  income: number;
  factories: FactoryInstance[];
  jetsInventory: UnitInv;
  missilesInventory: UnitInv;
  defensesInventory: UnitInv;
  owner: { username: string; displayName: string; avatar: string } | null;
}

interface LogRec {
  id: number;
  attackerName: string;
  defenderName: string;
  attackPower: number;
  defensePower: number;
  metersTaken: number;
  areaTakenKm2: number;
  attackerLosses: number;
  defenderLosses: number;
  interceptedMissiles: number;
  capturedFactories: FactoryInstance[];
  result: string;
  narrative: string | null;
  createdAt: string;
}

interface Proclamation {
  id: number;
  tribeName: string;
  tribeColor: string;
  authorName: string;
  authorAvatar: string;
  message: string;
  createdAt: string;
}

interface AllianceRequestRec {
  id: number;
  fromTribeId: number;
  toTribeId: number;
  status: string;
  createdAt: string;
  fromTribeName?: string;
  toTribeName?: string;
}

// رفع باگ: بجای res.json() مستقیم (که با پاسخ غیر-JSON کرش می‌کنه)، این تابع
// همیشه یک آبجکت معتبر برمی‌گردونه
async function safeJson(res: Response): Promise<{ success?: boolean; error?: string; [k: string]: unknown }> {
  try {
    return await res.json();
  } catch {
    return { success: false, error: `خطای ارتباط با سرور (کد ${res.status})` };
  }
}

interface State {
  server: { id: number; name: string; slug: string };
  tribes: Tribe[];
  alliances: { tribeAId: number; tribeBId: number }[];
  logs: LogRec[];
  proclamations: Proclamation[];
}

interface StrategyAdvice {
  summary: string;
  recommendations: string[];
  economyHealth: string;
  bestPurchase?: { item: string; reason: string };
  bestTarget?: { name: string; districtLandmark: string; expectedResult: string };
}

function invTotal(inv: UnitInv | undefined) {
  if (!inv) return 0;
  return Object.values(inv).reduce((s, v) => s + (v || 0), 0);
}

export default function GamePlay({ user, slug }: { user: AuthUser; slug: string }) {
  const [state, setState] = useState<State | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [alliesForAttack, setAlliesForAttack] = useState<number[]>([]);
  const [useSoldiers, setUseSoldiers] = useState(0);
  const [useMissileTotal, setUseMissileTotal] = useState(0);
  const [useJetTotal, setUseJetTotal] = useState(0);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");
  const [tab, setTab] = useState<"buy" | "factories" | "attack" | "alliance" | "logs" | "news">("buy");
  const [buyCategory, setBuyCategory] = useState<"jet" | "missile" | "defense">("missile");
  const [aiLogs, setAiLogs] = useState<string[]>([]);
  const [advice, setAdvice] = useState<StrategyAdvice | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  // دیالوگ انتخاب قبیله از روی نقشه
  const [pendingTribeId, setPendingTribeId] = useState<number | null>(null);
  // درخواست‌های اتحاد (رفع باگ اتحاد یک‌طرفه — حالا نیاز به تأیید طرفین داره)
  const [incomingRequests, setIncomingRequests] = useState<AllianceRequestRec[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<AllianceRequestRec[]>([]);
  // رفع باگ کلیک مکرر (double-submit): بدون این، اگه کاربر سریع چند بار روی
  // دکمه‌ی خرید/حمله/اتحاد بزنه، چند درخواست واقعی هم‌زمان ارسال می‌شه —
  // مثلاً چند حمله‌ی واقعی یا چند خرید به‌جای یکی. با این state، در حین
  // پردازش هر عملیات، تمام دکمه‌های اکشن غیرفعال می‌شن.
  const [isBusy, setIsBusy] = useState(false);

  const fetchState = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/servers/${slug}/state`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await safeJson(res);
      setState(data as unknown as State);
    } catch {
      // خطای شبکه — نادیده بگیر، تیک بعدی دوباره امتحان می‌کنه
    }
  }, [slug]);

  const fetchAllianceRequests = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/servers/${slug}/action/alliance-requests`);
      const data = await safeJson(res);
      if (data.success) {
        setIncomingRequests((data.incoming as AllianceRequestRec[]) ?? []);
        setOutgoingRequests((data.outgoing as AllianceRequestRec[]) ?? []);
      }
    } catch {
      // ignore
    }
  }, [slug]);

  useEffect(() => { fetchState(); }, [fetchState]);
  useEffect(() => { fetchAllianceRequests(); }, [fetchAllianceRequests]);

  useEffect(() => {
    const t = setInterval(async () => {
      await apiFetch(`/api/servers/${slug}/tick`, { method: "POST" });
      await fetchState();
    }, 5000);
    return () => clearInterval(t);
  }, [slug, fetchState]);

  useEffect(() => {
    const t = setInterval(async () => {
      const res = await apiFetch(`/api/servers/${slug}/ai-tick`, { method: "POST" });
      const data = await safeJson(res);
      const logs = data.logs as string[] | undefined;
      if (logs?.length) setAiLogs((prev) => [...logs, ...prev].slice(0, 40));
      await fetchState();
    }, 12000);
    return () => clearInterval(t);
  }, [slug, fetchState]);

  // درخواست‌های اتحاد رو هر ۷ ثانیه به‌روز کن تا سریع متوجه درخواست جدید بشی
  useEffect(() => {
    const t = setInterval(fetchAllianceRequests, 7000);
    return () => clearInterval(t);
  }, [fetchAllianceRequests]);

  const myTribe = state?.tribes.find((t) => t.ownerId === user.id) ?? null;
  const selected = state?.tribes.find((t) => t.id === selectedId) ?? null;
  const target = state?.tribes.find((t) => t.id === targetId) ?? null;

  // اگر قبیله دارم ولی هنوز چیزی انتخاب نکردم، خودکار قبیله خودم رو انتخاب کن
  useEffect(() => {
    if (myTribe && selectedId === null) {
      setSelectedId(myTribe.id);
    }
  }, [myTribe, selectedId]);

  // رفع باگ: اگر قبیله هدف حمله از بین رفت یا دیگه معتبر نیست، از انتخاب حذفش کن
  useEffect(() => {
    if (targetId !== null && state && !target) {
      setTargetId(null);
    }
  }, [targetId, state, target]);

  const showMsg = (text: string, type: "success" | "error" | "info" = "info") => {
    setMessage(text); setMessageType(type);
    setTimeout(() => setMessage(""), 5000);
  };

  const claim = async (tribeId: number): Promise<boolean> => {
    if (isBusy) return false;
    setIsBusy(true);
    const res = await apiFetch(`/api/servers/${slug}/claim`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tribeId }),
    });
    const data = await safeJson(res);
    if (!data.success) {
      showMsg((data.error as string) || "خطا در گرفتن قبیله", "error");
      setIsBusy(false);
      return false;
    }
    // به‌روزرسانی خوش‌بینانه: بلافاصله state محلی رو تغییر بده تا UI نپرد
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tribes: prev.tribes.map((t) =>
          t.id === tribeId
            ? { ...t, ownerId: user.id, owner: { username: user.username, displayName: user.displayName, avatar: user.avatar } }
            : t
        ),
      };
    });
    setSelectedId(tribeId);
    setTab("buy");
    setTargetId(null);
    setAlliesForAttack([]);
    showMsg("🎉 تبریک! رهبر قبیله شدی — بازی رسماً شروع شد!", "success");
    setIsBusy(false);
    // بعد از یه لحظه state رو از سرور sync کن (بدون بلاک کردن UI)
    fetchState();
    // advice رو در پس‌زمینه بگیر
    apiFetch(`/api/servers/${slug}/action/advice`)
      .then(safeJson)
      .then((d) => { if (d.success) setAdvice(d.advice as StrategyAdvice); })
      .catch(() => { /* ignore */ });
    return true;
  };

  const releaseTribe = async () => {
    const ok = confirm(
      "با رها کردن قبیله:\n\n• از مالکیتت خارج می‌شه\n• قلمرو به حالت اولیه Voronoi برمی‌گرده\n• همه منابع، سرباز، تسلیحات و کارخانه‌ها ریست می‌شن\n• قبیله برای بازیکنان دیگه قابل گرفتنه\n\nمطمئنی؟"
    );
    if (!ok) return;
    if (isBusy) return;
    setIsBusy(true);
    try {
      await apiFetch(`/api/servers/${slug}/claim`, { method: "DELETE" });
      setSelectedId(null);
      setTab("buy");
      await fetchState();
    } finally {
      setIsBusy(false);
    }
  };

  const buyUnit = async (unitId: string, qty: number) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const res = await apiFetch(`/api/servers/${slug}/action/buy`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "unit", unitId, quantity: qty }),
      });
      const data = await safeJson(res);
      if (data.success) { showMsg("خرید موفق", "success"); await fetchState(); }
      else showMsg((data.error as string) || "خطا", "error");
    } finally {
      setIsBusy(false);
    }
  };

  const buySoldier = async (qty: number) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const res = await apiFetch(`/api/servers/${slug}/action/buy`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "soldier", quantity: qty }),
      });
      const data = await safeJson(res);
      if (data.success) { showMsg(`${qty} سرباز خریدی`, "success"); await fetchState(); }
      else showMsg((data.error as string) || "خطا", "error");
    } finally {
      setIsBusy(false);
    }
  };

  const factoryAction = async (kind: "factory_build" | "factory_upgrade" | "factory_repair", factoryId: string, percent?: number) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const res = await apiFetch(`/api/servers/${slug}/action/buy`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, factoryId, percent }),
      });
      const data = await safeJson(res);
      if (data.success) { showMsg("انجام شد", "success"); await fetchState(); }
      else showMsg((data.error as string) || "خطا", "error");
    } finally {
      setIsBusy(false);
    }
  };

  const attack = async () => {
    if (!target || !myTribe) return;
    if (isBusy) return;
    // رفع باگ: قبل از ارسال، مقادیر رو به سقف واقعی محدود کن (کلاینت ممکنه state
    // قدیمی داشته باشه، سرور هم چک می‌کنه ولی بهتره پیام خطای گیج‌کننده نگیره)
    const safeSoldiers = Math.min(useSoldiers, totalSoldiers);
    const safeMissiles = Math.min(useMissileTotal, totalMissiles);
    const safeJets = Math.min(useJetTotal, totalJets);
    if (safeSoldiers + safeMissiles + safeJets === 0) {
      showMsg("حداقل یک نوع نیرو باید اعزام کنی", "error");
      return;
    }
    setIsBusy(true);
    try {
      const res = await apiFetch(`/api/servers/${slug}/action/attack`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alliesIds: alliesForAttack, defenderId: target.id,
          useSoldiers: safeSoldiers, useMissileTotal: safeMissiles, useJetTotal: safeJets,
        }),
      });
      const data = await safeJson(res);
      if (data.success) {
        showMsg((data.narrative as string) || (data.message as string) || "حمله انجام شد", data.result === "win" ? "success" : data.result === "lose" ? "error" : "info");
        setUseSoldiers(0); setUseMissileTotal(0); setUseJetTotal(0);
        setAlliesForAttack([]);
        await fetchState();
      } else {
        showMsg((data.error as string) || "خطا در حمله", "error");
      }
    } finally {
      setIsBusy(false);
    }
  };

  // ارسال درخواست اتحاد (نیاز به تأیید طرف مقابل — رفع باگ اتحاد یک‌طرفه)
  const propose = async (otherId: number) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const res = await apiFetch(`/api/servers/${slug}/action/alliance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otherTribeId: otherId }),
      });
      const data = await safeJson(res);
      if (data.success) {
        showMsg(data.autoAccepted ? "اتحاد برقرار شد 🤝" : "درخواست اتحاد فرستاده شد 📨 — منتظر تأیید طرف مقابل باش", "success");
        await fetchState();
        await fetchAllianceRequests();
      } else {
        showMsg((data.error as string) || "خطا", "error");
      }
    } finally {
      setIsBusy(false);
    }
  };
  const breakAlly = async (otherId: number) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const res = await apiFetch(`/api/servers/${slug}/action/alliance`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otherTribeId: otherId }),
      });
      const data = await safeJson(res);
      if (data.success) { showMsg("اتحاد شکسته شد", "info"); await fetchState(); }
      else showMsg((data.error as string) || "خطا", "error");
    } finally {
      setIsBusy(false);
    }
  };

  const respondToRequest = async (requestId: number, accept: boolean) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const res = await apiFetch(`/api/servers/${slug}/action/alliance-respond`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, accept }),
      });
      const data = await safeJson(res);
      if (data.success) {
        showMsg(accept ? "اتحاد رو قبول کردی 🤝" : "درخواست رد شد", accept ? "success" : "info");
        await fetchState();
        await fetchAllianceRequests();
      } else {
        showMsg((data.error as string) || "خطا", "error");
      }
    } finally {
      setIsBusy(false);
    }
  };

  const cancelRequest = async (requestId: number) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const res = await apiFetch(`/api/servers/${slug}/action/alliance-respond`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const data = await safeJson(res);
      if (data.success) { showMsg("درخواست لغو شد", "info"); await fetchAllianceRequests(); }
      else showMsg((data.error as string) || "خطا", "error");
    } finally {
      setIsBusy(false);
    }
  };

  const askAdvice = async () => {
    setLoadingAdvice(true);
    try {
      const res = await apiFetch(`/api/servers/${slug}/action/advice`);
      const data = await safeJson(res);
      if (data.success) setAdvice(data.advice as StrategyAdvice);
      else showMsg((data.error as string) || "خطا در دریافت توصیه", "error");
    } finally {
      setLoadingAdvice(false);
    }
  };

  const sendBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    if (isBusy) return;
    setIsBusy(true);
    try {
      const res = await apiFetch(`/api/servers/${slug}/proclamations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: broadcastMsg }),
      });
      const data = await safeJson(res);
      if (data.success) { setBroadcastMsg(""); showMsg("بیانیه صادر شد 📣", "success"); await fetchState(); }
      else showMsg((data.error as string) || "خطا", "error");
    } finally {
      setIsBusy(false);
    }
  };

  // این محاسبات باید قبل از هر return شرطی انجام بشن تا استفاده‌شون در useEffect زیر
  // با قوانین React Hooks (فراخوانی بدون شرط) مغایرت نداشته باشه
  const isAllied = (a: number, b: number) =>
    (state?.alliances ?? []).some((al) => (al.tribeAId === a && al.tribeBId === b) || (al.tribeAId === b && al.tribeBId === a));

  const myAllies = myTribe && state
    ? state.tribes.filter((t) => t.id !== myTribe.id && t.isAlive && isAllied(myTribe.id, t.id))
    : [];
  const attackForce = myTribe && state ? [myTribe, ...state.tribes.filter((t) => alliesForAttack.includes(t.id))] : [];
  const totalMissiles = attackForce.reduce((s, t) => s + invTotal(t.missilesInventory), 0);
  const totalJets = attackForce.reduce((s, t) => s + invTotal(t.jetsInventory), 0);
  const totalSoldiers = attackForce.reduce((s, t) => s + t.soldiers, 0);

  // رفع باگ: اگر بعد از تغییر متحدها یا مصرف منابع، سقف موجودی کمتر از مقدار
  // انتخاب‌شده در اسلایدر بشه، مقدار انتخاب‌شده باید خودکار محدود (clamp) بشه
  // وگرنه کاربر می‌تونست عددی بیشتر از موجودی واقعی برای حمله بفرسته
  useEffect(() => {
    setUseSoldiers((v) => Math.min(v, totalSoldiers));
  }, [totalSoldiers]);
  useEffect(() => {
    setUseMissileTotal((v) => Math.min(v, totalMissiles));
  }, [totalMissiles]);
  useEffect(() => {
    setUseJetTotal((v) => Math.min(v, totalJets));
  }, [totalJets]);

  if (!state) {
    return <div className="min-h-screen grid place-items-center text-amber-300 animate-pulse">در حال بارگذاری...</div>;
  }

  // تخمین قدرت حمله
  const estimateAttackPower = () => {
    let power = useSoldiers * SOLDIER_ATTACK;
    // برای موشک/جنگنده: میانگین قدرت
    if (useMissileTotal > 0) {
      let sumP = 0, sumC = 0;
      for (const t of attackForce) {
        for (const [id, c] of Object.entries(t.missilesInventory ?? {})) {
          const u = UNIT_BY_ID[id];
          if (u) { sumP += u.attackPower * c; sumC += c; }
        }
      }
      const avg = sumC > 0 ? sumP / sumC : 30;
      power += Math.floor(useMissileTotal * avg);
    }
    if (useJetTotal > 0) {
      let sumP = 0, sumC = 0;
      for (const t of attackForce) {
        for (const [id, c] of Object.entries(t.jetsInventory ?? {})) {
          const u = UNIT_BY_ID[id];
          if (u) { sumP += u.attackPower * c; sumC += c; }
        }
      }
      const avg = sumC > 0 ? sumP / sumC : 60;
      power += Math.floor(useJetTotal * avg);
    }
    return power;
  };
  const projectedPower = estimateAttackPower();

  return (
    <div className="min-h-screen p-3 lg:p-5 max-w-[1750px] mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/" className="text-xs bg-slate-800 border border-slate-700 rounded px-3 py-2 hover:bg-slate-700">
            ← لیست سرورها
          </Link>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-amber-300 leading-tight">⚔️ سلام هیلز گیم</h1>
            <p className="text-[9px] text-slate-500 tracking-widest uppercase leading-tight" dir="ltr">
              created by CEO of Salam Hills
            </p>
          </div>
          <span className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded">🎮 {state.server.name}</span>
          <span className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded">💎 هیلزکوین</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-1.5">
            {user.avatar} {user.displayName}
          </div>
          {myTribe && (
            <>
              <button
                disabled={isBusy}
                onClick={async () => {
                  if (isBusy) return;
                  setIsBusy(true);
                  try {
                    const res = await apiFetch(`/api/servers/${slug}/toggle-ai`, { method: "POST" });
                    const d = await safeJson(res);
                    if (d.success) {
                      showMsg(d.aiEnabled ? "🤖 AI روشن شد - جای شما بازی می‌کنه" : "🎮 AI خاموش شد - دستی بازی می‌کنی", "info");
                      await fetchState();
                    } else {
                      showMsg((d.error as string) || "خطا", "error");
                    }
                  } finally {
                    setIsBusy(false);
                  }
                }}
                className={`text-xs px-3 py-1.5 rounded-lg disabled:opacity-50 ${
                  myTribe.aiEnabled === true
                    ? "bg-purple-600 hover:bg-purple-500 text-white"
                    : "bg-slate-700 hover:bg-slate-600 text-slate-200"
                }`}
              >
                🤖 AI: {myTribe.aiEnabled ? "روشن" : "خاموش"}
              </button>
              <button onClick={releaseTribe} disabled={isBusy} className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-50">
                🚪 رها کردن قبیله
              </button>
            </>
          )}
        </div>
      </header>

      {message && (
        <div className={`mb-3 px-4 py-3 rounded-lg text-sm font-medium border ${
          messageType === "success" ? "bg-emerald-500/20 border-emerald-500 text-emerald-200"
            : messageType === "error" ? "bg-red-500/20 border-red-500 text-red-200"
            : "bg-blue-500/20 border-blue-500 text-blue-200"
        }`}>{message}</div>
      )}

      {!myTribe && (
        <div className="bg-gradient-to-r from-amber-500/20 to-emerald-500/10 border-2 border-amber-500 rounded-2xl p-5 mb-4 animate-pulse-slow">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="text-5xl animate-bounce">👇</div>
            <div className="flex-1 min-w-[250px]">
              <h3 className="font-bold text-amber-300 text-xl mb-2">
                🎯 قدم بعدی: یه قبیله انتخاب کن!
              </h3>
              <ol className="text-sm text-slate-200 space-y-1.5 list-decimal list-inside">
                <li>روی نقشه ماهواره‌ای پایین، یکی از این قبایل رنگی رو ببین</li>
                <li>قبایلی که برچسبشون <b className="bg-slate-700 px-1 rounded text-slate-300">🆓 آزاد</b> داره یعنی <b className="text-emerald-300">مالک ندارن</b> و آماده انتخابن</li>
                <li>روی هر جای اون قبیله (قلمرو یا برچسب) <b className="text-amber-300">کلیک کن</b></li>
                <li>یه پنجره باز می‌شه، دکمه سبز <b className="text-emerald-300">✅ بله، بگیر</b> رو بزن</li>
                <li>تمام! رهبر قبیله می‌شی و بازی شروع می‌شه 🎮</li>
              </ol>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-400 bg-slate-900/50 rounded-lg p-2">
                <span>💡</span>
                <span>می‌تونی از جدول رتبه‌بندی پایین‌تر هم روی اسم قبیله کلیک کنی — همون کار می‌کنه</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {myTribe && (
        <div
          className="rounded-2xl p-4 mb-4 border-2 flex items-center justify-between flex-wrap gap-3"
          style={{
            background: `linear-gradient(90deg, ${myTribe.color}25, transparent)`,
            borderColor: myTribe.color,
          }}
        >
          <div className="flex items-center gap-3">
            <div className="text-3xl">👑</div>
            <div>
              <h3 className="font-bold text-lg" style={{ color: myTribe.color }}>
                رهبر قبیله {myTribe.name}
              </h3>
              <p className="text-xs text-slate-300">
                📍 {myTribe.district} · تو کاملاً کنترل این قبیله رو داری. از پنل سمت راست خرید، ساخت کارخانه و حمله کن!
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="bg-slate-900/60 rounded-lg px-3 py-1.5">💎 <b className="text-amber-300">{myTribe.coins}</b></div>
            <div className="bg-slate-900/60 rounded-lg px-3 py-1.5">📈 <b className="text-emerald-300">+{myTribe.income}/تیک</b></div>
            <div className="bg-slate-900/60 rounded-lg px-3 py-1.5">🗺 <b>{myTribe.territoryPct}٪</b></div>
            <div className="bg-slate-900/60 rounded-lg px-3 py-1.5">👥 <b>{myTribe.soldiers}</b></div>
            <div className="bg-slate-900/60 rounded-lg px-3 py-1.5">⚔ <b className="text-orange-300">{myTribe.attackPower}</b></div>
            <div className="bg-slate-900/60 rounded-lg px-3 py-1.5">🛡 <b className="text-blue-300">{myTribe.defensePower}</b></div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* نقشه */}
        <div className="lg:col-span-2">
          <TehranMap
            tribes={state.tribes}
            selectedId={selectedId}
            onSelect={(id) => {
              // اگر روی قبیله خودم کلیک کردم، مستقیم انتخاب
              if (myTribe && id === myTribe.id) {
                setSelectedId(id);
                return;
              }
              // اگر در تب حمله‌ام، مستقیم به‌عنوان هدف
              if (tab === "attack" && myTribe && id !== myTribe.id) {
                setTargetId(id);
                setSelectedId(id);
                return;
              }
              // در غیر این صورت دیالوگ تأیید نمایش بده
              setPendingTribeId(id);
            }}
            alliances={state.alliances}
            myTribeId={myTribe?.id ?? null}
          />

          {/* بیانیه‌های اخیر (خلاصه) */}
          {state.proclamations.length > 0 && (
            <div className="mt-4 bg-slate-900/70 border border-slate-700 rounded-2xl p-4">
              <h3 className="text-amber-300 font-bold mb-3 flex items-center gap-2">📣 بیانیه‌های اخیر
                <span className="text-xs text-slate-400 font-normal">({state.proclamations.length})</span>
              </h3>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {state.proclamations.slice(0, 6).map((p) => (
                  <div key={p.id} className="bg-slate-800/50 border-r-4 rounded-lg p-3" style={{ borderRightColor: p.tribeColor }}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold" style={{ color: p.tribeColor }}>
                        {p.authorAvatar} {p.authorName} از {p.tribeName}
                      </span>
                      <span className="text-slate-500">{new Date(p.createdAt).toLocaleTimeString("fa-IR")}</span>
                    </div>
                    <div className="text-sm text-slate-200">{p.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* جدول */}
          <div className="mt-4 bg-slate-900/70 border border-slate-700 rounded-2xl p-4">
            <h3 className="text-amber-300 font-bold mb-3">🏆 جدول رتبه‌بندی</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-400 text-xs">
                  <tr className="border-b border-slate-700">
                    <th className="text-right py-2">قبیله</th>
                    <th className="text-center">مالک</th>
                    <th className="text-center">خاک</th>
                    <th className="text-center">💎</th>
                    <th className="text-center">درآمد</th>
                    <th className="text-center">🏭</th>
                    <th className="text-center">👥</th>
                    <th className="text-center">⚔ قدرت</th>
                    <th className="text-center">🛡 دفاع</th>
                  </tr>
                </thead>
                <tbody>
                  {[...state.tribes].sort((a, b) => b.territoryPct - a.territoryPct).map((t) => (
                    <tr key={t.id} onClick={() => setSelectedId(t.id)}
                      className={`border-b border-slate-800 cursor-pointer hover:bg-slate-800/50 ${
                        selectedId === t.id ? "bg-amber-500/10" : ""
                      } ${myTribe?.id === t.id ? "bg-emerald-500/10" : ""} ${!t.isAlive ? "opacity-40" : ""}`}
                    >
                      <td className="py-2 text-right">
                        <span className="inline-block w-3 h-3 rounded ml-2" style={{ background: t.color }} />
                        {t.name} {!t.isAlive && "💀"}
                      </td>
                      <td className="text-center text-xs">
                        {t.owner ? (
                          <span>{t.owner.avatar} {t.owner.displayName}</span>
                        ) : !myTribe && t.isAlive ? (
                          <span className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px] font-bold animate-pulse">
                            🎯 قابل انتخاب
                          </span>
                        ) : (
                          <span className="text-slate-500">🆓 آزاد</span>
                        )}
                      </td>
                      <td className="text-center">{t.territoryPct}٪</td>
                      <td className="text-center text-amber-300">{t.coins}</td>
                      <td className="text-center text-emerald-300">+{t.income}</td>
                      <td className="text-center">{t.factories.length}</td>
                      <td className="text-center">{t.soldiers}</td>
                      <td className="text-center text-orange-300">{t.attackPower}</td>
                      <td className="text-center text-blue-300">{t.defensePower}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* AI logs */}
          <div className="mt-4 bg-slate-900/70 border border-slate-700 rounded-2xl p-4">
            <h3 className="text-amber-300 font-bold mb-3">🤖 گزارش دستیار AI بازیکنان (Auto-Play)</h3>
            <div className="max-h-52 overflow-y-auto space-y-1 text-xs">
              {aiLogs.length === 0 && <div className="text-slate-500 text-center py-4">AI به زودی حرکت می‌کنه...</div>}
              {aiLogs.map((l, i) => (
                <div key={i} className="bg-slate-800/40 border border-slate-700/60 rounded px-2 py-1 text-slate-300 font-mono">{l}</div>
              ))}
            </div>
          </div>
        </div>

        {/* پنل کنترل */}
        <aside className="bg-slate-900/70 border border-slate-700 rounded-2xl p-4 space-y-4 h-fit sticky top-3">
          {!selected ? (
            <div className="text-center text-slate-400 py-8">روی نقشه یا جدول یک قبیله انتخاب کن 👆</div>
          ) : (
            <>
              {/* اطلاعات قبیله */}
              <div className="rounded-xl p-4 border" style={{
                background: `linear-gradient(135deg, ${selected.color}30, transparent)`,
                borderColor: selected.color,
              }}>
                <h2 className="text-xl font-bold" style={{ color: selected.color }}>{selected.name}</h2>
                <p className="text-xs text-slate-400 mt-1">
                  {selected.district} · {selected.owner ? `${selected.owner.avatar} ${selected.owner.displayName}` : "🆓 آزاد"}
                </p>
                <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                  <div>💎 <b className="text-amber-300">{selected.coins}</b></div>
                  <div>📈 <b className="text-emerald-300">+{selected.income}/تیک</b></div>
                  <div>🗺 <b>{selected.territoryPct}٪</b></div>
                  <div>📐 <b>{selected.areaKm2.toFixed(2)}km²</b></div>
                  <div>👥 <b>{selected.soldiers}/{MAX_SOLDIERS}</b></div>
                  <div>🏭 <b>{selected.factories.length}</b></div>
                  <div>⚔ <b className="text-orange-300">{selected.attackPower}</b></div>
                  <div>🛡 <b className="text-blue-300">{selected.defensePower}</b></div>
                </div>
                {/* inventory سریع */}
                <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                  {invTotal(selected.missilesInventory) > 0 && <div>🚀 موشک: {invTotal(selected.missilesInventory)}</div>}
                  {invTotal(selected.jetsInventory) > 0 && <div>✈ جنگنده: {invTotal(selected.jetsInventory)}</div>}
                  {invTotal(selected.defensesInventory) > 0 && <div>🛡 پدافند: {invTotal(selected.defensesInventory)}</div>}
                </div>

                {!selected.owner && selected.isAlive && !myTribe && (
                  <button onClick={() => claim(selected.id)}
                    className="w-full mt-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg">
                    🎯 این قبیله رو بگیر!
                  </button>
                )}
                {selected.ownerId === user.id && (
                  <div className="mt-3 text-xs text-emerald-300 text-center">✓ قبیله شما</div>
                )}
              </div>

              {myTribe && (
                <>
                  <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 flex-wrap">
                    {(["buy", "factories", "attack", "alliance", "logs", "news"] as const).map((t) => (
                      <button key={t}
                        onClick={() => { setTab(t); if (t === "attack") setSelectedId(myTribe.id); }}
                        className={`flex-1 text-xs py-2 rounded-md transition min-w-[60px] ${
                          tab === t ? "bg-amber-500 text-slate-900 font-bold" : "text-slate-300"
                        }`}>
                        {t === "buy" && "🛒"}
                        {t === "factories" && "🏭"}
                        {t === "attack" && "⚔️"}
                        {t === "alliance" && "🤝"}
                        {t === "logs" && "📜"}
                        {t === "news" && "📣"}
                      </button>
                    ))}
                  </div>

                  {/* AI advisor */}
                  <div className="bg-purple-500/10 border border-purple-500/40 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-bold text-purple-300">🧠 دستیار AI</div>
                      <button onClick={askAdvice} disabled={loadingAdvice}
                        className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-2 py-1 rounded">
                        {loadingAdvice ? "..." : "توصیه بگیر"}
                      </button>
                    </div>
                    {advice && (
                      <div className="text-xs space-y-1">
                        <div className="text-purple-200 font-medium">{advice.summary}</div>
                        <div className="text-emerald-200">{advice.economyHealth}</div>
                        {advice.bestPurchase && (
                          <div className="bg-amber-500/20 border border-amber-500/40 rounded px-2 py-1 text-amber-200">
                            💡 بخر: <b>{advice.bestPurchase.item}</b> — {advice.bestPurchase.reason}
                          </div>
                        )}
                        {advice.recommendations.slice(0, 5).map((r, i) => (
                          <div key={i} className="text-slate-300 bg-slate-800/50 rounded px-2 py-1">{r}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* تب خرید */}
                  {tab === "buy" && selectedId === myTribe.id && (
                    <div className="space-y-3">
                      <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1">
                        {(["missile", "defense", "jet"] as const).map((c) => (
                          <button key={c} onClick={() => setBuyCategory(c)}
                            className={`flex-1 text-xs py-1.5 rounded-md ${
                              buyCategory === c ? "bg-slate-700 text-amber-300 font-bold" : "text-slate-400"
                            }`}>
                            {c === "missile" && "🚀 موشک"}
                            {c === "defense" && "🛡 پدافند"}
                            {c === "jet" && "✈ جنگنده"}
                          </button>
                        ))}
                      </div>

                      {/* سرباز */}
                      <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-2">
                        <div className="text-sm">👥 سرباز <span className="text-xs text-slate-400">({SOLDIER_PRICE}💎)</span></div>
                        <div className="flex gap-1">
                          {[1, 5, 10].map((q) => (
                            <button key={q} disabled={isBusy || myTribe.coins < SOLDIER_PRICE * q || myTribe.soldiers + q > MAX_SOLDIERS}
                              onClick={() => buySoldier(q)}
                              className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs px-2 py-1 rounded">
                              +{q}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* لیست تسلیحات */}
                      <div className="space-y-1 max-h-96 overflow-y-auto">
                        {(buyCategory === "missile" ? MISSILES : buyCategory === "defense" ? DEFENSES : JETS)
                          .sort((a, b) => a.tier - b.tier || a.price - b.price)
                          .map((u: UnitDef) => {
                            const owned = ((buyCategory === "missile" ? myTribe.missilesInventory : buyCategory === "defense" ? myTribe.defensesInventory : myTribe.jetsInventory) as UnitInv)?.[u.id] ?? 0;
                            return (
                              <div key={u.id} className="bg-slate-800/40 rounded-lg p-2 text-xs">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="font-bold text-slate-200">
                                      {u.emoji} {u.name} {u.origin}
                                      <span className="text-[9px] mr-2 bg-slate-700 rounded px-1 py-0.5 text-amber-300">Tier {u.tier}</span>
                                      {owned > 0 && <span className="text-emerald-300 mr-2">×{owned}</span>}
                                    </div>
                                    <div className="text-slate-400 text-[10px]">{u.description}</div>
                                    <div className="text-slate-300 mt-1 flex gap-2 text-[10px]">
                                      {u.attackPower > 0 && <span>⚔ {u.attackPower}</span>}
                                      {u.defensePower > 0 && <span>🛡 {u.defensePower}</span>}
                                      {u.interceptChance > 0 && <span>🎯 {(u.interceptChance * 100).toFixed(0)}٪ ره‌گیری</span>}
                                    </div>
                                  </div>
                                  <div className="text-right ml-2">
                                    <div className="text-amber-300 font-bold">{u.price}💎</div>
                                    <button disabled={isBusy || myTribe.coins < u.price}
                                      onClick={() => buyUnit(u.id, 1)}
                                      className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-[10px] px-2 py-1 rounded mt-1">
                                      خرید
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                  {tab === "buy" && selectedId !== myTribe.id && (
                    <div className="text-xs text-slate-400 text-center py-3">
                      برای خرید، اول قبیله خودت رو انتخاب کن (
                      <button onClick={() => setSelectedId(myTribe.id)} className="text-amber-300 underline">اینجا</button>)
                    </div>
                  )}

                  {/* تب کارخانه‌ها */}
                  {tab === "factories" && (
                    <div className="space-y-3">
                      <div className="text-xs text-slate-400">🏭 کارخانه‌های شما (درآمد کل: <b className="text-emerald-300">+{myTribe.income}/تیک</b>):</div>
                      {myTribe.factories.length === 0 && <div className="text-xs text-slate-500 text-center py-2">هنوز کارخانه‌ای نداری</div>}
                      {myTribe.factories.map((f, idx) => {
                        const def = FACTORY_BY_ID[f.id];
                        if (!def) return null;
                        const upCost = upgradeCost(def.price, f.level);
                        const needRepair = 100 - f.health;
                        return (
                          <div key={idx} className="bg-slate-800/50 rounded-lg p-2 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold">{def.emoji} {def.name} <span className="text-amber-300">لول {f.level}</span></span>
                              <span className={f.health > 70 ? "text-emerald-300" : f.health > 40 ? "text-yellow-300" : "text-red-300"}>
                                ❤️ {f.health}٪
                              </span>
                            </div>
                            <div className="text-slate-400 text-[10px]">درآمد فعلی: {Math.floor(def.incomePerTick * f.level * f.health / 100)}/تیک</div>
                            <div className="flex gap-1">
                              {f.level < def.maxLevel && (
                                <button disabled={isBusy || myTribe.coins < upCost}
                                  onClick={() => factoryAction("factory_upgrade", def.id)}
                                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-[10px] py-1 rounded">
                                  ⬆ ارتقا ({upCost}💎)
                                </button>
                              )}
                              {needRepair > 0 && (
                                <button disabled={isBusy || myTribe.coins < needRepair * REPAIR_COST_PER_PERCENT}
                                  onClick={() => factoryAction("factory_repair", def.id, needRepair)}
                                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white text-[10px] py-1 rounded">
                                  🔧 بازسازی ({needRepair * REPAIR_COST_PER_PERCENT}💎)
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div className="border-t border-slate-700 pt-3">
                        <div className="text-xs text-slate-400 mb-2">🏗 ساخت کارخانه جدید:</div>
                        {FACTORIES.map((def) => (
                          <div key={def.id} className="bg-slate-800/40 rounded-lg p-2 mb-1 text-xs flex items-center justify-between">
                            <div>
                              <div className="font-bold">{def.emoji} {def.name}</div>
                              <div className="text-slate-400 text-[10px]">{def.description} · +{def.incomePerTick}💎/تیک</div>
                            </div>
                            <button disabled={isBusy || myTribe.coins < def.price}
                              onClick={() => factoryAction("factory_build", def.id)}
                              className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white text-[10px] px-2 py-1 rounded">
                              {def.price}💎
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* تب حمله */}
                  {tab === "attack" && (
                    <div className="space-y-3">
                      <div className="text-xs text-slate-400">متحدان برای حمله مشترک:</div>
                      <div className="flex flex-wrap gap-1">
                        {myAllies.length === 0 && <span className="text-xs text-slate-500">متحد نداری</span>}
                        {myAllies.map((a) => (
                          <button key={a.id}
                            onClick={() => setAlliesForAttack((p) => p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id])}
                            className={`text-xs px-2 py-1 rounded border ${
                              alliesForAttack.includes(a.id) ? "bg-amber-500 text-slate-900 border-amber-500" : "bg-slate-800 border-slate-600 text-slate-300"
                            }`}>{a.name}</button>
                        ))}
                      </div>

                      <div className="text-xs text-slate-400">هدف:</div>
                      <select value={targetId ?? ""} onChange={(e) => setTargetId(Number(e.target.value) || null)}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg p-2 text-sm">
                        <option value="">-- انتخاب --</option>
                        {state.tribes.filter((t) => t.id !== myTribe.id && t.isAlive && !isAllied(myTribe.id, t.id))
                          .map((t) => <option key={t.id} value={t.id}>{t.name} ({t.territoryPct}٪ · دفاع {t.defensePower})</option>)}
                      </select>

                      {target && (
                        <div className="bg-slate-800/50 rounded-lg p-3 text-xs space-y-1">
                          <div className="text-red-300 font-bold">🎯 {target.name}</div>
                          <div>👥 {target.soldiers} · 🚀 {invTotal(target.missilesInventory)} · 🛡 {invTotal(target.defensesInventory)} · ✈ {invTotal(target.jetsInventory)}</div>
                          <div className="text-blue-300">قدرت دفاع: <b>{target.defensePower}</b></div>
                          <div className="text-orange-300">قدرت تهاجم: <b>{target.attackPower}</b></div>
                        </div>
                      )}

                      <div className="space-y-1">
                        <label className="text-xs text-slate-400">👥 سرباز ({useSoldiers}/{totalSoldiers})</label>
                        <input type="range" min="0" max={totalSoldiers} value={useSoldiers}
                          onChange={(e) => setUseSoldiers(Number(e.target.value))} className="w-full accent-amber-500" />

                        <label className="text-xs text-slate-400">🚀 موشک ({useMissileTotal}/{totalMissiles})</label>
                        <input type="range" min="0" max={totalMissiles} value={useMissileTotal}
                          onChange={(e) => setUseMissileTotal(Number(e.target.value))} className="w-full accent-amber-500" />

                        <label className="text-xs text-slate-400">✈ جنگنده ({useJetTotal}/{totalJets})</label>
                        <input type="range" min="0" max={totalJets} value={useJetTotal}
                          onChange={(e) => setUseJetTotal(Number(e.target.value))} className="w-full accent-amber-500" />
                      </div>

                      <div className="bg-slate-800/50 rounded-lg p-2 text-xs">
                        قدرت تخمینی: <b className="text-orange-300">{projectedPower}</b>
                        {target && (
                          <div className="mt-1">
                            نسبت:{" "}
                            <b className={
                              projectedPower > target.defensePower * 1.15 ? "text-emerald-400"
                                : projectedPower < target.defensePower * 0.85 ? "text-red-400" : "text-yellow-400"
                            }>
                              {target.defensePower > 0 ? (projectedPower / target.defensePower).toFixed(2) : "∞"}
                            </b>
                            {" — "}
                            <span className="text-slate-400">
                              {projectedPower > target.defensePower * 1.15 ? "پیروزی محتمل" :
                                projectedPower < target.defensePower * 0.85 ? "شکست محتمل" : "تساوی محتمل"}
                            </span>
                          </div>
                        )}
                      </div>

                      <button onClick={attack} disabled={isBusy || !target || projectedPower === 0}
                        className="w-full bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-2 rounded-lg">
                        ⚔️ شلیک!
                      </button>
                    </div>
                  )}

                  {/* اتحاد */}
                  {tab === "alliance" && (
                    <div className="space-y-3">
                      {/* درخواست‌های ورودی — نیاز به تأیید صریح شما دارن */}
                      {incomingRequests.length > 0 && (
                        <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg p-2 space-y-1">
                          <div className="text-xs font-bold text-amber-300">📨 درخواست‌های اتحاد دریافتی</div>
                          {incomingRequests.map((r) => (
                            <div key={r.id} className="flex justify-between items-center bg-slate-800/50 rounded p-2 text-sm">
                              <span>{r.fromTribeName}</span>
                              <div className="flex gap-1">
                                <button onClick={() => respondToRequest(r.id, true)} disabled={isBusy} className="text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-2 py-1 rounded">قبول</button>
                                <button onClick={() => respondToRequest(r.id, false)} disabled={isBusy} className="text-xs bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-2 py-1 rounded">رد</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* درخواست‌های خروجی — در انتظار تأیید طرف مقابل */}
                      {outgoingRequests.length > 0 && (
                        <div className="bg-blue-500/10 border border-blue-500/40 rounded-lg p-2 space-y-1">
                          <div className="text-xs font-bold text-blue-300">📤 درخواست‌های ارسالی (در انتظار پاسخ)</div>
                          {outgoingRequests.map((r) => (
                            <div key={r.id} className="flex justify-between items-center bg-slate-800/50 rounded p-2 text-sm">
                              <span>{r.toTribeName}</span>
                              <button onClick={() => cancelRequest(r.id)} disabled={isBusy} className="text-xs bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white px-2 py-1 rounded">لغو</button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="text-xs text-slate-400">متحدان کنونی:</div>
                      {myAllies.length === 0 && <div className="text-xs text-slate-500">متحد نداری</div>}
                      {myAllies.map((a) => (
                        <div key={a.id} className="flex justify-between items-center bg-slate-800/50 rounded p-2 text-sm">
                          <span>🤝 {a.name}</span>
                          <button onClick={() => breakAlly(a.id)} disabled={isBusy} className="text-xs bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-2 py-1 rounded">شکستن</button>
                        </div>
                      ))}
                      <div className="text-xs text-slate-400 mt-3">قبایل برای اتحاد (فقط قبایلی که مالک دارند می‌توانند تأیید کنند):</div>
                      <div className="max-h-64 overflow-y-auto space-y-1">
                        {state.tribes
                          .filter((t) => t.id !== myTribe.id && t.isAlive && !isAllied(myTribe.id, t.id) && t.owner)
                          .map((t) => {
                            const alreadySent = outgoingRequests.some((r) => r.toTribeId === t.id);
                            return (
                              <div key={t.id} className="flex justify-between items-center bg-slate-800/30 rounded p-2 text-sm">
                                <span>{t.name} <span className="text-xs text-slate-500">{t.owner?.avatar}</span></span>
                                {alreadySent ? (
                                  <span className="text-xs text-slate-500">در انتظار پاسخ...</span>
                                ) : (
                                  <button onClick={() => propose(t.id)} disabled={isBusy} className="text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-2 py-1 rounded">درخواست اتحاد</button>
                                )}
                              </div>
                            );
                          })}
                        {state.tribes.filter((t) => t.id !== myTribe.id && t.isAlive && !isAllied(myTribe.id, t.id) && t.owner).length === 0 && (
                          <div className="text-xs text-slate-500 text-center py-2">
                            هیچ قبیله‌ای با مالک انسانی برای اتحاد وجود نداره (قبایل بدون مالک نمی‌تونن تأیید کنن)
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* لاگ */}
                  {tab === "logs" && (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {state.logs.length === 0 && <div className="text-xs text-slate-500 text-center py-4">هنوز نبردی رخ نداده</div>}
                      {state.logs.map((log) => (
                        <div key={log.id} className={`text-xs rounded p-2 border ${
                          log.result === "win" ? "bg-emerald-500/10 border-emerald-500/50"
                            : log.result === "lose" ? "bg-red-500/10 border-red-500/50" : "bg-yellow-500/10 border-yellow-500/50"
                        }`}>
                          <div className="font-bold">{log.attackerName} → {log.defenderName}</div>
                          <div className="text-slate-400 mt-1">
                            ⚔ {log.attackPower} vs 🛡 {log.defensePower} ·{" "}
                            {log.result === "win" ? `✅ ${log.metersTaken}m (${log.areaTakenKm2.toFixed(3)}km²)`
                              : log.result === "lose" ? "❌ شکست" : "🟰 تساوی"}
                            {log.interceptedMissiles > 0 && <span className="text-blue-300"> · {log.interceptedMissiles}🚀 ره‌گیری</span>}
                          </div>
                          {log.narrative && <div className="text-slate-300 mt-1 text-[11px] italic">{log.narrative}</div>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* بیانیه */}
                  {tab === "news" && (
                    <div className="space-y-3">
                      <div className="text-xs text-slate-400">📣 صدور بیانیه به همه بازیکنان سرور:</div>
                      <textarea value={broadcastMsg} onChange={(e) => setBroadcastMsg(e.target.value)}
                        rows={3} maxLength={500} placeholder="پیام خود را بنویسید..."
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg p-2 text-sm resize-none" />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">{broadcastMsg.length}/500</span>
                        <button onClick={sendBroadcast} disabled={isBusy || !broadcastMsg.trim()}
                          className="bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 text-slate-900 font-bold text-xs px-4 py-1.5 rounded-lg">
                          📢 صدور بیانیه
                        </button>
                      </div>

                      <div className="border-t border-slate-700 pt-3">
                        <div className="text-xs text-slate-400 mb-2">تاریخچه بیانیه‌ها:</div>
                        <div className="max-h-64 overflow-y-auto space-y-1">
                          {state.proclamations.map((p) => (
                            <div key={p.id} className="bg-slate-800/50 border-r-4 rounded p-2 text-xs" style={{ borderRightColor: p.tribeColor }}>
                              <div className="font-bold" style={{ color: p.tribeColor }}>
                                {p.authorAvatar} {p.authorName} ({p.tribeName})
                              </div>
                              <div className="text-slate-200 mt-1">{p.message}</div>
                              <div className="text-slate-500 text-[9px] mt-1">{new Date(p.createdAt).toLocaleString("fa-IR")}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </aside>
      </div>

      {/* دیالوگ تأیید انتخاب قبیله از روی نقشه */}
      {pendingTribeId !== null && (() => {
        const t = state.tribes.find((x) => x.id === pendingTribeId);
        if (!t) return null;
        const canClaim = !t.owner && t.isAlive && !myTribe;
        const isMine = t.ownerId === user.id;
        return (
          <div
            className="fixed inset-0 z-[10000] grid place-items-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setPendingTribeId(null)}
          >
            <div
              className="bg-slate-900 border-2 rounded-2xl p-6 w-full max-w-md shadow-2xl"
              style={{ borderColor: t.color }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-4">
                <div
                  className="inline-block w-16 h-16 rounded-full mb-2"
                  style={{ background: t.color, boxShadow: `0 0 30px ${t.color}` }}
                />
                <h2 className="text-2xl font-bold" style={{ color: t.color }}>{t.name}</h2>
                <p className="text-sm text-slate-400 mt-1">📍 {t.district}</p>
                <p className="text-xs text-slate-500 mt-1">
                  مالک: {t.owner ? `${t.owner.avatar} ${t.owner.displayName}` : "🆓 آزاد"}
                </p>
              </div>

              {/* پیش‌نمایش سریع */}
              <div className="grid grid-cols-2 gap-2 mb-4 text-sm bg-slate-800/60 rounded-lg p-3">
                <div>💎 <b className="text-amber-300">{t.coins}</b> هیلزکوین</div>
                <div>📈 <b className="text-emerald-300">+{t.income}/تیک</b></div>
                <div>🗺 <b>{t.territoryPct}٪</b> خاک</div>
                <div>📐 <b>{t.areaKm2.toFixed(2)}km²</b></div>
                <div>👥 <b>{t.soldiers}</b> سرباز</div>
                <div>🏭 <b>{t.factories.length}</b> کارخانه</div>
                <div>⚔ <b className="text-orange-300">{t.attackPower}</b></div>
                <div>🛡 <b className="text-blue-300">{t.defensePower}</b></div>
              </div>

              {/* سوال اصلی */}
              <div className="text-center mb-4">
                {canClaim ? (
                  <div>
                    <p className="text-amber-300 font-bold text-lg mb-1">
                      🎯 این قبیله رو به‌عنوان قبیله خودت انتخاب می‌کنی؟
                    </p>
                    <p className="text-xs text-slate-400">
                      اگه بله بزنی، رهبرش می‌شی و می‌تونی سرباز، موشک، جنگنده و پدافند بخری، کارخانه بسازی و به قبایل دیگه حمله کنی.
                    </p>
                  </div>
                ) : isMine ? (
                  <p className="text-emerald-300 font-bold">✓ این قبیله شماست</p>
                ) : t.owner ? (
                  <p className="text-slate-300">
                    این قبیله متعلق به بازیکن دیگه‌ایه ({t.owner.displayName})
                  </p>
                ) : !t.isAlive ? (
                  <p className="text-red-300">این قبیله نابود شده 💀</p>
                ) : myTribe ? (
                  <p className="text-slate-300">
                    تو قبلاً قبیله «{myTribe.name}» رو داری. اگه می‌خوای عوضش کنی، اول از داخل بازی «رها کردن قبیله» رو بزن.
                  </p>
                ) : null}
              </div>

              {/* دکمه‌ها */}
              <div className="grid grid-cols-2 gap-3">
                {canClaim ? (
                  <>
                    <button
                      onClick={() => {
                        // فوراً دیالوگ رو ببند و claim رو پس‌زمینه اجرا کن
                        setPendingTribeId(null);
                        claim(t.id);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg text-lg"
                    >
                      ✅ بله، بگیر
                    </button>
                    <button
                      onClick={() => setPendingTribeId(null)}
                      className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-lg text-lg"
                    >
                      ❌ نه، رد شو
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setSelectedId(t.id);
                        setPendingTribeId(null);
                      }}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold py-3 rounded-lg"
                    >
                      👁 نمایش اطلاعات
                    </button>
                    <button
                      onClick={() => setPendingTribeId(null)}
                      className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-lg"
                    >
                      ❌ بستن
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
