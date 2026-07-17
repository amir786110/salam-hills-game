# ⚔️ سلام هیلز گیم (Salam Hills Game)

بازی استراتژیک آنلاین جنگ قبایل روی نقشه واقعی تهران — قبیله بگیر، اقتصادت رو بساز، تسلیحات بخر و قلمرو دیگران رو تصرف کن.

Created by CEO of Salam Hills.

---

## 🇮🇷 دیپلوی روی لیارا (Liara) — پیشنهادی برای کاربران ایرانی

چون خیلی از پلتفرم‌های خارجی (Render, Vercel, Railway) برای فعال‌سازی کامل نیاز به کارت اعتباری بین‌المللی دارن، **لیارا** بهترین گزینه‌ست: پنل و پشتیبانی فارسی، پرداخت با کارت بانکی ایرانی (شتاب)، سرورها داخل ایران.

### قدم ۱: ساخت حساب کاربری
برو به [console.liara.ir](https://console.liara.ir) و با ایمیل یا شماره موبایل ثبت‌نام کن.

### قدم ۲: ساخت دیتابیس PostgreSQL
1. از منوی سمت راست، **دیتابیس‌ها** رو انتخاب کن
2. **ایجاد دیتابیس جدید** بزن
3. نوع: **PostgreSQL**
4. یک اسم بذار (مثلاً `salamhills-db`) و پلن رایگان/کوچک رو انتخاب کن
5. بعد از ساخته شدن، وارد صفحه دیتابیس شو و از تب **Connection**، آدرس اتصال (Connection String) رو کپی کن

### قدم ۳: دیپلوی برنامه (روش آپلود مستقیم — ساده‌ترین راه)
1. پوشه پروژه رو (بدون `node_modules` و `.next`) به‌صورت **zip** فشرده کن
2. در کنسول لیارا، **برنامه‌ها** → **ایجاد برنامه** رو بزن
3. یک اسم برای برنامه بذار (مثلاً `salamhills-game`)
4. فایل zip رو در باکس آپلود بکش و رها کن، یا از حالت اتصال به گیت‌هاب استفاده کن
5. پلتفرم به‌صورت خودکار **Next.js** تشخیص داده می‌شه (به لطف فایل `liara.json`)

### قدم ۴: تنظیم متغیرهای محیطی
در صفحه برنامه، بخش **متغیرهای محیطی (Environment Variables)** رو باز کن و اضافه کن:

| Key | Value |
|---|---|
| `DATABASE_URL` | همون Connection String که از قدم ۲ کپی کردی |
| `JWT_SECRET` | یک رشته تصادفی طولانی (مثلاً از [این سایت](https://generate-secret.vercel.app/32)) |
| `NODE_ENV` | `production` |

### قدم ۵: دیپلوی!
دکمه **استقرار/Deploy** رو بزن. فایل `liara_pre_start.sh` که در پروژه هست، خودکار قبل از اجرای برنامه، جدول‌های دیتابیس رو می‌سازه — نیازی به کار دستی نیست.

### قدم ۶: تمام! 🎉
لیارا یک زیردامنه رایگان بهت می‌ده شبیه:
```
https://salamhills-game.liara.run
```
همین لینک رو برای دوستانت بفرست!

---

## 🌍 دیپلوی روی Render (برای کاربران خارج از ایران با کارت بین‌المللی)

<details>
<summary>راهنمای کامل Render (کلیک کن برای باز کردن)</summary>

### پیش‌نیاز
- یک اکانت [GitHub](https://github.com)
- یک اکانت [Render](https://render.com)

### قدم ۱: Push کردن کد به GitHub

```bash
git init
git add .
git commit -m "Initial commit - Salam Hills Game"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO_NAME.git
git push -u origin main
```

### قدم ۲: ساخت دیتابیس PostgreSQL در Render (بدون Blueprint، به‌صورت دستی)

1. در [داشبورد Render](https://dashboard.render.com)، **New +** → **PostgreSQL**
2. اسم بذار، پلن **Free** رو انتخاب کن، **Create Database** بزن
3. بعد از آماده شدن، از بخش **Connections** مقدار **Internal Database URL** رو کپی کن

⚠️ از روش **Blueprint** (فایل `render.yaml`) استفاده نکن — Render برای اون روش کارت اعتباری می‌خواد. روش دستی (New + → PostgreSQL و New + → Web Service) کارت لازم نداره.

### قدم ۳: ساخت Web Service

1. **New +** → **Web Service**، ریپازیتوری گیت‌هابت رو Connect کن
2. تنظیمات:
   - **Build Command**: `npm install && npx drizzle-kit push --force && npm run build`
   - **Start Command**: `npm run start`
   - **Plan**: Free
3. Environment Variables:
   - `DATABASE_URL` = همون که کپی کردی
   - `JWT_SECRET` = یک رشته تصادفی
   - `NODE_ENV` = `production`
4. **Create Web Service** بزن

### نکات پلن رایگان Render
- دیتابیس رایگان بعد از ۹۰ روز منقضی می‌شه
- وب‌سرویس رایگان بعد از ۱۵ دقیقه بی‌فعالیتی می‌خوابه (بیدار شدن ۳۰-۵۰ ثانیه طول می‌کشه)

</details>

---

## 🛠️ اجرای محلی (Development)

```bash
npm install
cp .env.example .env
# مقادیر DATABASE_URL و JWT_SECRET رو در .env تنظیم کن
npx drizzle-kit push
npm run dev
```

سایت روی `http://localhost:3000` بالا میاد.

---

## 📦 تکنولوژی‌ها

- **Next.js 16** (App Router) + React 19
- **PostgreSQL** با Drizzle ORM
- **Leaflet** برای نقشه ماهواره‌ای تعاملی
- **JWT** برای احراز هویت
- **Tailwind CSS** برای استایل
