// کاتالوگ کامل تسلیحات — با قیمت و قدرت مبتنی بر ارزش واقعی جهانی

export type UnitKind = "jet" | "missile" | "defense";

export interface UnitDef {
  id: string;              // شناسه یکتا
  kind: UnitKind;
  name: string;            // نام فارسی/انگلیسی
  emoji: string;
  origin: string;          // کشور سازنده
  price: number;           // قیمت به هیلزکوین
  attackPower: number;     // قدرت تهاجمی
  defensePower: number;    // قدرت دفاعی
  interceptChance: number; // شانس ره‌گیری (فقط برای پدافند 0..1)
  tier: 1 | 2 | 3 | 4;     // سطح - برای UI و AI
  description: string;
}

// ============ جنگنده‌های تاپ روز دنیا ============
export const JETS: UnitDef[] = [
  { id: "f22",     kind: "jet", name: "F-22 Raptor",     emoji: "🦅", origin: "🇺🇸", price: 3500, attackPower: 90, defensePower: 30, interceptChance: 0, tier: 4, description: "برترین جنگنده نسل ۵ آمریکا" },
  { id: "f35",     kind: "jet", name: "F-35 Lightning",  emoji: "⚡", origin: "🇺🇸", price: 2800, attackPower: 75, defensePower: 28, interceptChance: 0, tier: 4, description: "جنگنده استلث چند منظوره" },
  { id: "su57",    kind: "jet", name: "Su-57 Felon",     emoji: "🌪️", origin: "🇷🇺", price: 2400, attackPower: 78, defensePower: 25, interceptChance: 0, tier: 4, description: "نسل ۵ روسی با موشک هایپرسونیک" },
  { id: "j20",     kind: "jet", name: "J-20 Mighty Dragon", emoji: "🐉", origin: "🇨🇳", price: 2200, attackPower: 72, defensePower: 24, interceptChance: 0, tier: 4, description: "استلث چینی نسل ۵" },
  { id: "eurofighter", kind: "jet", name: "Eurofighter Typhoon", emoji: "🌩️", origin: "🇪🇺", price: 1800, attackPower: 62, defensePower: 22, interceptChance: 0, tier: 3, description: "چند نقش اروپایی" },
  { id: "rafale",  kind: "jet", name: "Rafale",          emoji: "🇫🇷", origin: "🇫🇷", price: 1700, attackPower: 60, defensePower: 22, interceptChance: 0, tier: 3, description: "جنگنده فرانسوی داسو" },
  { id: "su35",    kind: "jet", name: "Su-35 Flanker-E", emoji: "🦈", origin: "🇷🇺", price: 1400, attackPower: 55, defensePower: 20, interceptChance: 0, tier: 3, description: "برترین نسل ۴++ روسی" },
  { id: "f15ex",   kind: "jet", name: "F-15EX Eagle II", emoji: "🦉", origin: "🇺🇸", price: 1600, attackPower: 58, defensePower: 20, interceptChance: 0, tier: 3, description: "نسخه مدرن F-15 با آویزهای ۱۲‌گانه" },
  { id: "gripen",  kind: "jet", name: "JAS-39 Gripen E", emoji: "🦁", origin: "🇸🇪", price: 1200, attackPower: 48, defensePower: 18, interceptChance: 0, tier: 2, description: "جنگنده چابک سوئدی" },
  { id: "kaan",    kind: "jet", name: "TAI Kaan",        emoji: "🌙", origin: "🇹🇷", price: 1000, attackPower: 45, defensePower: 16, interceptChance: 0, tier: 2, description: "نسل ۵ ترکیه" },
];

// ============ موشک‌ها ============
export const MISSILES: UnitDef[] = [
  { id: "fateh110", kind: "missile", name: "فاتح ۱۱۰",   emoji: "🚀", origin: "🇮🇷", price: 300,  attackPower: 20, defensePower: 0, interceptChance: 0, tier: 1, description: "موشک بالستیک کوتاه‌برد" },
  { id: "sejjil",   kind: "missile", name: "سجیل",       emoji: "🚀", origin: "🇮🇷", price: 700,  attackPower: 45, defensePower: 0, interceptChance: 0, tier: 3, description: "بالستیک ۲ مرحله‌ای برد ۲۰۰۰km" },
  { id: "khorramshahr", kind: "missile", name: "خرمشهر", emoji: "🚀", origin: "🇮🇷", price: 900, attackPower: 55, defensePower: 0, interceptChance: 0, tier: 3, description: "بالستیک برد ۲۰۰۰km سنگین" },
  { id: "shahab",   kind: "missile", name: "شهاب",       emoji: "🚀", origin: "🇮🇷", price: 500,  attackPower: 30, defensePower: 0, interceptChance: 0, tier: 2, description: "بالستیک برد میان‌برد" },
  { id: "dezful",   kind: "missile", name: "دزفول",      emoji: "🚀", origin: "🇮🇷", price: 400,  attackPower: 25, defensePower: 0, interceptChance: 0, tier: 2, description: "نسخه ارتقای فاتح" },
  { id: "kheybar",  kind: "missile", name: "خیبرشکن",    emoji: "🚀", origin: "🇮🇷", price: 850,  attackPower: 52, defensePower: 0, interceptChance: 0, tier: 3, description: "بالستیک سریع دشوار برای ره‌گیری" },
  { id: "emad",     kind: "missile", name: "عماد",       emoji: "🚀", origin: "🇮🇷", price: 750,  attackPower: 48, defensePower: 0, interceptChance: 0, tier: 3, description: "بالستیک دقیق نقطه‌زن" },
  { id: "tomahawk", kind: "missile", name: "Tomahawk",   emoji: "🚀", origin: "🇺🇸", price: 1500, attackPower: 65, defensePower: 0, interceptChance: 0, tier: 4, description: "کروز آمریکایی بسیار دقیق" },
];

