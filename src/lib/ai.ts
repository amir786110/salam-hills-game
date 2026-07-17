// هوش مصنوعی پیشرفته
// - قبایل بدون مالک انسانی توسط AI بازی می‌شن
// - AI شخصیت داره و بر اساس آن استراتژی چند مرحله‌ای می‌سازه
// - مرحله‌ها: خرید هوشمند تسلیحات → ساخت/ارتقا/بازسازی کارخانه → اتحاد → حمله

import { db } from "@/db";
import { tribes, alliances } from "@/db/schema";
import { eq, and, or } from "drizzle-orm";
import {
  buy, performAttack, sendAllianceRequest, getPendingRequestsFor, respondAllianceRequest,
  calcAttackTotalPower, calcDefensePower, territoryPercent,
  invCount, factoryIncomePerTick,
} from "./game-logic";
import {
  JETS, MISSILES, DEFENSES, UNIT_BY_ID, FACTORY_BY_ID, FACTORIES,
  MAX_SOLDIERS, SOLDIER_PRICE, REPAIR_COST_PER_PERCENT, upgradeCost,
  type UnitDef, type FactoryInstance,
} from "./units-catalog";
import type { Tribe, UnitInventory } from "@/db/schema";
import { haversineMeters } from "./geo";

type Personality = "aggressive" | "defensive" | "balanced" | "sneaky" | "economist";

const PERSONALITY_MAP: Record<string, Personality> = {
  "سلم تجریش": "aggressive",
  "سلام صدر": "economist",
  "سلام اسلام": "balanced",
  "سلام البرز": "defensive",
  "سلام فرمانیه": "aggressive",
  "سلام دیباجی": "sneaky",
  "سلام زین الدین": "economist",
  "سلام یوسف اباد": "sneaky",
  "سلام همت": "aggressive",
  "سلام ندای اندیشه": "defensive",
  "سلام صادقیه": "aggressive",
  "سلام ونک": "economist",
  "سلام گلبانگ": "sneaky",
  "سلام سلیمه": "defensive",
  "سلام ایران زمین": "balanced",
};

function personalityOf(t: Tribe): Personality {
  return PERSONALITY_MAP[t.name] ?? "balanced";
}

async function isAllied(a: number, b: number): Promise<boolean> {
  const rows = await db.select().from(alliances).where(
    or(and(eq(alliances.tribeAId, a), eq(alliances.tribeBId, b)),
       and(eq(alliances.tribeAId, b), eq(alliances.tribeBId, a)))
  );
  return rows.length > 0;
}

// ============ فاز اقتصاد ============
async function aiEconomyPhase(bot: Tribe, personality: Personality, actions: string[]) {
  const [fresh] = await db.select().from(tribes).where(eq(tribes.id, bot.id));
  if (!fresh) return;

  // اکونومیست‌ها بیشترین سرمایه رو خرج اقتصاد می‌کنن
  const econBudgetRatio =
    personality === "economist" ? 0.5 :
    personality === "aggressive" ? 0.15 :
    personality === "defensive" ? 0.3 : 0.25;

  const budget = Math.floor(fresh.coins * econBudgetRatio);
  let spent = 0;
  const factories = [...((fresh.factories as FactoryInstance[]) ?? [])];

  // ۱) بازسازی کارخانه‌های آسیب‌دیده
  for (const f of factories) {
    if (f.health >= 80) continue;
    const need = 100 - f.health;
    const affordable = Math.floor((budget - spent) / REPAIR_COST_PER_PERCENT);
    const repair = Math.min(need, affordable);
    if (repair > 0) {
      try {
        await buy(bot.id, { kind: "factory_repair", factoryId: f.id, percent: repair });
        spent += repair * REPAIR_COST_PER_PERCENT;
        actions.push(`🔧 بازسازی ${FACTORY_BY_ID[f.id]?.emoji ?? "🏭"} ${repair}٪`);
      } catch { /* ignore */ }
    }
  }

  // ۲) ساخت کارخانه جدید اگه از هر نوع کمتر از یکی داره
  for (const def of FACTORIES) {
    if (spent >= budget) break;
    const has = factories.filter((f) => f.id === def.id).length;
    if (has >= 2) continue; // حداکثر ۲ از هر نوع
    if (def.price > (budget - spent)) continue;
    try {
      await buy(bot.id, { kind: "factory_build", factoryId: def.id });
      spent += def.price;
      actions.push(`🏗 ساخت ${def.emoji} ${def.name}`);
    } catch { /* ignore */ }
  }

  // ۳) ارتقا کارخانه‌های موجود
  for (const f of factories) {
    if (spent >= budget) break;
    const def = FACTORY_BY_ID[f.id];
    if (!def || f.level >= def.maxLevel) continue;
    const cost = upgradeCost(def.price, f.level);
    if (cost > (budget - spent)) continue;
    try {
      await buy(bot.id, { kind: "factory_upgrade", factoryId: f.id });
      spent += cost;
      actions.push(`⬆️ ارتقا ${def.emoji} به لول ${f.level + 1}`);
    } catch { /* ignore */ }
  }
}

