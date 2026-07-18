import { db } from "@/db";
import { servers, tribes, alliances, allianceRequests, attackLogs, proclamations } from "@/db/schema";
import { TRIBE_SEEDS, MAP_BOUNDS } from "./tribes-data";
import { generateVoronoiTerritories, polygonAreaKm2 } from "./geo";
import type { FactoryInstance } from "./units-catalog";
import { eq, or } from "drizzle-orm";

// ریست کامل یک قبیله به حالت اولیه (قلمرو Voronoi، منابع پیش‌فرض)
// وقتی مالک قبیله رها می‌کنه یا logout می‌کنه استفاده می‌شه
export async function resetTribe(tribeId: number) {
  // رفع باگ: قبلاً چند select/update/delete پی‌درپی و بدون تراکنش اجرا می‌شدن.
  // اگر وسط این عملیات (مثلاً بعد از حذف اتحادها ولی قبل از آپدیت خود قبیله)
  // خطایی رخ می‌داد، قبیله در حالت نیمه‌ریست‌شده باقی می‌موند.
  await db.transaction(async (tx) => {
    const [t] = await tx.select().from(tribes).where(eq(tribes.id, tribeId)).for("update");
    if (!t) return;
    const seedIdx = TRIBE_SEEDS.findIndex((s) => s.name === t.name);
    if (seedIdx < 0) return;

    // بازتولید همه polygon های سرور تا مرزهای Voronoi درست باشن
    const serverTribes = await tx.select().from(tribes).where(eq(tribes.serverId, t.serverId));
    const sites = TRIBE_SEEDS.map((s, i) => {
      const found = serverTribes.find((x) => x.name === s.name);
      return { id: i, lng: found?.lng ?? s.lng, lat: found?.lat ?? s.lat };
    });
    const polys = generateVoronoiTerritories(sites, MAP_BOUNDS);
    const newPoly = polys.get(seedIdx) ?? [];
    const newArea = polygonAreaKm2(newPoly);

    await tx.delete(alliances).where(
      or(eq(alliances.tribeAId, tribeId), eq(alliances.tribeBId, tribeId))
    );
    await tx.delete(allianceRequests).where(
      or(eq(allianceRequests.fromTribeId, tribeId), eq(allianceRequests.toTribeId, tribeId))
    );

    await tx.update(tribes).set({
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
  });
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
  try {
    const [created] = await db.insert(servers).values({ name, slug, description }).returning();
    await seedTribesForServer(created.id);
    return created;
  } catch (e) {
    // رفع باگ race condition: اگر چند کاربر هم‌زمان اولین درخواست GET
    // به /api/servers را بفرستند (مثلاً درست بعد از دیپلوی، وقتی دیتابیس
    // خالیه)، همه‌شان سعی می‌کنن سرورهای پیش‌فرض را بسازن. چون name/slug
    // یکتا هستن، فقط اولین insert موفق می‌شه و بقیه با خطای «duplicate key»
    // مواجه می‌شن. قبلاً این خطا مستقیم پرتاب می‌شد و کل صفحه اصلی برای
    // بقیه‌ی کاربرها کرش می‌کرد. حالا در این حالت، سرور از قبل ساخته‌شده
    // (توسط درخواست موازی) را برمی‌گردانیم.
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      const [raceWinner] = await db.select().from(servers).where(eq(servers.slug, slug));
      if (raceWinner) return raceWinner;
    }
    throw e;
  }
}

export async function seedTribesForServer(serverId: number) {
  // رفع باگ: این عملیات شامل چند delete و ۱۵ تا insert است. بدون تراکنش،
  // اگر وسط کار خطایی رخ بده، سرور با تعداد ناقصی قبیله (کمتر از ۱۵ تا) باقی
  // می‌مونه که باعث خطاهای عجیب در نقشه و Voronoi می‌شه.
  await db.transaction(async (tx) => {
    await tx.delete(proclamations).where(eq(proclamations.serverId, serverId));
    await tx.delete(allianceRequests).where(eq(allianceRequests.serverId, serverId));
    await tx.delete(attackLogs).where(eq(attackLogs.serverId, serverId));
    await tx.delete(alliances).where(eq(alliances.serverId, serverId));
    await tx.delete(tribes).where(eq(tribes.serverId, serverId));

    const sites = TRIBE_SEEDS.map((s, i) => ({ id: i, lng: s.lng, lat: s.lat }));
    const polys = generateVoronoiTerritories(sites, MAP_BOUNDS);

    for (let i = 0; i < TRIBE_SEEDS.length; i++) {
      const t = TRIBE_SEEDS[i];
      const poly = polys.get(i) ?? [];
      const area = polygonAreaKm2(poly);
      const factories: FactoryInstance[] = [
        { id: "book_salam", level: 1, health: 100 },
      ];
      await tx.insert(tribes).values({
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
        aiEnabled: false,
      });
    }
  });
}

export async function ensureDefaultServers() {
  await ensureServer("سرور تهران - عمومی", "public", "برای همه بازیکنان");
  await ensureServer("سرور رقابتی", "competitive", "برای بازیکنان حرفه‌ای");
  await ensureServer("سرور آزمایشی", "sandbox", "تست و تفریح");
}