// ============ پدافندها ============
export const DEFENSES: UnitDef[] = [
  { id: "s500",     kind: "defense", name: "S-500 Prometheus", emoji: "🛡️", origin: "🇷🇺", price: 4000, attackPower: 0, defensePower: 120, interceptChance: 0.90, tier: 4, description: "پیشرفته‌ترین پدافند جهان — علیه هایپرسونیک" },
  { id: "s400",     kind: "defense", name: "S-400 Triumph",    emoji: "🛡️", origin: "🇷🇺", price: 2500, attackPower: 0, defensePower: 85,  interceptChance: 0.75, tier: 4, description: "چند لایه، برد ۴۰۰km" },
  { id: "thaad",    kind: "defense", name: "THAAD",            emoji: "🛡️", origin: "🇺🇸", price: 3000, attackPower: 0, defensePower: 95,  interceptChance: 0.80, tier: 4, description: "پدافند بالستیک بلندبرد آمریکا" },
  { id: "patriot",  kind: "defense", name: "Patriot PAC-3",    emoji: "🛡️", origin: "🇺🇸", price: 1800, attackPower: 0, defensePower: 65,  interceptChance: 0.65, tier: 3, description: "پدافند نقطه‌ای آمریکایی" },
  { id: "irondome", kind: "defense", name: "گنبد آهنین",       emoji: "🛡️", origin: "🇮🇱", price: 1200, attackPower: 0, defensePower: 50,  interceptChance: 0.85, tier: 3, description: "علیه موشک‌های کوتاه‌برد" },
  { id: "bavar373", kind: "defense", name: "باور-۳۷۳",         emoji: "🛡️", origin: "🇮🇷", price: 2000, attackPower: 0, defensePower: 75,  interceptChance: 0.70, tier: 4, description: "پدافند ملی برد ۳۰۰km" },
  { id: "mersad",   kind: "defense", name: "مرصاد",            emoji: "🛡️", origin: "🇮🇷", price: 700,  attackPower: 0, defensePower: 35,  interceptChance: 0.55, tier: 2, description: "پدافند میان‌برد ایرانی" },
  { id: "raad",     kind: "defense", name: "رعد",              emoji: "🛡️", origin: "🇮🇷", price: 500,  attackPower: 0, defensePower: 25,  interceptChance: 0.45, tier: 1, description: "پدافند بومی کوتاه‌برد" },
];

export const ALL_UNITS: UnitDef[] = [...JETS, ...MISSILES, ...DEFENSES];
export const UNIT_BY_ID: Record<string, UnitDef> = Object.fromEntries(ALL_UNITS.map((u) => [u.id, u]));

// ============ کارخانه‌ها (اقتصاد) ============
export interface FactoryDef {
  id: string;
  name: string;
  emoji: string;
  price: number;              // هزینه ساخت
  incomePerTick: number;      // درآمد در هر تیک ۵ ثانیه‌ای
  maxLevel: number;
  description: string;
}

export const FACTORIES: FactoryDef[] = [
  { id: "book_salam",  name: "کارخانه کتاب کار سلام", emoji: "📚", price: 400, incomePerTick: 12, maxLevel: 5, description: "کتاب سلام تولید می‌کنه و می‌فروشه" },
  { id: "paper",       name: "کارخانه کاغذ",         emoji: "📄", price: 350, incomePerTick: 10, maxLevel: 5, description: "کاغذ صادر می‌کنه" },
  { id: "steel",       name: "کارخانه فولاد",        emoji: "⚙️",  price: 700, incomePerTick: 22, maxLevel: 5, description: "فولاد سنگین — درآمد بالا" },
  { id: "oil",         name: "پالایشگاه نفت",        emoji: "🛢️", price: 1200, incomePerTick: 40, maxLevel: 5, description: "درآمد بسیار بالا" },
];
export const FACTORY_BY_ID: Record<string, FactoryDef> = Object.fromEntries(FACTORIES.map((f) => [f.id, f]));

// وضعیت هر کارخانه در قبیله
export interface FactoryInstance {
  id: string;               // FactoryDef.id
  level: number;            // 1..maxLevel
  health: number;           // 0..100 (سلامت — پس از جنگ کم می‌شه)
}

export const MAX_SOLDIERS = 100;
export const SOLDIER_PRICE = 15;
export const SOLDIER_ATTACK = 1;
export const SOLDIER_DEFENSE = 1;

// درآمد پایه از خاک (کیلومتر مربع)
export const COIN_PER_KM2_PER_TICK = 6;

// هزینه بازسازی هر ۱٪ سلامت کارخانه
export const REPAIR_COST_PER_PERCENT = 4;

// هزینه ارتقا کارخانه (به ازای هر لول)
export function upgradeCost(base: number, currentLevel: number) {
  return Math.floor(base * 1.5 * currentLevel);
}
