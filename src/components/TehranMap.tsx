"use client";
import { useEffect, useRef } from "react";
import { TEHRAN_CENTER } from "@/lib/tribes-data";
import type { Polygon } from "@/lib/geo";

export interface MapTribe {
  id: number;
  name: string;
  district: string;
  color: string;
  lat: number;
  lng: number;
  coins: number;
  soldiers: number;
  isAlive: boolean;
  territoryPolygon: number[][];
  territoryPct: number;
  areaKm2: number;
  ownerId: number | null;
  owner: { username: string; displayName: string; avatar: string } | null;
  attackPower?: number;
  defensePower?: number;
  income?: number;
}

interface Props {
  tribes: MapTribe[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  alliances: { tribeAId: number; tribeBId: number }[];
  myTribeId: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type L = any;

export default function TehranMap({ tribes, selectedId, onSelect, alliances, myTribeId }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<L | null>(null);
  const layerGroup = useRef<L | null>(null);
  const LRef = useRef<L | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      if (cancelled || !mapRef.current) return;
      LRef.current = L;

      if (!mapInstance.current) {
        const map = L.map(mapRef.current, {
          center: TEHRAN_CENTER,
          zoom: 12,
          minZoom: 10,
          maxZoom: 17,
          zoomControl: true,
        });
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          { attribution: "Tiles © Esri", maxZoom: 18 }
        ).addTo(map);
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          { opacity: 0.9, maxZoom: 18 }
        ).addTo(map);
        mapInstance.current = map;
        layerGroup.current = L.layerGroup().addTo(map);
      }
    })();
    return () => {
      cancelled = true;
      // رفع باگ نشتی حافظه: بدون این، هر بار mount/unmount شدن کامپوننت
      // (مثلاً وقتی بین صفحات جابه‌جا می‌شی) event listener های Leaflet آزاد نمی‌شدن
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
        layerGroup.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const L = LRef.current;
    if (!L || !mapInstance.current || !layerGroup.current) return;
    layerGroup.current.clearLayers();

    const tribeById = new Map(tribes.map((t) => [t.id, t]));

    // خطوط اتحاد
    for (const al of alliances) {
      const a = tribeById.get(al.tribeAId);
      const b = tribeById.get(al.tribeBId);
      if (!a || !b) continue;
      L.polyline(
        [
          [a.lat, a.lng],
          [b.lat, b.lng],
        ],
        {
          color: "#fbbf24",
          weight: 2.5,
          dashArray: "8 6",
          opacity: 0.85,
        }
      ).addTo(layerGroup.current);
    }

    // polygon های قلمرو (بجای دایره)
    for (const t of tribes) {
      const poly = t.territoryPolygon as Polygon;
      // رفع باگ: قبلاً اگر polygon کمتر از ۳ نقطه داشت (حالت لبه‌ای نادر مثلاً بعد
      // از تصرف کامل)، قبیله کاملاً از نقشه محو می‌شد بدون هیچ نشونه‌ای.
      // حالا حداقل یک مارکر نشون داده می‌شه.
      if (!poly || poly.length < 3) {
        const icon = L.divIcon({
          html: `<div style="background:#000;color:#aaa;padding:2px 6px;border-radius:6px;font-size:11px;font-family:Tahoma,sans-serif;">💀 ${t.name}</div>`,
          className: "tribe-label",
          iconSize: [120, 24],
          iconAnchor: [60, 12],
        });
        const marker = L.marker([t.lat, t.lng], { icon });
        marker.addTo(layerGroup.current);
        marker.on("click", () => onSelectRef.current(t.id));
        continue;
      }
      // Leaflet expects [lat, lng]
      const latlngs = poly.map(([lng, lat]) => [lat, lng] as [number, number]);

      const isSelected = selectedId === t.id;
      const isMine = myTribeId === t.id;
      const isFree = !t.owner && t.isAlive;
      const fillOpacity = t.isAlive ? (isMine ? 0.55 : isFree ? 0.25 : 0.4) : 0.08;

      const polygon = L.polygon(latlngs, {
        color: isSelected ? "#fbbf24" : isMine ? "#22c55e" : isFree ? "#10b981" : t.color,
        weight: isSelected ? 4 : isMine ? 3 : isFree ? 3 : 2,
        dashArray: isFree && !isSelected ? "6 4" : undefined,
        fillColor: t.color,
        fillOpacity,
        opacity: t.isAlive ? 1 : 0.4,
      });
      polygon.addTo(layerGroup.current);
      polygon.on("click", () => onSelectRef.current(t.id));

      // برچسب
      const ownerBadge = t.owner
        ? `<span style="background:#0ea5e9;color:white;padding:1px 4px;border-radius:4px;font-size:9px;margin-left:3px;">${t.owner.avatar} ${t.owner.displayName}</span>`
        : `<span style="background:#10b981;color:white;padding:1px 5px;border-radius:4px;font-size:9px;margin-left:3px;font-weight:bold;">🆓 آزاد — کلیک کن!</span>`;

      const stats = `${t.territoryPct}٪ · 👥${t.soldiers} · ⚔${t.attackPower ?? 0} 🛡${t.defensePower ?? 0}`;
      const label = t.isAlive
        ? `<div style="background:${t.color};padding:3px 6px;border-radius:6px;border:${
            isSelected ? "2px solid #fbbf24" : isMine ? "2px solid #22c55e" : "1px solid rgba(255,255,255,0.7)"
          };color:white;font-size:11px;font-weight:bold;text-shadow:0 1px 2px rgba(0,0,0,0.9);white-space:nowrap;font-family:Tahoma,sans-serif;box-shadow:0 2px 4px rgba(0,0,0,0.5);">${t.name} ${ownerBadge}<br/><span style="font-size:9px;font-weight:normal;">${stats}</span></div>`
        : `<div style="background:#000;color:#aaa;padding:2px 6px;border-radius:6px;font-size:11px;font-family:Tahoma,sans-serif;">💀 ${t.name}</div>`;

      const icon = L.divIcon({
        html: label,
        className: "tribe-label",
        iconSize: [160, 40],
        iconAnchor: [80, 20],
      });
      const marker = L.marker([t.lat, t.lng], { icon });
      marker.addTo(layerGroup.current);
      marker.on("click", () => onSelectRef.current(t.id));
    }
  }, [tribes, alliances, selectedId, myTribeId]);

  return (
    <div className="relative w-full rounded-2xl bg-slate-900 border border-slate-700 p-2 shadow-xl overflow-hidden">
      <div className="flex items-center justify-between mb-2 px-2 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-amber-300">🛰️ نقشه ماهواره‌ای تهران</h2>
        <div className="text-xs text-slate-400 flex gap-3">
          <span>🟨 مرز زرد = انتخاب</span>
          <span>🟩 مرز سبز = قبیله شما</span>
          <span>➖ خط زرد = اتحاد</span>
        </div>
      </div>
      <div
        ref={mapRef}
        className="w-full rounded-lg"
        style={{ height: "620px", background: "#0f172a" }}
      />
    </div>
  );
}
