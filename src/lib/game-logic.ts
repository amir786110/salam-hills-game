import { db } from "@/db";
import { tribes, alliances, allianceRequests, attackLogs, users, type Tribe, type UnitInventory } from "@/db/schema";
import { eq, or, and } from "drizzle-orm";
import {
  JETS, MISSILES, DEFENSES, UNIT_BY_ID, FACTORY_BY_ID, FACTORIES,
  MAX_SOLDIERS, SOLDIER_PRICE, SOLDIER_ATTACK, SOLDIER_DEFENSE,
  COIN_PER_KM2_PER_TICK, REPAIR_COST_PER_PERCENT, upgradeCost,
  type UnitKind, type FactoryInstance,
} from "./units-catalog";
import {
  transferTerritory, polygonAreaKm2, polygonCentroid,
  haversineMeters, nearestLandmark, type Polygon,
} from "./geo";

// نوع کمکی برای تراکنش‌ها (هم db و هم tx می‌تونن اینجا پاس داده بشن)
// به‌جای وابستگی به نوع schema (که با نحوه‌ی ساخت فعلی db سازگار نبود)،
// نوع پارامتر tx را مستقیماً از خود db.transaction استخراج می‌کنیم
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// ============ اعتبارسنجی ورودی (رفع باگ NaN/منفی که می‌تونست منابع بازی رو خراب کنه) ============
export function assertPositiveInt(n: unknown, label: string): number {
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(`مقدار ${label} نامعتبر است`);
  }
  return n;
}

export function assertNonNegativeInt(n: unknown, label: string): number {
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(`مقدار ${label} نامعتبر است`);
  }
  return n;
}

// ============ helpers ============
export function invCount(inv: UnitInventory | null | undefined): number {
  if (!inv) return 0;
  return Object.values(inv).reduce((s, v) => s + (v || 0), 0);
}

export function invByKind(t: Tribe, kind: UnitKind): UnitInventory {
  const inv = kind === "jet" ? t.jetsInventory : kind === "missile" ? t.missilesInventory : t.defensesInventory;
  return (inv as UnitInventory) ?? {};
}

// انتخاب حمله: پخش تعداد از انبار به ترتیب مدل‌ها
export type UnitPick = Record<string, number>;

export function pickTopN(inv: UnitInventory, catalog: Array<{ id: string; attackPower?: number }>, wantedTotal: number): UnitPick {
  // به ترتیب قدرت (بالاترین اول)
  const sorted = [...catalog].sort((a, b) => (b.attackPower ?? 0) - (a.attackPower ?? 0));
  const out: UnitPick = {};
  let need = wantedTotal;
  for (const u of sorted) {
    if (need <= 0) break;
    const avail = inv[u.id] ?? 0;
    if (avail <= 0) continue;
    const use = Math.min(avail, need);
    if (use > 0) {
      out[u.id] = use;
      need -= use;
    }
  }
  return out;
}

// جمع قدرت یک انتخاب
export function powerOfPick(pick: UnitPick, kind: "attack" | "defense"): number {
  let total = 0;
  for (const [id, count] of Object.entries(pick)) {
    const u = UNIT_BY_ID[id];
    if (!u) continue;
    total += (kind === "attack" ? u.attackPower : u.defensePower) * count;
  }
  return total;
}

// قدرت کل دفاعی یک قبیله (پدافند + سرباز + جنگنده‌ها ۵۰٪)
export function calcDefensePower(t: Tribe): number {
  const defInv = (t.defensesInventory ?? {}) as UnitInventory;
  const jetInv = (t.jetsInventory ?? {}) as UnitInventory;
  let power = t.soldiers * SOLDIER_DEFENSE;
  for (const [id, c] of Object.entries(defInv)) {
    const u = UNIT_BY_ID[id];
    if (u) power += u.defensePower * (c || 0);
  }
  for (const [id, c] of Object.entries(jetInv)) {
    const u = UNIT_BY_ID[id];
    if (u) power += Math.floor(u.attackPower * 0.5) * (c || 0);
  }
  return power;
}

// قدرت کل تهاجمی
export function calcAttackTotalPower(t: Tribe): number {
  const jetInv = (t.jetsInventory ?? {}) as UnitInventory;
  const missileInv = (t.missilesInventory ?? {}) as UnitInventory;
  let power = t.soldiers * SOLDIER_ATTACK;
  for (const [id, c] of Object.entries(jetInv)) {
    const u = UNIT_BY_ID[id]; if (u) power += u.attackPower * (c || 0);
  }
  for (const [id, c] of Object.entries(missileInv)) {
    const u = UNIT_BY_ID[id]; if (u) power += u.attackPower * (c || 0);
  }
  return power;
}