// ============ فاز خرید تسلیحات ============
async function aiMilitaryPhase(bot: Tribe, personality: Personality, actions: string[]) {
  const [fresh] = await db.select().from(tribes).where(eq(tribes.id, bot.id));
  if (!fresh) return;

  // بودجه نظامی
  const milBudgetRatio =
    personality === "aggressive" ? 0.75 :
    personality === "defensive" ? 0.6 :
    personality === "sneaky" ? 0.65 :
    personality === "economist" ? 0.3 : 0.55;
  const budget = Math.floor(fresh.coins * milBudgetRatio);
  let spent = 0;

  // اولویت خرید بر اساس شخصیت
  const priorities: Array<"missile" | "defense" | "jet" | "soldier"> =
    personality === "aggressive" ? ["missile", "jet", "soldier", "defense"] :
    personality === "defensive"  ? ["defense", "soldier", "missile", "jet"] :
    personality === "sneaky"     ? ["jet", "missile", "defense", "soldier"] :
    personality === "economist"  ? ["defense", "soldier", "missile", "jet"] :
                                    ["soldier", "defense", "missile", "jet"];

  // انتخاب بهترین مدل قابل خرید در هر دسته (بر اساس بودجه، ترجیحاً tier بالا)
  for (const cat of priorities) {
    if (spent >= budget) break;

    if (cat === "soldier") {
      const currentSoldiers = fresh.soldiers;
      if (currentSoldiers >= MAX_SOLDIERS) continue;
      const maxQty = Math.min(MAX_SOLDIERS - currentSoldiers, Math.floor((budget - spent) / SOLDIER_PRICE));
      if (maxQty <= 0) continue;
      const qty = Math.max(1, Math.floor(maxQty * (0.4 + Math.random() * 0.4)));
      try {
        await buy(bot.id, { kind: "soldier", quantity: qty });
        spent += qty * SOLDIER_PRICE;
        actions.push(`👥 +${qty} سرباز`);
      } catch { /* ignore */ }
      continue;
    }

    // انتخاب یکی از مدل‌ها — ترجیح tier بالا اگه ممکنه، در غیر این صورت پایین‌تر
    const catalog: UnitDef[] = cat === "missile" ? MISSILES : cat === "defense" ? DEFENSES : JETS;
    // سعی می‌کنیم tier بالا بخریم؛ اگر نتونستیم tier پایین
    const sortedByPref = [...catalog].sort((a, b) => {
      if (personality === "economist") {
        // بازده = قدرت به قیمت
        const pa = (a.attackPower + a.defensePower) / a.price;
        const pb = (b.attackPower + b.defensePower) / b.price;
        return pb - pa;
      }
      return b.tier - a.tier;
    });
    // ۱ یا ۲ تا از قوی‌ترین که می‌تونیم بخریم
    for (const u of sortedByPref) {
      const remaining = budget - spent;
      if (remaining < u.price) continue;
      const qty = Math.min(3, Math.max(1, Math.floor(remaining / (u.price * 2))));
      try {
        await buy(bot.id, { kind: "unit", unitId: u.id, quantity: qty });
        spent += u.price * qty;
        actions.push(`${u.emoji} +${qty}× ${u.name}`);
        break;
      } catch { /* ignore */ }
    }
  }
}

// ============ فاز حمله ============
async function pickTarget(me: Tribe, all: Tribe[], personality: Personality): Promise<Tribe | null> {
  const candidates: Array<{ tribe: Tribe; score: number }> = [];
  for (const t of all) {
    if (t.id === me.id || !t.isAlive || t.serverId !== me.serverId) continue;
    if (await isAllied(me.id, t.id)) continue;
    const defPower = calcDefensePower(t);
    const myAtk = calcAttackTotalPower(me);
    if (myAtk < 30) continue;

    const dist = haversineMeters([me.lng, me.lat], [t.lng, t.lat]);
    const proximity = Math.max(0.1, 1 - dist / 15000);
    const tPct = territoryPercent(t);
    const factoriesWorth = ((t.factories as FactoryInstance[]) ?? []).length * 50;

    let score = tPct * 2 + proximity * 100 - defPower * 0.35 + factoriesWorth;
    if (personality === "sneaky") score += Math.max(0, 300 - defPower);
    if (personality === "aggressive") score += tPct * 0.5;
    if (personality === "economist") score += factoriesWorth * 2;
    if (t.ownerId) score += 60; // اولویت انسان
    // اگر خیلی قوی‌تره، رد کن
    if (myAtk < defPower * 0.9 && personality !== "aggressive") score -= 200;

    candidates.push({ tribe: t, score });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, Math.min(3, candidates.length));
  return top[Math.floor(Math.random() * top.length)].tribe;
}

