import type { Config } from "drizzle-kit";
import { config as loadEnv } from "dotenv";

// بارگذاری متغیرهای محیطی از فایل .env (برای اجرای محلی)
// در Render، این متغیرها مستقیماً از Environment تنظیم‌شده در پنل خونده می‌شن
loadEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL تنظیم نشده. یک فایل .env بساز (بر اساس .env.example) یا در Render متغیر محیطی رو تنظیم کن."
  );
}

// هاست‌های مدیریت‌شده (Render/Neon/Supabase) برای اتصال از بیرون نیاز به SSL دارن
const isLocalDb = /localhost|127\.0\.0\.1/.test(databaseUrl);

export default {
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: databaseUrl,
    ssl: isLocalDb ? false : { rejectUnauthorized: false },
  },
} satisfies Config;