// ارزش انبار (برای تخمین ضرر)
export function inventoryWorth(inv: UnitInventory): number {
  let w = 0;
  for (const [id, c] of Object.entries(inv)) {
    const u = UNIT_BY_ID[id]; if (u) w += u.price * (c || 0);
  }
  return w;
}

export async function areAllied(a: number, b: number, executor: DbOrTx = db): Promise<boolean> {
  const rows = await executor.select().from(alliances).where(
    or(and(eq(alliances.tribeAId, a), eq(alliances.tribeBId, b)),
       and(eq(alliances.tribeAId, b), eq(alliances.tribeBId, a)))
  );
  return rows.length > 0;
}

export function territoryPercent(t: Tribe): number {
  const cur = polygonAreaKm2(t.territoryPolygon as Polygon);
  return Math.round((cur / Math.max(0.001, t.initialAreaKm2)) * 100);
}

// ============ اقتصاد ============
export function factoryIncomePerTick(factories: FactoryInstance[]): number {
  let total = 0;
  for (const f of factories) {
    const def = FACTORY_BY_ID[f.id];
    if (!def) continue;
    // سلامت 0..100 → ضریب 0..1
    total += def.incomePerTick * f.level * (f.health / 100);
  }
  return Math.floor(total);
}

export async function generateCoinsForServer(serverId: number) {
  const all = await db.select().from(tribes).where(eq(tribes.serverId, serverId));
  for (const t of all) {
    if (!t.isAlive) continue;
    const area = polygonAreaKm2(t.territoryPolygon as Polygon);
    const territoryGain = Math.max(1, Math.floor(area * COIN_PER_KM2_PER_TICK));
    const factoryGain = factoryIncomePerTick((t.factories as FactoryInstance[]) ?? []);
    await db.update(tribes).set({
      coins: t.coins + territoryGain + factoryGain,
      updatedAt: new Date(),
    }).where(eq(tribes.id, t.id));
  }
}

// ============ خرید ============
export type BuyPayload =
  | { kind: "soldier"; quantity: number }
  | { kind: "unit"; unitId: string; quantity: number }
  | { kind: "factory_build"; factoryId: string }
  | { kind: "factory_upgrade"; factoryId: string }
  | { kind: "factory_repair"; factoryId: string; percent: number };

