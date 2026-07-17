import type { Config } from "drizzle-kit";
import { config as loadEnv } from "dotenv";

// بارگذاری متغیرهای محیطی از فایل .env (برای اجرای محلی)
// در هاست‌های ابری (لیارا/Render/...)، این متغیرها مستقیماً از پنل خونده می‌شن
loadEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL تنظیم نشده. یک فایل .env بساز (بر اساس .env.example) یا در پنل هاست متغیر محیطی رو تنظیم کن."
  );
}

// تشخیص هوشمند SSL (هماهنگ با src/db/index.ts):
// - دیتابیس محلی هرگز SSL نمی‌خواد
// - شبکه داخلی لیارا معمولاً SSL نمی‌خواد/پشتیبانی نمی‌کنه
// - بعضی هاست‌های خارجی (Render/Neon) با ?sslmode=require در URL مشخص می‌کنن SSL لازمه
const isLocalDb = /localhost|127\.0\.0\.1/.test(databaseUrl);
const explicitSslEnv = process.env.DB_SSL;
const urlRequestsSsl = /sslmode=require/i.test(databaseUrl);

function resolveSsl(): false | { rejectUnauthorized: boolean } {
  if (isLocalDb) return false;
  if (explicitSslEnv === "true") return { rejectUnauthorized: false };
  if (explicitSslEnv === "false") return false;
  return urlRequestsSsl ? { rejectUnauthorized: false } : false;
}

export default {
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: databaseUrl,
    ssl: resolveSsl(),
  },
} satisfies Config;