function planCommitment(me: Tribe, target: Tribe, personality: Personality) {
  const defPower = calcDefensePower(target);
  const commitRatio =
    personality === "aggressive" ? 0.9 :
    personality === "sneaky" ? 0.75 :
    personality === "defensive" ? 0.45 :
    personality === "economist" ? 0.5 : 0.65;
  // هدف قدرت = defense * 1.4
  const targetPower = defPower * 1.4;

  const myMissileTotal = invCount(me.missilesInventory as UnitInventory);
  const myJetTotal = invCount(me.jetsInventory as UnitInventory);

  // شبیه‌سازی: چند تا موشک/جنگنده/سرباز کافیه؟
  // به ترتیب کم‌هزینه‌ترین بازده: موشک > جنگنده > سرباز
  // اما محدود به موجودی و commit
  let remaining = targetPower;

  // موشک‌های قوی‌تر رو انتخاب کن — تخمینی: میانگین قدرت موشک‌های موجود
  const avgMi = avgAttackPower(me.missilesInventory as UnitInventory, MISSILES);
  const maxMi = Math.floor(myMissileTotal * commitRatio);
  let useMi = 0;
  if (avgMi > 0) useMi = Math.min(maxMi, Math.ceil(remaining / avgMi));
  remaining -= useMi * avgMi;

  const avgJt = avgAttackPower(me.jetsInventory as UnitInventory, JETS);
  const maxJt = Math.floor(myJetTotal * commitRatio);
  let useJt = 0;
  if (remaining > 0 && avgJt > 0) useJt = Math.min(maxJt, Math.ceil(remaining / avgJt));
  remaining -= useJt * avgJt;

  const maxSol = Math.floor(me.soldiers * commitRatio);
  let useSol = remaining > 0 ? Math.min(maxSol, Math.ceil(remaining)) : Math.floor(me.soldiers * 0.15);
  useSol = Math.max(0, Math.min(useSol, me.soldiers));

  if (useSol + useMi + useJt === 0) return null;
  return { useSoldiers: useSol, useMissileTotal: useMi, useJetTotal: useJt };
}

function avgAttackPower(inv: UnitInventory, catalog: UnitDef[]): number {
  let sumP = 0, sumC = 0;
  for (const [id, c] of Object.entries(inv)) {
    const u = UNIT_BY_ID[id] ?? catalog.find((x) => x.id === id);
    if (!u) continue;
    sumP += u.attackPower * (c || 0);
    sumC += (c || 0);
  }
  return sumC > 0 ? sumP / sumC : 0;
}

// ============ فاز دیپلماسی ============
async function aiDiplomacyPhase(bot: Tribe, all: Tribe[], personality: Personality, actions: string[]) {
  // ۱) اول به درخواست‌های اتحاد ورودی پاسخ بده (رفع باگ: قبلاً اتحاد یک‌طرفه بود،
  // حالا AI باید صریحاً قبول/رد کنه)
  try {
    const incoming = await getPendingRequestsFor(bot.id);
    for (const req of incoming) {
      // شخصیت‌های تهاجمی معمولاً رد می‌کنن، بقیه بر اساس شانس قبول می‌کنن
      const acceptChance =
        personality === "aggressive" ? 0.1 :
        personality === "defensive" ? 0.7 :
        personality === "economist" ? 0.6 :
        personality === "sneaky" ? 0.4 : 0.5;
      const accept = Math.random() < acceptChance;
      await respondAllianceRequest(req.id, bot.id, accept);
      if (accept) actions.push(`🤝 اتحاد با قبیله شماره ${req.fromTribeId} رو قبول کرد`);
    }
  } catch { /* ignore */ }

  if (personality === "aggressive") return; // تهاجمی‌ها اتحاد پیشنهاد نمی‌دن
  if (Math.random() > 0.18) return;
  // فقط با قبایلی که مالک دارن (تا بتونن رضایت بدن) پیشنهاد اتحاد بده
  const potential = all.filter(
    (t) => t.id !== bot.id && t.isAlive && t.serverId === bot.serverId && t.ownerId
  );
  for (const other of potential) {
    if (Math.random() > 0.35) continue;
    if (await isAllied(bot.id, other.id)) continue;
    try {
      const res = await sendAllianceRequest(bot.serverId, bot.id, other.id);
      actions.push(res.autoAccepted ? `🤝 اتحاد با ${other.name} برقرار شد` : `📨 درخواست اتحاد به ${other.name} فرستاد`);
      break;
    } catch { /* ignore */ }
  }
}

