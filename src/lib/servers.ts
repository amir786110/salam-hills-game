import { db } from "@/db";
import { servers, tribes, alliances, allianceRequests, attackLogs, proclamations } from "@/db/schema";
import { TRIBE_SEEDS, MAP_BOUNDS } from "./tribes-data";
import { generateVoronoiTerritories, polygonAreaKm2 } from "./geo";
import type { FactoryInstance } from "./units-catalog";
import { eq, or } from "drizzle-orm";

// ریست کامل یک قبیله به حالت اولیه (قلمرو Voronoi، منابع پیش‌فرض)
// وقتی مالک قبیله رها می‌کنه یا logout می‌کنه استفاده می‌شه
export async function resetTribe(tribeId: number) {
  const [t] = await db.select().from(tribes).where(eq(tribes.id, tribeId));
  if (!t) return;
  // پیدا کردن seed اصلی این قبیله (بر اساس نام)
  const seedIdx = TRIBE_SEEDS.findIndex((s) => s.name === t.name);
  if (seedIdx < 0) return;
  // بازتولید همه polygon های سرور تا مرزهای Voronoi درست باشن
  // (چون polygon های همسایه‌ها به هم وابسته‌ن، فقط یکی رو ریست کنیم شکاف می‌مانه)
  const serverTribes = await db.select().from(tribes).where(eq(tribes.serverId, t.serverId));
  const sites = TRIBE_SEEDS.map((s, i) => {
    // اگر قبیله زنده است، از نقطه فعلیش استفاده کن
    const found = serverTribes.find((x) => x.name === s.name);
    return { id: i, lng: found?.lng ?? s.lng, lat: found?.lat ?? s.lat };
  });
  const polys = generateVoronoiTerritories(sites, MAP_BOUNDS);
  const newPoly = polys.get(seedIdx) ?? [];
  const newArea = polygonAreaKm2(newPoly);

  // حذف اتحادها و درخواست‌های اتحاد مرتبط با این قبیله
  // (رفع باگ: قبلاً درخواست‌های pending پاک نمی‌شدن و می‌تونستن بعد از ریست
  // برای مالک جدید به‌طور غیرمنتظره فعال بشن)
  await db.delete(alliances).where(
    or(eq(alliances.tribeAId, tribeId), eq(alliances.tribeBId, tribeId))
  );
  await db.delete(allianceRequests).where(
    or(eq(allianceRequests.fromTribeId, tribeId), eq(allianceRequests.toTribeId, tribeId))
  );

  // ریست کامل قبیله
  await db.update(tribes).set({
    ownerId: null,
    aiEnabled: false,
    coins: 1500,
    soldiers: 20,
    jetsInventory: {},
    missilesInventory: {},
    defensesInventory: {},
    factories: [{ id: "book_salam", level: 1, health: 100 }],
    territoryPolygon: newPoly,
    initialAreaKm2: Math.max(0.1, newArea),
    isAlive: true,
    updatedAt: new Date(),
  }).where(eq(tribes.id, tribeId));
}

// وقتی کاربر logout می‌کنه، همه قبایلی که مالکش بوده رو ریست کن
export async function releaseAllTribesOfUser(userId: number) {
  const userTribes = await db.select().from(tribes).where(eq(tribes.ownerId, userId));
  for (const t of userTribes) {
    await resetTribe(t.id);
  }
  return userTribes.length;
}

export async function ensureServer(name: string, slug: string, description?: string) {
  const [existing] = await db.select().from(servers).where(eq(servers.slug, slug));
  if (existing) return existing;
  const [created] = await db.insert(servers).values({ name, slug, description }).returning();
  await seedTribesForServer(created.id);
  return created;
}

export async function seedTribesForServer(serverId: number) {
  await db.delete(proclamations).where(eq(proclamations.serverId, serverId));
  await db.delete(allianceRequests).where(eq(allianceRequests.serverId, serverId));
  await db.delete(attackLogs).where(eq(attackLogs.serverId, serverId));
  await db.delete(alliances).where(eq(alliances.serverId, serverId));
  await db.delete(tribes).where(eq(tribes.serverId, serverId));

  const sites = TRIBE_SEEDS.map((s, i) => ({ id: i, lng: s.lng, lat: s.lat }));
  const polys = generateVoronoiTerritories(sites, MAP_BOUNDS);

  for (let i = 0; i < TRIBE_SEEDS.length; i++) {
    const t = TRIBE_SEEDS[i];
    const poly = polys.get(i) ?? [];
    const area = polygonAreaKm2(poly);
    // یک کارخانه پایه برای شروع
    const factories: FactoryInstance[] = [
      { id: "book_salam", level: 1, health: 100 },
    ];
    await db.insert(tribes).values({
      serverId,
      name: t.name,
      district: t.district,
      color: t.color,
      lat: t.lat,
      lng: t.lng,
      territoryPolygon: poly,
      initialAreaKm2: Math.max(0.1, area),
      coins: 1500,
      soldiers: 20,
      jetsInventory: {},
      missilesInventory: {},
      defensesInventory: {},
      factories,
      // قبایل بدون مالک بی‌حرکت می‌مانن (AI ندارن)
      // وقتی بازیکن قبیله رو می‌گیره، از داخل بازی می‌تونه AI رو روشن کنه (فعلاً پیش‌فرض خاموش)
      aiEnabled: false,
    });
  }
}

export async function ensureDefaultServers() {
  await ensureServer("سرور تهران - عمومی", "public", "برای همه بازیکنان");
  await ensureServer("سرور رقابتی", "competitive", "برای بازیکنان حرفه‌ای");
  await ensureServer("سرور آزمایشی", "sandbox", "تست و تفریح");
}