export async function buy(tribeId: number, payload: BuyPayload) {
  // رفع باگ race condition: قبلاً خواندن قبیله و آپدیتش دو عملیات جدا بودن.
  // اگر کاربر (یا AI) دو درخواست خرید را تقریباً همزمان می‌فرستاد، هر دو
  // می‌توانستند بر اساس یک «coins» قدیمی مشترک عبور کنند و در نتیجه هیلزکوین
  // بیشتر از موجودی واقعی خرج شود. حالا با تراکنش + قفل ردیف (FOR UPDATE)
  // این عملیات کاملاً اتمیک است.
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(tribes).where(eq(tribes.id, tribeId)).for("update");
    if (!t) throw new Error("قبیله یافت نشد");
    if (!t.isAlive) throw new Error("قبیله از بین رفته");

    if (payload.kind === "soldier") {
      const q = assertPositiveInt(payload.quantity, "تعداد سرباز");
      if (t.soldiers + q > MAX_SOLDIERS) throw new Error(`ظرفیت ${MAX_SOLDIERS} نفره`);
      const cost = q * SOLDIER_PRICE;
      if (t.coins < cost) throw new Error("هیلزکوین کافی نیست");
      await tx.update(tribes).set({
        coins: t.coins - cost, soldiers: t.soldiers + q, updatedAt: new Date(),
      }).where(eq(tribes.id, tribeId));
      return { success: true };
    }

    if (payload.kind === "unit") {
      if (typeof payload.unitId !== "string") throw new Error("تسلیحات نامعتبر");
      const u = UNIT_BY_ID[payload.unitId];
      if (!u) throw new Error("تسلیحات یافت نشد");
      const q = assertPositiveInt(payload.quantity, "تعداد");
      const cost = u.price * q;
      if (t.coins < cost) throw new Error("هیلزکوین کافی نیست");
      const field = u.kind === "jet" ? "jetsInventory" : u.kind === "missile" ? "missilesInventory" : "defensesInventory";
      const currentInv = { ...((t[field as keyof Tribe] as UnitInventory) ?? {}) };
      currentInv[u.id] = (currentInv[u.id] ?? 0) + q;
      await tx.update(tribes).set({
        coins: t.coins - cost,
        [field]: currentInv,
        updatedAt: new Date(),
      }).where(eq(tribes.id, tribeId));
      return { success: true };
    }

    if (payload.kind === "factory_build") {
      if (typeof payload.factoryId !== "string") throw new Error("کارخانه نامعتبر");
      const def = FACTORY_BY_ID[payload.factoryId];
      if (!def) throw new Error("کارخانه یافت نشد");
      if (t.coins < def.price) throw new Error("هیلزکوین کافی نیست");
      const factories = [...((t.factories as FactoryInstance[]) ?? [])];
      const existingCount = factories.filter((f) => f.id === def.id).length;
      if (existingCount >= 4) throw new Error("حداکثر تعداد این نوع کارخانه رو داری");
      factories.push({ id: def.id, level: 1, health: 100 });
      await tx.update(tribes).set({
        coins: t.coins - def.price, factories, updatedAt: new Date(),
      }).where(eq(tribes.id, tribeId));
      return { success: true };
    }

    if (payload.kind === "factory_upgrade") {
      if (typeof payload.factoryId !== "string") throw new Error("کارخانه نامعتبر");
      const factories = [...((t.factories as FactoryInstance[]) ?? [])];
      const idx = factories.findIndex((f) => f.id === payload.factoryId);
      if (idx < 0) throw new Error("این کارخونه رو نداری");
      const def = FACTORY_BY_ID[factories[idx].id];
      if (!def) throw new Error("کارخانه یافت نشد");
      if (factories[idx].level >= def.maxLevel) throw new Error("در حداکثر لول است");
      const cost = upgradeCost(def.price, factories[idx].level);
      if (t.coins < cost) throw new Error("هیلزکوین کافی نیست");
      factories[idx] = { ...factories[idx], level: factories[idx].level + 1 };
      await tx.update(tribes).set({
        coins: t.coins - cost, factories, updatedAt: new Date(),
      }).where(eq(tribes.id, tribeId));
      return { success: true };
    }

    if (payload.kind === "factory_repair") {
      if (typeof payload.factoryId !== "string") throw new Error("کارخانه نامعتبر");
      const factories = [...((t.factories as FactoryInstance[]) ?? [])];
      const idx = factories.findIndex((f) => f.id === payload.factoryId);
      if (idx < 0) throw new Error("این کارخونه رو نداری");
      const requestedPercent = assertPositiveInt(payload.percent, "درصد بازسازی");
      const missing = 100 - factories[idx].health;
      const percent = Math.min(requestedPercent, missing);
      if (percent <= 0) throw new Error("سلامت کامله");
      const cost = percent * REPAIR_COST_PER_PERCENT;
      if (t.coins < cost) throw new Error("هیلزکوین کافی نیست");
      factories[idx] = { ...factories[idx], health: factories[idx].health + percent };
      await tx.update(tribes).set({
        coins: t.coins - cost, factories, updatedAt: new Date(),
      }).where(eq(tribes.id, tribeId));
      return { success: true };
    }

    throw new Error("نوع نامعتبر");
  });
}

// ============ حمله ============
export interface AttackParams {
  attackerIds: number[];
  defenderId: number;
  useSoldiers: number;
  useMissileTotal: number;
  useJetTotal: number;
}

export interface AttackResult {
  success: boolean;
  message: string;
  attackPower: number;
  defensePower: number;
  metersTaken: number;
  areaTakenKm2: number;
  attackerLosses: number;
  defenderLosses: number;
  interceptedMissiles: number;
  capturedFactories: FactoryInstance[];
  result: "win" | "lose" | "draw";
  defenderEliminated: boolean;
  narrative: string;
}

