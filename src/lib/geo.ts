// توابع هندسی برای کار با polygon های قلمرو
// نقاط به فرمت [lng, lat] هستند (GeoJSON style)

import { Delaunay } from "d3-delaunay";

export type Point = [number, number]; // [lng, lat]
export type Polygon = Point[];

// شعاع زمین (متر)
const EARTH_R = 6371000;

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

// فاصله دو نقطه lat/lng به متر (haversine)
export function haversineMeters(a: Point, b: Point): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

// مساحت polygon (کیلومتر مربع) با فرمول shoelace روی مختصات جغرافیایی تقریبی
export function polygonAreaKm2(poly: Polygon): number {
  if (poly.length < 3) return 0;
  // تخمینی خوب برای عرض جغرافیایی تهران: هر درجه lng ≈ 90.65km در lat=35.7
  const meanLat = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const mPerLng = 111320 * Math.cos(toRad(meanLat));
  const mPerLat = 110540;
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    area += x1 * mPerLng * (y2 * mPerLat) - x2 * mPerLng * (y1 * mPerLat);
  }
  return Math.abs(area / 2) / 1_000_000;
}

// مرکز polygon
export function polygonCentroid(poly: Polygon): Point {
  // رفع باگ: اگر polygon خالی باشه (حالت لبه‌ای نادر)، تقسیم بر صفر باعث NaN می‌شد
  // که در محاسبات بعدی (فاصله، انتقال خاک) کل عملیات را خراب می‌کرد
  if (poly.length === 0) return [0, 0];
  let x = 0, y = 0;
  for (const p of poly) { x += p[0]; y += p[1]; }
  return [x / poly.length, y / poly.length];
}

// آیا نقطه داخل polygon هست؟ (ray casting)
export function pointInPolygon(pt: Point, poly: Polygon): boolean {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// تولید polygon های Voronoi اولیه برای همه قبایل بر اساس مرکزهایشان
export function generateVoronoiTerritories(
  sites: { id: number; lng: number; lat: number }[],
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number }
): Map<number, Polygon> {
  const points: [number, number][] = sites.map((s) => [s.lng, s.lat]);
  const delaunay = Delaunay.from(points);
  const voronoi = delaunay.voronoi([
    bounds.minLng,
    bounds.minLat,
    bounds.maxLng,
    bounds.maxLat,
  ]);
  const result = new Map<number, Polygon>();
  sites.forEach((s, i) => {
    const cell = voronoi.cellPolygon(i);
    if (cell) {
      // cellPolygon returns [x,y] pairs, closing point at end - drop duplicate
      const poly: Polygon = cell.slice(0, -1).map((p) => [p[0], p[1]]);
      result.set(s.id, poly);
    } else {
      result.set(s.id, []);
    }
  });
  return result;
}