// ============ نوبت کامل AI برای یک قبیله ============
export async function runAiTurn(tribe: Tribe, allTribes: Tribe[]): Promise<string | null> {
  if (!tribe.isAlive) return null;
  // AI فقط برای قبایلی اجرا می‌شه که مالک انسانی دارن و صاحبش AI رو روشن گذاشته
  // قبایل بدون مالک هیچ کاری نمی‌کنن — منتظر می‌مانن بازیکن بیاد بگیره
  if (!tribe.ownerId) return null;
  if (!tribe.aiEnabled) return null;

  const personality = personalityOf(tribe);
  const actions: string[] = [];

  // ۱) اقتصاد
  await aiEconomyPhase(tribe, personality, actions);
  // ۲) نظامی
  await aiMilitaryPhase(tribe, personality, actions);
  // ۳) دیپلماسی
  await aiDiplomacyPhase(tribe, allTribes, personality, actions);

  // ۴) حمله
  const [refreshed] = await db.select().from(tribes).where(eq(tribes.id, tribe.id));
  if (!refreshed || !refreshed.isAlive) return actions.length ? `${tribe.name}: ${actions.join(" · ")}` : null;

  const attackChance =
    personality === "aggressive" ? 0.7 :
    personality === "sneaky" ? 0.5 :
    personality === "defensive" ? 0.18 :
    personality === "economist" ? 0.25 : 0.4;

  if (Math.random() < attackChance) {
    const target = await pickTarget(refreshed, allTribes, personality);
    if (target) {
      const plan = planCommitment(refreshed, target, personality);
      if (plan) {
        try {
          const res = await performAttack({
            attackerIds: [refreshed.id],
            defenderId: target.id,
            useSoldiers: plan.useSoldiers,
            useMissileTotal: plan.useMissileTotal,
            useJetTotal: plan.useJetTotal,
          });
          actions.push(
            `⚔️ حمله به ${target.name}: ${
              res.result === "win" ? `🏆 ${res.metersTaken}m` :
              res.result === "lose" ? "💥 شکست" : "🟰 تساوی"
            }${res.interceptedMissiles > 0 ? ` (${res.interceptedMissiles}🚀 ره‌گیری)` : ""}${res.capturedFactories.length > 0 ? ` +${res.capturedFactories.length}🏭` : ""}`
          );
        } catch { /* ignore */ }
      }
    }
  }

  return actions.length ? `${tribe.name} [${personality}]: ${actions.join(" · ")}` : null;
}

export async function runAllAiForServer(serverId: number) {
  const all = await db.select().from(tribes).where(eq(tribes.serverId, serverId));
  const logs: string[] = [];
  for (const t of all) {
    // فقط قبایلی با مالک انسانی و aiEnabled=true
    if (!t.ownerId || !t.aiEnabled) continue;
    try {
      const l = await runAiTurn(t, all);
      if (l) logs.push(l);
    } catch (e) {
      logs.push(`${t.name}: ❌ ${e instanceof Error ? e.message : e}`);
    }
  }
  return logs;
}

// ============ دستیار استراتژی برای بازیکن ============
export interface StrategyAdvice {
  summary: string;
  recommendations: string[];
  bestTarget?: { name: string; districtLandmark: string; expectedResult: string };
  bestPurchase?: { item: string; reason: string };
  economyHealth: string;
}