export async function performAttack(params: AttackParams): Promise<AttackResult> {
  const { attackerIds, defenderId } = params;
  // اعتبارسنجی ورودی‌های عددی (رفع باگ: مقادیر منفی/NaN می‌تونستن باعث اضافه شدن رایگان واحد نظامی بشن)
  const useSoldiers = assertNonNegativeInt(params.useSoldiers, "تعداد سرباز اعزامی");
  const useMissileTotal = assertNonNegativeInt(params.useMissileTotal, "تعداد موشک اعزامی");
  const useJetTotal = assertNonNegativeInt(params.useJetTotal, "تعداد جنگنده اعزامی");

  if (!Array.isArray(attackerIds) || attackerIds.length === 0) throw new Error("مهاجم نامعتبر");
  // رفع باگ: حذف شناسه‌های تکراری تا یک قبیله دوبار در محاسبات لحاظ نشه
  const uniqueAttackerIds = Array.from(new Set(attackerIds));
  if (uniqueAttackerIds.length !== attackerIds.length) throw new Error("شناسه قبیله تکراری در لیست مهاجمان");
  if (uniqueAttackerIds.includes(defenderId)) throw new Error("قبیله نمی‌تواند به خودش حمله کند");

  // رفع باگ بحرانی: کل عملیات حمله (که شامل چندین select/update/insert پی‌درپی
  // روی چند جدول است) قبلاً در یک تراکنش نبود. اگر وسط عملیات خطایی رخ می‌داد
  // (قطعی شبکه، کرش سرور، محدودیت دیتابیس)، ممکن بود مثلاً خاک مدافع کم بشه
  // ولی منابع مهاجم کسر نشه، یا برعکس — یعنی بازی به یک حالت ناسازگار می‌رفت.
  // با db.transaction، همه‌ی این نوشتن‌ها یا با هم انجام می‌شن یا هیچ‌کدوم.
  // همچنین با .for("update") روی قبایل درگیر، قفل ردیف می‌گیریم تا دو حمله‌ی
  // همزمان به یک قبیله (یا با منابع یک قبیله) با داده‌ی بی‌اعتبار همدیگر را خراب نکنند.
  return db.transaction(async (tx) => {
    const attackers: Tribe[] = [];
    for (const id of uniqueAttackerIds) {
      const [t] = await tx.select().from(tribes).where(eq(tribes.id, id)).for("update");
      if (!t) throw new Error("قبیله حمله‌کننده یافت نشد");
      if (!t.isAlive) throw new Error(`قبیله ${t.name} از بین رفته است`);
      attackers.push(t);
    }
    const [defender] = await tx.select().from(tribes).where(eq(tribes.id, defenderId)).for("update");
    if (!defender) throw new Error("قبیله مدافع یافت نشد");
    if (!defender.isAlive) throw new Error("این قبیله از بین رفته");

    const serverId = attackers[0].serverId;
    if (defender.serverId !== serverId || attackers.some((a) => a.serverId !== serverId)) {
      throw new Error("همه قبایل باید در یک سرور باشند");
    }
    for (const a of attackers) {
      if (await areAllied(a.id, defenderId, tx)) throw new Error(`${a.name} با ${defender.name} متحد است`);
    }
    if (attackers.length > 1) {
      for (let i = 0; i < attackers.length; i++)
        for (let j = i + 1; j < attackers.length; j++)
          if (!(await areAllied(attackers[i].id, attackers[j].id, tx)))
            throw new Error(`${attackers[i].name} و ${attackers[j].name} متحد نیستند`);
    }

    // جمع انبار مهاجم‌ها
    const totalMissilesAvail = attackers.reduce((s, t) => s + invCount(t.missilesInventory as UnitInventory), 0);
    const totalJetsAvail = attackers.reduce((s, t) => s + invCount(t.jetsInventory as UnitInventory), 0);
    const totalSoldiersAvail = attackers.reduce((s, t) => s + t.soldiers, 0);
    if (useSoldiers > totalSoldiersAvail) throw new Error("سرباز کافی نیست");
    if (useMissileTotal > totalMissilesAvail) throw new Error("موشک کافی نیست");
    if (useJetTotal > totalJetsAvail) throw new Error("جنگنده کافی نیست");
    if (useSoldiers + useMissileTotal + useJetTotal === 0) throw new Error("حداقل یک واحد نظامی");

    // انتخاب کدام واحدها استفاده شوند (از قوی‌ترین)
    const perAttackerMissilePick: UnitPick[] = [];
    const perAttackerJetPick: UnitPick[] = [];
    const perAttackerSoldier: number[] = [];

    const distribute = (total: number, avail: number[]): number[] => {
      const sum = avail.reduce((s, v) => s + v, 0);
      if (sum === 0) return avail.map(() => 0);
      const out = avail.map((v) => Math.floor((v / sum) * total));
      let rem = total - out.reduce((s, v) => s + v, 0);
      for (let i = 0; i < out.length && rem > 0; i++) {
        if (avail[i] > out[i]) { out[i]++; rem--; }
      }
      return out;
    };

    const missileAvail = attackers.map((a) => invCount(a.missilesInventory as UnitInventory));
    const jetAvail = attackers.map((a) => invCount(a.jetsInventory as UnitInventory));
    const solAvail = attackers.map((a) => a.soldiers);
    const missileForEach = distribute(useMissileTotal, missileAvail);
    const jetForEach = distribute(useJetTotal, jetAvail);
    const solForEach = distribute(useSoldiers, solAvail);

    for (let i = 0; i < attackers.length; i++) {
      perAttackerMissilePick.push(pickTopN(attackers[i].missilesInventory as UnitInventory, MISSILES, missileForEach[i]));
      perAttackerJetPick.push(pickTopN(attackers[i].jetsInventory as UnitInventory, JETS, jetForEach[i]));
      perAttackerSoldier.push(solForEach[i]);
    }

    // ره‌گیری پدافند مدافع: موشک‌ها ممکنه ره‌گیری بشن
    const defenseInv = (defender.defensesInventory ?? {}) as UnitInventory;
    let interceptedMissiles = 0;
    const combinedMissilePick: UnitPick = {};
    for (const pick of perAttackerMissilePick) {
      for (const [id, c] of Object.entries(pick)) combinedMissilePick[id] = (combinedMissilePick[id] ?? 0) + c;
    }
    const originalTotalPerMissileId: UnitPick = { ...combinedMissilePick };

    const combinedInterceptProb = (() => {
      let survive = 1;
      for (const [id, c] of Object.entries(defenseInv)) {
        const u = UNIT_BY_ID[id];
        if (!u) continue;
        survive *= Math.pow(1 - u.interceptChance, c || 0);
      }
      return 1 - survive; // احتمال ره‌گیری هر موشک
    })();
    const survivorsPerMissileId: UnitPick = {};
    for (const [id, c] of Object.entries(combinedMissilePick)) {
      let survivors = 0;
      for (let i = 0; i < c; i++) {
        if (Math.random() > combinedInterceptProb) survivors++;
        else interceptedMissiles++;
      }
      survivorsPerMissileId[id] = survivors;
    }
    for (const pick of perAttackerMissilePick) {
      for (const id of Object.keys(pick)) {
        const originalTotal = originalTotalPerMissileId[id] ?? 0;
        if (originalTotal === 0) continue;
        const survivorsTotal = survivorsPerMissileId[id] ?? 0;
        pick[id] = Math.floor(((pick[id] ?? 0) / originalTotal) * survivorsTotal);
      }
    }

    // محاسبه قدرت واقعی حمله (پس از ره‌گیری)
    let attackPower = useSoldiers * SOLDIER_ATTACK;
    for (const pick of perAttackerMissilePick) attackPower += powerOfPick(pick, "attack");
    for (const pick of perAttackerJetPick) attackPower += powerOfPick(pick, "attack");

    const defensePower = calcDefensePower(defender);
    const ratio = attackPower / Math.max(1, defensePower);

    let result: "win" | "lose" | "draw";
    let metersTaken = 0;
    let attackerLossRate: number;
    let defenderLossRate: number;

    const attackerLead = polygonCentroid(attackers[0].territoryPolygon as Polygon);
    const defenderCenter = polygonCentroid(defender.territoryPolygon as Polygon);
    const distanceBetween = haversineMeters(attackerLead, defenderCenter);
    const maxAdvance = Math.max(150, distanceBetween * 0.4);

    if (ratio >= 1.15) {
      result = "win";
      metersTaken = Math.min(maxAdvance, Math.floor(120 + ratio * 130));
      attackerLossRate = 0.15 / Math.min(3, ratio);
      defenderLossRate = 0.5 + Math.min(0.35, ratio * 0.12);
    } else if (ratio <= 0.85) {
      result = "lose";
      metersTaken = 0;
      attackerLossRate = 0.6;
      defenderLossRate = 0.15;
    } else {
      result = "draw";
      metersTaken = Math.floor(40 + Math.random() * 60);
      attackerLossRate = 0.3;
      defenderLossRate = 0.3;
    }

    // انتقال polygon
    let newDefenderPoly = defender.territoryPolygon as Polygon;
    let newAttackerPoly = attackers[0].territoryPolygon as Polygon;
    let areaTakenKm2 = 0;
    if (metersTaken > 0) {
      const before = polygonAreaKm2(newDefenderPoly);
      const trans = transferTerritory(newAttackerPoly, newDefenderPoly, attackerLead, defenderCenter, metersTaken);
      newAttackerPoly = trans.attacker;
      newDefenderPoly = trans.defender;
      const after = polygonAreaKm2(newDefenderPoly);
      areaTakenKm2 = Math.max(0, before - after);
    }

    // آسیب و تصرف کارخانه‌های مدافع
    const defenderFactories = [...(((defender.factories as FactoryInstance[]) ?? []))];
    const capturedFactories: FactoryInstance[] = [];
    const remainingDefenderFactories: FactoryInstance[] = [];
    if (result === "win" && defenderFactories.length > 0) {
      const beforeArea = polygonAreaKm2(defender.territoryPolygon as Polygon);
      const lossRatio = beforeArea > 0 ? Math.min(1, areaTakenKm2 / beforeArea) : 0;
      for (const f of defenderFactories) {
        if (Math.random() < lossRatio * 1.5) {
          const damage = 20 + Math.floor(Math.random() * 40);
          const health = Math.max(10, f.health - damage);
          capturedFactories.push({ ...f, health });
        } else {
          const damage = Math.floor(Math.random() * 25);
          remainingDefenderFactories.push({ ...f, health: Math.max(5, f.health - damage) });
        }
      }
    } else {
      for (const f of defenderFactories) {
        const damage = Math.floor(Math.random() * (result === "draw" ? 15 : 8));
        remainingDefenderFactories.push({ ...f, health: Math.max(5, f.health - damage) });
      }
    }

    // تلفات مدافع
    const defenderSoldierLosses = Math.floor(defender.soldiers * defenderLossRate);
    const damageDefensesInv = { ...defenseInv };
    for (const id of Object.keys(damageDefensesInv)) {
      damageDefensesInv[id] = Math.max(0, Math.floor(damageDefensesInv[id] * (1 - defenderLossRate * 0.5)));
    }
    const defenderJetInv = { ...((defender.jetsInventory ?? {}) as UnitInventory) };
    for (const id of Object.keys(defenderJetInv)) {
      defenderJetInv[id] = Math.max(0, Math.floor(defenderJetInv[id] * (1 - defenderLossRate * 0.3)));
    }
    const defenderLossCount =
      defenderSoldierLosses +
      (invCount(defenseInv) - invCount(damageDefensesInv)) +
      (invCount(defender.jetsInventory as UnitInventory) - invCount(defenderJetInv));

    const remainingArea = polygonAreaKm2(newDefenderPoly);
    const remainingPct = remainingArea / Math.max(0.001, defender.initialAreaKm2);
    const defenderEliminated = remainingPct < 0.05;

    // رفع باگ بحرانی: وقتی قبیله نابود می‌شه، ownerId رو هم پاک می‌کنیم.
    // قبلاً فقط isAlive=false ست می‌شد ولی مالکیت باقی می‌موند، در نتیجه بازیکن
    // بازنده برای همیشه "صاحب" یک قبیله مرده حساب می‌شد.
    await tx.update(tribes).set({
      soldiers: Math.max(0, defender.soldiers - defenderSoldierLosses),
      defensesInventory: damageDefensesInv,
      jetsInventory: defenderJetInv,
      factories: remainingDefenderFactories,
      territoryPolygon: newDefenderPoly,
      isAlive: !defenderEliminated,
      ...(defenderEliminated ? { ownerId: null, aiEnabled: false } : {}),
      updatedAt: new Date(),
    }).where(eq(tribes.id, defenderId));

    // پاکسازی اتحادها و درخواست‌های اتحاد قبیله‌ی نابودشده
    if (defenderEliminated) {
      await tx.delete(alliances).where(
        or(eq(alliances.tribeAId, defenderId), eq(alliances.tribeBId, defenderId))
      );
      await tx.delete(allianceRequests).where(
        or(eq(allianceRequests.fromTribeId, defenderId), eq(allianceRequests.toTribeId, defenderId))
      );
    }

    // اعمال تلفات مهاجم‌ها + کسر مصرف موشک/جنگنده + اضافه کارخانه‌های تصرف‌شده به مهاجم اصلی
    for (let i = 0; i < attackers.length; i++) {
      const a = attackers[i];
      const newSol = Math.max(0, a.soldiers - Math.floor(perAttackerSoldier[i] * attackerLossRate));
      const newMi = { ...((a.missilesInventory ?? {}) as UnitInventory) };
      const originalMissilePick = pickTopN(a.missilesInventory as UnitInventory, MISSILES, missileForEach[i]);
      for (const [id, c] of Object.entries(originalMissilePick)) {
        newMi[id] = Math.max(0, (newMi[id] ?? 0) - c);
      }
      const newJt = { ...((a.jetsInventory ?? {}) as UnitInventory) };
      const jetPick = pickTopN(a.jetsInventory as UnitInventory, JETS, jetForEach[i]);
      for (const [id, c] of Object.entries(jetPick)) {
        const losses = Math.floor(c * attackerLossRate * 0.4);
        newJt[id] = Math.max(0, (newJt[id] ?? 0) - losses);
      }
      const updates: Partial<typeof tribes.$inferInsert> = {
        soldiers: newSol,
        missilesInventory: newMi,
        jetsInventory: newJt,
        updatedAt: new Date(),
      };
      if (i === 0) {
        updates.territoryPolygon = newAttackerPoly;
        if (capturedFactories.length > 0) {
          const myFactories = [...(((a.factories as FactoryInstance[]) ?? []))];
          for (const cf of capturedFactories) myFactories.push(cf);
          updates.factories = myFactories;
        }
      }
      await tx.update(tribes).set(updates).where(eq(tribes.id, a.id));
    }

    const attackerLossCount = Math.floor(useSoldiers * attackerLossRate) + Math.floor(useJetTotal * attackerLossRate * 0.4);

    // narrative
    const landmark = nearestLandmark(defenderCenter[0], defenderCenter[1]);
    const attackerNames = attackers.map((a) => a.name).join(" + ");
    const usedUnitsSummary = summarizePicks(perAttackerMissilePick, perAttackerJetPick, useSoldiers);
    let narrative = "";
    if (result === "win") {
      narrative = `${attackerNames} با ${usedUnitsSummary} به قلمرو ${defender.name} در نزدیکی ${landmark} یورش برد. ${interceptedMissiles > 0 ? `پدافند دشمن ${interceptedMissiles} موشک را ره‌گیری کرد اما ` : ""}حدود ${metersTaken} متر (${areaTakenKm2.toFixed(3)} km²) از خاک تصرف شد.`;
      if (capturedFactories.length > 0) {
        const names = capturedFactories.map((f) => FACTORY_BY_ID[f.id]?.name ?? f.id).join("، ");
        narrative += ` 🏭 کارخانه‌های تصرف شده: ${names}`;
      }
    } else if (result === "lose") {
      narrative = `حمله ${attackerNames} با ${usedUnitsSummary} به ${defender.name} در ${landmark} با شکست مواجه شد. ${interceptedMissiles > 0 ? `پدافند ${interceptedMissiles} موشک را ره‌گیری کرد. ` : ""}مقاومت شدید دشمن!`;
    } else {
      narrative = `نبرد ${attackerNames} با ${defender.name} در ${landmark} به تساوی کشید. ${metersTaken} متر جابجایی مرز.`;
    }
    if (defenderEliminated) narrative += ` 💀 قبیله ${defender.name} از نقشه محو شد!`;

    await tx.insert(attackLogs).values({
      serverId,
      attackerId: attackers[0].id,
      defenderId,
      attackerName: attackerNames,
      defenderName: defender.name,
      attackPower,
      defensePower,
      metersTaken,
      areaTakenKm2,
      attackerLosses: attackerLossCount,
      defenderLosses: defenderLossCount,
      interceptedMissiles,
      capturedFactories,
      result,
      narrative,
    });

    // آمار مالک
    if (attackers[0].ownerId) {
      const [owner] = await tx.select().from(users).where(eq(users.id, attackers[0].ownerId));
      if (owner) {
        await tx.update(users).set({
          attacksLaunched: owner.attacksLaunched + 1,
          wins: owner.wins + (result === "win" ? 1 : 0),
          losses: owner.losses + (result === "lose" ? 1 : 0),
          totalTerritoryGained: owner.totalTerritoryGained + metersTaken,
        }).where(eq(users.id, owner.id));
      }
    }

    return {
      success: true,
      message: result === "win" ? `پیروزی! ${metersTaken}m تصرف` : result === "lose" ? "شکست" : "تساوی",
      attackPower, defensePower, metersTaken, areaTakenKm2,
      attackerLosses: attackerLossCount, defenderLosses: defenderLossCount,
      interceptedMissiles, capturedFactories, result, defenderEliminated, narrative,
    };
  });
}

