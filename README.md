# ⚔️ سلام هیلز گیم (Salam Hills Game)

بازی استراتژیک آنلاین جنگ قبایل روی نقشه واقعی تهران — قبیله بگیر، اقتصادت رو بساز، تسلیحات بخر و قلمرو دیگران رو تصرف کن.

Created by CEO of Salam Hills.

---

## 🚀 دیپلوی روی Render (راهنمای کامل قدم‌به‌قدم)

### پیش‌نیاز
- یک اکانت [GitHub](https://github.com) (که ساختی ✅)
- یک اکانت [Render](https://render.com) (که ساختی ✅)
- این کد باید در یک ریپازیتوری GitHub push شده باشه

### قدم ۱: Push کردن کد به GitHub

اگه هنوز کد رو به گیت‌هاب نفرستادی:

```bash
git init
git add .
git commit -m "Initial commit - Salam Hills Game"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO_NAME.git
git push -u origin main
```

(به‌جای `USERNAME/REPO_NAME` اسم ریپازیتوری خودت رو بذار)

### قدم ۲: ساخت دیتابیس PostgreSQL در Render

1. وارد داشبورد [Render](https://dashboard.render.com) شو
2. دکمه **New +** بالای صفحه رو بزن → **PostgreSQL** رو انتخاب کن
3. یک اسم بذار (مثلاً `salam-hills-db`)
4. Region رو انتخاب کن (بهتره همون Region ای باشه که بعداً وب‌سرویس رو هم توش می‌سازی)
5. Plan رو **Free** بذار (برای تست) و **Create Database** بزن
6. صبر کن دیتابیس ساخته بشه (چند دقیقه طول می‌کشه)
7. وقتی آماده شد، وارد صفحه دیتابیس بشو و از بخش **Connections**:
   - **Internal Database URL** رو کپی کن (این رو برای وب‌سرویس استفاده می‌کنیم چون سریع‌تره و رایگانه)

### قدم ۳: ساخت Web Service در Render

1. دوباره **New +** بزن → **Web Service** رو انتخاب کن
2. ریپازیتوری گیت‌هابت رو **Connect** کن (اگه اولین باره، باید به Render اجازه دسترسی به گیت‌هابت رو بدی)
3. تنظیمات زیر رو وارد کن:
   - **Name**: هر اسمی (مثلاً `salam-hills-game`)
   - **Region**: همون Region دیتابیس
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npx drizzle-kit push --force && npm run build`
   - **Start Command**: `npm run start`
   - **Plan**: Free (یا هر پلنی که می‌خوای)

4. برو به بخش **Environment Variables** و این‌ها رو اضافه کن:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | همون Internal Database URL که از قدم ۲ کپی کردی |
   | `JWT_SECRET` | یک رشته تصادفی طولانی (مثلاً از [این سایت](https://generate-secret.vercel.app/32) بگیر) |
   | `NODE_ENV` | `production` |

5. دکمه **Create Web Service** رو بزن

### قدم ۴: صبر کن Deploy تموم بشه

Render شروع می‌کنه به:
- نصب پکیج‌ها (`npm install`)
- ساخت جدول‌های دیتابیس (`drizzle-kit push`)
- Build گرفتن از پروژه (`next build`)
- اجرای سرور (`npm run start`)

این کار چند دقیقه طول می‌کشه. می‌تونی از تب **Logs** پیشرفت رو ببینی.

### قدم ۵: تمام! 🎉

وقتی وضعیت سبز شد (**Live**)، Render یک آدرس دائمی بهت می‌ده شبیه:

```
https://salam-hills-game.onrender.com
```

همین لینک رو برای دوستانت بفرست — الان همه می‌تونن ثبت‌نام کنن و بازی کنن!

---

## ⚠️ نکات مهم درباره پلن رایگان Render

- **دیتابیس رایگان Render بعد از ۹۰ روز منقضی می‌شه** — اگه می‌خوای بلندمدت نگه داری، باید ارتقا بدی یا قبلش از داده‌هات backup بگیری
- **وب‌سرویس رایگان بعد از ۱۵ دقیقه بی‌فعالیتی "می‌خوابه"** — اولین درخواست بعد از خواب، ۳۰-۵۰ ثانیه طول می‌کشه تا سرور بیدار بشه (طبیعیه، نگران نباش)
- اگه بازی زیاد استفاده می‌شه و می‌خوای همیشه فعال و سریع باشه، پلن Starter ($7/ماه) رو در نظر بگیر

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
