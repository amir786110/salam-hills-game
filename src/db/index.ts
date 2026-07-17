import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

// تشخیص هوشمند نیاز به SSL:
// - دیتابیس محلی (localhost/127.0.0.1) هرگز به SSL نیاز نداره
// - بعضی هاست‌های ابری (مثل Render/Neon/Supabase) برای اتصال از بیرون SSL لازم دارن
// - بعضی دیگه (مثل شبکه داخلی لیارا) اصلاً SSL رو پشتیبانی نمی‌کنن و فعال کردنش
//   باعث قطع کامل اتصال می‌شه
// راه‌حل: با متغیر DB_SSL می‌شه صریحاً کنترلش کرد؛ اگر ست نشده بود، فقط وقتی
// خود connection string با ?sslmode=require مشخص کرده باشه فعال می‌شه.
const isLocalDb = /localhost|127\.0\.0\.1/.test(databaseUrl);
const explicitSslEnv = process.env.DB_SSL;
const urlRequestsSsl = /sslmode=require/i.test(databaseUrl);

function resolveSslOption(): boolean | { rejectUnauthorized: boolean } {
  if (isLocalDb) return false;
  if (explicitSslEnv === "true") return { rejectUnauthorized: false };
  if (explicitSslEnv === "false") return false;
  return urlRequestsSsl ? { rejectUnauthorized: false } : false;
}

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: resolveSslOption(),
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