function summarizePicks(mi: UnitPick[], jt: UnitPick[], soldiers: number): string {
  const parts: string[] = [];
  if (soldiers > 0) parts.push(`${soldiers} سرباز`);
  const combineMi: UnitPick = {};
  for (const p of mi) for (const [id, c] of Object.entries(p)) combineMi[id] = (combineMi[id] ?? 0) + c;
  for (const [id, c] of Object.entries(combineMi)) {
    if (c > 0) parts.push(`${c}× ${UNIT_BY_ID[id]?.name ?? id}`);
  }
  const combineJt: UnitPick = {};
  for (const p of jt) for (const [id, c] of Object.entries(p)) combineJt[id] = (combineJt[id] ?? 0) + c;
  for (const [id, c] of Object.entries(combineJt)) {
    if (c > 0) parts.push(`${c}× ${UNIT_BY_ID[id]?.name ?? id}`);
  }
  return parts.join(" و ") || "نیروی محدود";
}

// ============ اتحاد (نیاز به تأیید طرف مقابل — رفع باگ اتحاد یک‌طرفه) ============

// ارسال درخواست اتحاد (به‌جای ایجاد فوری اتحاد)
export async function sendAllianceRequest(serverId: number, fromId: number, toId: number) {
  if (fromId === toId) throw new Error("قبیله با خودش نمی‌تواند متحد شود");

  // رفع باگ race condition: کل بررسی و درج در یک تراکنش انجام می‌شه تا دو
  // درخواست هم‌زمان (مثلاً دوبار کلیک سریع) باعث ساخت دو ردیف تکراری نشن
  return db.transaction(async (tx) => {
    if (await areAllied(fromId, toId, tx)) throw new Error("این دو از قبل متحدند");

    const [fromTribe] = await tx.select().from(tribes).where(eq(tribes.id, fromId));
    if (!fromTribe) throw new Error("قبیله شما یافت نشد");
    if (!fromTribe.isAlive) throw new Error("قبیله شما نابود شده است");

    const [toTribe] = await tx.select().from(tribes).where(eq(tribes.id, toId));
    if (!toTribe) throw new Error("قبیله مقصد یافت نشد");
    if (!toTribe.isAlive) throw new Error("این قبیله نابود شده است");
    if (!toTribe.ownerId) throw new Error("این قبیله مالک ندارد و نمی‌تواند درخواست اتحاد را تأیید کند");

    // اگر درخواست معکوس (toId -> fromId) از قبل pending باشه، یعنی هر دو طرف مایلن — فوراً متحد کن
    const [reverseReq] = await tx
      .select()
      .from(allianceRequests)
      .where(and(
        eq(allianceRequests.fromTribeId, toId),
        eq(allianceRequests.toTribeId, fromId),
        eq(allianceRequests.status, "pending")
      ));
    if (reverseReq) {
      await tx.update(allianceRequests).set({ status: "accepted", respondedAt: new Date() }).where(eq(allianceRequests.id, reverseReq.id));
      await tx.insert(alliances).values({ serverId, tribeAId: fromId, tribeBId: toId });
      return { success: true, autoAccepted: true };
    }

    const [existing] = await tx
      .select()
      .from(allianceRequests)
      .where(and(
        eq(allianceRequests.fromTribeId, fromId),
        eq(allianceRequests.toTribeId, toId),
        eq(allianceRequests.status, "pending")
      ));
    if (existing) throw new Error("قبلاً درخواست اتحاد فرستاده‌ای، منتظر پاسخ باش");

    await tx.insert(allianceRequests).values({ serverId, fromTribeId: fromId, toTribeId: toId, status: "pending" });
    return { success: true, autoAccepted: false };
  });
}