// انتقال «متر» از polygon مدافع به polygon مهاجم در جهت مهاجم به مدافع
// روش: پیدا کردن مرز مشترک بین دو polygon و push کردن آن به سمت مدافع به اندازه distanceMeters
// روش ساده: نقاطی از polygon مدافع که به مهاجم نزدیک‌ترند را به سمت مهاجم می‌کشیم.
// این یک تقریب گرافیکی خوب می‌دهد.
export function transferTerritory(
  attackerPoly: Polygon,
  defenderPoly: Polygon,
  attackerCenter: Point,
  defenderCenter: Point,
  distanceMeters: number
): { attacker: Polygon; defender: Polygon } {
  if (defenderPoly.length < 3 || attackerPoly.length < 3) {
    return { attacker: attackerPoly, defender: defenderPoly };
  }

  // جهت از مدافع به مهاجم (که مرز به سمت مدافع حرکت کند)
  const meanLat = defenderCenter[1];
  const mPerLng = 111320 * Math.cos(toRad(meanLat));
  const mPerLat = 110540;

  const dx = attackerCenter[0] - defenderCenter[0];
  const dy = attackerCenter[1] - defenderCenter[1];
  // بردار واحد در فضای متر
  const dxM = dx * mPerLng;
  const dyM = dy * mPerLat;
  const norm = Math.hypot(dxM, dyM) || 1;
  const uxM = dxM / norm;
  const uyM = dyM / norm;
  // شیفت به سمت مهاجم (یعنی مرز مدافع به سمت مرکز مدافع شیفت می‌کنه، خاک به مهاجم می‌رسه)
  // در واقع نقاط سمت مهاجم مدافع را به سمت مرکز مدافع می‌کشیم
  const shiftLng = (-uxM * distanceMeters) / mPerLng;
  const shiftLat = (-uyM * distanceMeters) / mPerLat;

  // فقط نقاطی از مدافع که نسبت به مرکز مدافع در سمت مهاجم هستند شیفت می‌شن
  const newDefender: Polygon = defenderPoly.map(([lng, lat]) => {
    const relX = (lng - defenderCenter[0]) * mPerLng;
    const relY = (lat - defenderCenter[1]) * mPerLat;
    const dot = relX * uxM + relY * uyM; // مثبت = سمت مهاجم
    if (dot > 0) {
      // شدت شیفت متناسب با میزان «سمت مهاجم بودن» (نرمالایز 0..1)
      const strength = Math.min(1, dot / (norm * 0.7));
      return [lng + shiftLng * strength, lat + shiftLat * strength];
    }
    return [lng, lat];
  });

  // مهاجم: نقاطش که سمت مدافع هستند را به همان اندازه push به سمت مدافع
  const newAttacker: Polygon = attackerPoly.map(([lng, lat]) => {
    const relX = (lng - attackerCenter[0]) * mPerLng;
    const relY = (lat - attackerCenter[1]) * mPerLat;
    const dot = -relX * uxM - relY * uyM; // مثبت = سمت مدافع
    if (dot > 0) {
      const strength = Math.min(1, dot / (norm * 0.7));
      return [lng + shiftLng * strength * -1, lat + shiftLat * strength * -1];
    }
    return [lng, lat];
  });

  return { attacker: newAttacker, defender: newDefender };
}

// تخمین: distanceMeters تصرف شده چقدر مساحت جابجا می‌کند (بر اساس عرض مرز مشترک تقریبی)
export function estimateAreaFromDistance(
  distanceMeters: number,
  borderApproxMeters: number
): number {
  // area = distance * border (m²) => km²
  return (distanceMeters * borderApproxMeters) / 1_000_000;
}

// نام نزدیک‌ترین «خیابان معروف» تهران به یک نقطه — برای narrative
const LANDMARKS: { name: string; lng: number; lat: number }[] = [
  { name: "میدان تجریش", lat: 35.8050, lng: 51.4315 },
  { name: "بزرگراه صدر", lat: 35.7830, lng: 51.4520 },
  { name: "خیابان فرشته", lat: 35.7830, lng: 51.4290 },
  { name: "پل مدیریت", lat: 35.7710, lng: 51.4090 },
  { name: "میدان ونک", lat: 35.7580, lng: 51.4100 },
  { name: "خیابان ولیعصر", lat: 35.7460, lng: 51.4090 },
  { name: "بزرگراه همت", lat: 35.7570, lng: 51.3810 },
  { name: "بزرگراه چمران", lat: 35.7690, lng: 51.3990 },
  { name: "میدان فرمانیه", lat: 35.7940, lng: 51.4740 },
  { name: "میدان نیاوران", lat: 35.8110, lng: 51.4680 },
  { name: "میدان صادقیه", lat: 35.7180, lng: 51.3350 },
  { name: "بزرگراه شیخ فضل‌الله", lat: 35.7290, lng: 51.3380 },
  { name: "خیابان دیباجی", lat: 35.7690, lng: 51.4650 },
  { name: "میدان اسلام", lat: 35.7745, lng: 51.4090 },
  { name: "خیابان یوسف آباد", lat: 35.7460, lng: 51.4090 },
  { name: "بزرگراه اشرفی اصفهانی", lat: 35.7540, lng: 51.3170 },
  { name: "میدان پونک", lat: 35.7540, lng: 51.3170 },
  { name: "میدان گلبانگ", lat: 35.7710, lng: 51.4360 },
];

export function nearestLandmark(lng: number, lat: number): string {
  let best = LANDMARKS[0];
  let bestD = Infinity;
  for (const l of LANDMARKS) {
    const d = haversineMeters([lng, lat], [l.lng, l.lat]);
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best.name;
}
