// داده‌های اولیه ۱۵ قبیله «سلام» با مختصات واقعی محله‌های تهران
// این قبایل توسط بازیکن‌های انسانی مالکیت می‌گیرند؛ در نبود مالک، AI کنترل می‌کند.

export interface TribeSeed {
  name: string;
  district: string;
  color: string;
  lat: number;
  lng: number;
  // شخصیت پیش‌فرض AI که وقتی مالک نداره ازش استفاده می‌کنه
  aiPersonality: "aggressive" | "defensive" | "balanced" | "sneaky";
}

// مختصات واقعی محله‌های شمال تهران (تنظیم شده تا polygon های Voronoi خوب توزیع بشن)
export const TRIBE_SEEDS: TribeSeed[] = [
  { name: "سلم تجریش",        district: "تجریش",         color: "#ef4444", lat: 35.8050, lng: 51.4315, aiPersonality: "aggressive" },
  { name: "سلام صدر",         district: "بزرگراه صدر",   color: "#f97316", lat: 35.7830, lng: 51.4520, aiPersonality: "balanced" },
  { name: "سلام اسلام",       district: "میدان اسلام",   color: "#eab308", lat: 35.7745, lng: 51.4090, aiPersonality: "balanced" },
  { name: "سلام البرز",       district: "دشت البرز",     color: "#84cc16", lat: 35.7920, lng: 51.3720, aiPersonality: "defensive" },
  { name: "سلام فرمانیه",     district: "فرمانیه",       color: "#22c55e", lat: 35.7940, lng: 51.4740, aiPersonality: "aggressive" },
  { name: "سلام دیباجی",      district: "دیباجی",        color: "#14b8a6", lat: 35.7690, lng: 51.4650, aiPersonality: "sneaky" },
  { name: "سلام زین الدین",   district: "زین الدین",     color: "#06b6d4", lat: 35.7520, lng: 51.4780, aiPersonality: "balanced" },
  { name: "سلام یوسف اباد",   district: "یوسف آباد",     color: "#0ea5e9", lat: 35.7460, lng: 51.4090, aiPersonality: "sneaky" },
  { name: "سلام همت",         district: "بزرگراه همت",   color: "#3b82f6", lat: 35.7570, lng: 51.3810, aiPersonality: "aggressive" },
  { name: "سلام ندای اندیشه", district: "ندای اندیشه",   color: "#6366f1", lat: 35.7680, lng: 51.3450, aiPersonality: "defensive" },
  { name: "سلام صادقیه",      district: "صادقیه",        color: "#8b5cf6", lat: 35.7180, lng: 51.3350, aiPersonality: "aggressive" },
  { name: "سلام ونک",         district: "ونک",           color: "#a855f7", lat: 35.7580, lng: 51.4100, aiPersonality: "balanced" },
  { name: "سلام گلبانگ",      district: "گلبانگ",        color: "#d946ef", lat: 35.7710, lng: 51.4360, aiPersonality: "sneaky" },
  { name: "سلام سلیمه",       district: "سلیمه",         color: "#ec4899", lat: 35.7850, lng: 51.4200, aiPersonality: "defensive" },
  { name: "سلام ایران زمین",  district: "ایران زمین",    color: "#f43f5e", lat: 35.7620, lng: 51.3660, aiPersonality: "balanced" },
];

// توجه: قیمت‌ها و قدرت‌های واقعی تسلیحات در units-catalog.ts تعریف شده‌اند
// (این بازی از یک سیستم چندمدلی برای هر نوع تسلیحات استفاده می‌کند).
export const MAX_SOLDIERS = 100;

// مرکز نقشه تهران
export const TEHRAN_CENTER: [number, number] = [35.7620, 51.4100];

// حد پایینی و بالایی برای Voronoi (مربع محدود کننده)
export const MAP_BOUNDS = {
  minLng: 51.28,
  maxLng: 51.55,
  minLat: 35.62,
  maxLat: 35.85,
};

// آواتارهای پیشنهادی برای پروفایل
export const AVATAR_OPTIONS = [
  "🎯", "⚔️", "🛡️", "🚀", "✈️", "🦁", "🐺", "🦅", "🐉", "👑",
  "🥷", "🧙", "🦾", "💀", "🔥", "⚡", "🌟", "🎖️", "🏆", "🗡️",
];