// پاسخ به یک درخواست اتحاد (فقط گیرنده درخواست می‌تواند پاسخ بده)
export async function respondAllianceRequest(requestId: number, myTribeId: number, accept: boolean) {
  // رفع باگ race condition: بررسی وضعیت pending و آپدیت آن به‌صورت اتمیک
  return db.transaction(async (tx) => {
    const [req] = await tx.select().from(allianceRequests).where(eq(allianceRequests.id, requestId)).for("update");
    if (!req) throw new Error("درخواست یافت نشد");
    if (req.toTribeId !== myTribeId) throw new Error("این درخواست برای شما نیست");
    if (req.status !== "pending") throw new Error("این درخواست قبلاً پاسخ داده شده");

    if (accept) {
      if (await areAllied(req.fromTribeId, req.toTribeId, tx)) {
        await tx.update(allianceRequests).set({ status: "accepted", respondedAt: new Date() }).where(eq(allianceRequests.id, requestId));
        return { success: true };
      }
      await tx.insert(alliances).values({ serverId: req.serverId, tribeAId: req.fromTribeId, tribeBId: req.toTribeId });
      await tx.update(allianceRequests).set({ status: "accepted", respondedAt: new Date() }).where(eq(allianceRequests.id, requestId));
    } else {
      await tx.update(allianceRequests).set({ status: "rejected", respondedAt: new Date() }).where(eq(allianceRequests.id, requestId));
    }
    return { success: true };
  });
}

