import { useMemo, useState } from "react";

// Lightweight client-side approximation, mirrors the backend thumb rule,
// just for the live hero preview — the real numbers come from the API.
function quickPreview(areaSqft) {
  const areaSqm = areaSqft / 10.7639;
  const side = Math.sqrt(areaSqm);
  const heightM = 10 * 0.3048;
  // one floor: 9" external walls + 4.5" partitions (1.5 x side), 15% openings
  const wallVolume =
    (4 * side * heightM * 0.229 + 1.5 * side * heightM * 0.1143) * 0.85;
  const bricks = Math.round(wallVolume * 500);
  const cementBags = Math.round((wallVolume * 0.3 * 1.33 * (1 / 7) * 1440) / 50);
  const steel = Math.round(areaSqft * 4.5);
  return { bricks, cementBags, steel };
}

export default function Hero({ onStart }) {
  const [area, setArea] = useState(1200);
  const preview = useMemo(() => quickPreview(area), [area]);

  return (
    <section className="bg-ink text-paper relative overflow-hidden">
      <div className="absolute inset-0 bg-blueprintGrid bg-grid opacity-40 pointer-events-none" />
      <div className="max-w-6xl mx-auto px-6 py-16 relative grid md:grid-cols-5 gap-10 items-center">
        <div className="md:col-span-3">
          <div className="text-safety font-mono text-xs tracking-wide mb-3">
            BASIC CIVIL ENGINEERING · SOFTWARE PROJECT
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-semibold leading-[1.1] max-w-xl">
            Estimate materials and cost before the first brick is laid.
          </h1>
          <p className="mt-5 text-concrete/80 max-w-lg leading-relaxed">
            Enter a building's built-up area, floors and wall specification —
            BuildEstimate applies standard thumb-rule formulas to return a
            full quantity and cost breakdown: cement, sand, aggregate, bricks
            and steel.
          </p>
          <button
            onClick={onStart}
            className="focus-ring mt-8 bg-safety hover:bg-safetyDeep text-ink font-medium px-6 py-3 text-sm transition-colors"
          >
            Start an estimate
          </button>
        </div>

        <div className="md:col-span-2 blueprint-panel p-5 text-ink">
          <div className="font-mono text-[11px] text-steel mb-1">LIVE PREVIEW</div>
          <div className="text-sm text-ink/70 mb-4">
            Drag to see rough material needs for one floor (masonry only).
          </div>
          <input
            type="range"
            min="400"
            max="4000"
            step="50"
            value={area}
            onChange={(e) => setArea(Number(e.target.value))}
            className="w-full accent-safety"
          />
          <div className="flex justify-between font-mono text-xs text-steel mt-1">
            <span>400 sqft</span>
            <span className="text-ink font-medium">{area.toLocaleString()} sqft</span>
            <span>4000 sqft</span>
          </div>

          <div className="ruler-ticks my-4" />

          <div className="grid grid-cols-3 gap-3">
            <PreviewStat label="Bricks" value={preview.bricks.toLocaleString()} />
            <PreviewStat label="Cement" value={`${preview.cementBags} bags`} />
            <PreviewStat label="Steel" value={`${preview.steel} kg`} />
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewStat({ label, value }) {
  return (
    <div className="text-center">
      <div className="font-mono text-lg font-semibold text-blueprint">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-ink/50 mt-0.5">{label}</div>
    </div>
  );
}
