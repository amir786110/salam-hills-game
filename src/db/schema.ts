import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  boolean,
  doublePrecision,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { FactoryInstance } from "@/lib/units-catalog";

// انبار تسلیحات: نگاشت id → تعداد
export type UnitInventory = Record<string, number>;

// کاربران
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  avatar: text("avatar").notNull().default("🎯"),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  attacksLaunched: integer("attacks_launched").notNull().default(0),
  totalTerritoryGained: integer("total_territory_gained").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// سرورها
export const servers = pgTable("servers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  maxPlayers: integer("max_players").notNull().default(15),
  isActive: boolean("is_active").notNull().default(true),
  // برای جلوگیری از سوءاستفاده (spam کردن endpoint ها برای تولید نامحدود منابع)
  lastCoinTickAt: timestamp("last_coin_tick_at"),
  lastAiTickAt: timestamp("last_ai_tick_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// قبایل
export const tribes = pgTable(
  "tribes",
  {
    id: serial("id").primaryKey(),
    serverId: integer("server_id").notNull(),
    ownerId: integer("owner_id"),
    name: text("name").notNull(),
    district: text("district").notNull(),
    color: text("color").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    territoryPolygon: jsonb("territory_polygon").notNull().$type<number[][]>(),
    initialAreaKm2: doublePrecision("initial_area_km2").notNull().default(1),
    coins: integer("coins").notNull().default(1500), // هیلزکوین
    soldiers: integer("soldiers").notNull().default(20),
    // انبار تسلیحات: id → count
    jetsInventory:     jsonb("jets_inventory").notNull().$type<UnitInventory>().default({}),
    missilesInventory: jsonb("missiles_inventory").notNull().$type<UnitInventory>().default({}),
    defensesInventory: jsonb("defenses_inventory").notNull().$type<UnitInventory>().default({}),
    // کارخانه‌ها
    factories: jsonb("factories").notNull().$type<FactoryInstance[]>().default([]),
    isAlive: boolean("is_alive").notNull().default(true),
    aiEnabled: boolean("ai_enabled").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqNameInServer: uniqueIndex("uniq_tribe_name_in_server").on(t.serverId, t.name),
  })
);

export const alliances = pgTable("alliances", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id").notNull(),
  tribeAId: integer("tribe_a_id").notNull(),
  tribeBId: integer("tribe_b_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// درخواست‌های اتحاد (نیاز به تأیید طرف مقابل — رفع باگ اتحاد یک‌طرفه)
export const allianceRequests = pgTable("alliance_requests", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id").notNull(),
  fromTribeId: integer("from_tribe_id").notNull(),
  toTribeId: integer("to_tribe_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | accepted | rejected | cancelled
  createdAt: timestamp("created_at").notNull().defaultNow(),
  respondedAt: timestamp("responded_at"),
});

export const attackLogs = pgTable("attack_logs", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id").notNull(),
  attackerId: integer("attacker_id").notNull(),
  defenderId: integer("defender_id").notNull(),
  attackerName: text("attacker_name").notNull(),
  defenderName: text("defender_name").notNull(),
  attackPower: integer("attack_power").notNull(),
  defensePower: integer("defense_power").notNull(),
  metersTaken: integer("meters_taken").notNull().default(0),
  areaTakenKm2: doublePrecision("area_taken_km2").notNull().default(0),
  attackerLosses: integer("attacker_losses").notNull(),
  defenderLosses: integer("defender_losses").notNull(),
  interceptedMissiles: integer("intercepted_missiles").notNull().default(0),
  capturedFactories: jsonb("captured_factories").notNull().$type<FactoryInstance[]>().default([]),
  result: text("result").notNull(),
  narrative: text("narrative"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// بیانیه‌های عمومی (broadcast)
export const proclamations = pgTable("proclamations", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id").notNull(),
  tribeId: integer("tribe_id").notNull(),
  tribeName: text("tribe_name").notNull(),
  tribeColor: text("tribe_color").notNull(),
  authorName: text("author_name").notNull(),
  authorAvatar: text("author_avatar").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Server = typeof servers.$inferSelect;
export type Tribe = typeof tribes.$inferSelect;
export type NewTribe = typeof tribes.$inferInsert;
export type Alliance = typeof alliances.$inferSelect;
export type AllianceRequest = typeof allianceRequests.$inferSelect;
export type AttackLog = typeof attackLogs.$inferSelect;
export type Proclamation = typeof proclamations.$inferSelect;