// لغو درخواست ارسالی توسط خود فرستنده
export async function cancelAllianceRequest(requestId: number, myTribeId: number) {
  return db.transaction(async (tx) => {
    const [req] = await tx.select().from(allianceRequests).where(eq(allianceRequests.id, requestId)).for("update");
    if (!req) throw new Error("درخواست یافت نشد");
    if (req.fromTribeId !== myTribeId) throw new Error("این درخواست از شما نیست");
    if (req.status !== "pending") throw new Error("این درخواست دیگر در انتظار نیست");
    await tx.update(allianceRequests).set({ status: "cancelled", respondedAt: new Date() }).where(eq(allianceRequests.id, requestId));
    return { success: true };
  });
}

export async function getPendingRequestsFor(tribeId: number) {
  return db.select().from(allianceRequests).where(and(eq(allianceRequests.toTribeId, tribeId), eq(allianceRequests.status, "pending")));
}

export async function getOutgoingRequestsFrom(tribeId: number) {
  return db.select().from(allianceRequests).where(and(eq(allianceRequests.fromTribeId, tribeId), eq(allianceRequests.status, "pending")));
}

export async function breakAlliance(a: number, b: number) {
  await db.delete(alliances).where(
    or(and(eq(alliances.tribeAId, a), eq(alliances.tribeBId, b)),
       and(eq(alliances.tribeAId, b), eq(alliances.tribeBId, a)))
  );
  return { success: true };
}

// re-export for consumers
export { FACTORIES, upgradeCost };