export async function generateStrategyAdvice(myTribe: Tribe, allTribes: Tribe[]): Promise<StrategyAdvice> {
  const recs: string[] = [];
  const myAtk = calcAttackTotalPower(myTribe);
  const myDef = calcDefensePower(myTribe);
  const pct = territoryPercent(myTribe);
  const factories = (myTribe.factories as FactoryInstance[]) ?? [];
  const income = factoryIncomePerTick(factories);

  const enemies = allTribes.filter((t) => t.id !== myTribe.id && t.isAlive && t.serverId === myTribe.serverId);
  const avgEnemyDefense = enemies.reduce((s, t) => s + calcDefensePower(t), 0) / Math.max(1, enemies.length);
  const avgEnemyAttack = enemies.reduce((s, t) => s + calcAttackTotalPower(t), 0) / Math.max(1, enemies.length);

  // اقتصاد
  const economyHealth =
    income >= 80 ? "🟢 اقتصاد قوی — درآمد بالا داری" :
    income >= 30 ? "🟡 اقتصاد متوسط — چند کارخانه دیگه بساز" :
                   "🔴 اقتصاد ضعیف — فوراً کارخونه بساز";

  if (income < 30) recs.push(`🏭 کارخونه کم داری (درآمد ${income}/تیک). "کارخانه کتاب کار سلام" یا "پالایشگاه نفت" بساز.`);
  const damagedFactories = factories.filter((f) => f.health < 70);
  if (damagedFactories.length > 0) {
    recs.push(`🔧 ${damagedFactories.length} کارخونه آسیب‌دیده داری. سلامت کارخانه پایین یعنی درآمد کمتر — بازسازی کن.`);
  }

  // نظامی
  if (myTribe.soldiers < 30) recs.push(`👥 سرباز کم داری (${myTribe.soldiers}). حداقل تا ۵۰ برسون.`);
  if (myDef < avgEnemyAttack * 0.7) recs.push(`🛡 پدافند ضعیفه (${myDef}). دشمنا میانگین ${Math.round(avgEnemyAttack)} قدرت تهاجمی دارن!`);

  const totalMi = invCount(myTribe.missilesInventory as UnitInventory);
  const totalJt = invCount(myTribe.jetsInventory as UnitInventory);
  const totalDf = invCount(myTribe.defensesInventory as UnitInventory);

  // پیشنهاد خرید هوشمند
  let bestPurchase: { item: string; reason: string } | undefined;
  if (myTribe.coins > 2500 && totalDf < 3) {
    bestPurchase = { item: "S-400 Triumph 🛡️", reason: "پدافند قوی — تا موشک‌های دشمن رو خنثی کنی" };
  } else if (myTribe.coins > 1500 && totalMi < 5) {
    bestPurchase = { item: "خرمشهر 🚀", reason: "موشک قوی برای پیروزی در حملات" };
  } else if (myTribe.coins > 2000 && totalJt < 2) {
    bestPurchase = { item: "F-35 Lightning ⚡", reason: "جنگنده نسل ۵ — دفاع و حمله همزمان" };
  } else if (myTribe.coins > 1000) {
    bestPurchase = { item: "کارخانه فولاد ⚙️", reason: "درآمد بلندمدت — با ۷۰۰ سکه ۲۲/تیک درآمد" };
  }

  // بهترین هدف
  let bestTarget: { name: string; districtLandmark: string; expectedResult: string } | undefined;
  let bestScore = -Infinity;
  for (const e of enemies) {
    if (await isAllied(myTribe.id, e.id)) continue;
    const ePower = calcDefensePower(e);
    if (myAtk < ePower * 0.9) continue;
    const dist = haversineMeters([myTribe.lng, myTribe.lat], [e.lng, e.lat]);
    const score = territoryPercent(e) * 2 - ePower * 0.4 - dist / 200 + ((e.factories as FactoryInstance[]) ?? []).length * 30;
    if (score > bestScore) {
      bestScore = score;
      const ratio = myAtk / Math.max(1, ePower);
      bestTarget = {
        name: e.name,
        districtLandmark: e.district,
        expectedResult:
          ratio >= 1.15 ? `پیروزی محتمل (نسبت ${ratio.toFixed(2)}) — احتمالاً ${Math.floor(200 + ratio * 100)}m تصرف` :
          ratio <= 0.85 ? "شکست محتمل — حمله نکن" : `تساوی محتمل — ریسک بالا`,
      };
    }
  }
  if (bestTarget) recs.push(`🎯 بهترین هدف: ${bestTarget.name} در ${bestTarget.districtLandmark} — ${bestTarget.expectedResult}`);
  else recs.push(`🕊 فعلاً هدف مناسب نداری. قدرت نظامی رو ببر بالا.`);

  if (pct < 30) recs.push(`⚠️ خاکت داره کم می‌شه (${pct}٪). با یکی از قوی‌ها متحد شو.`);

  const summary =
    pct >= 80 ? `قلمروت سالمه. وقت گسترش تهاجمی!` :
    pct >= 50 ? `وضعیت پایدار. تعادل خوبه.` :
    pct >= 25 ? `تحت فشاری. دفاع رو ببر بالا.` :
                `وضعیت بحرانی! متحد پیدا کن یا تمام قوا یورش ببر.`;

  return { summary, recommendations: recs, bestTarget, bestPurchase, economyHealth };
}
