import React from 'react';
import { computeRoomMaterials } from '../utils/roomMaterials';

export default function RoomBreakdown({ rooms, floorHeightFt }) {
  if (!rooms || rooms.length === 0) return null;

  const roomMaterials = computeRoomMaterials(rooms, floorHeightFt);
  const totalArea = roomMaterials.reduce((a, r) => a + r.areaSqFt, 0);
  const totalTiles = roomMaterials.reduce((a, r) => a + r.flooringTiles, 0);
  const totalPaint = roomMaterials.reduce((a, r) => a + r.paintLitres, 0);

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="border-b border-slate-100 pb-3">
        <h2 className="text-xl font-bold text-slate-800">Room-by-Room Breakdown</h2>
        <p className="text-sm text-slate-500">
          Detected from the uploaded plan · finishing materials only (flooring &amp; paint).
          Structural materials above already cover the whole building.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-3">Room</th>
              <th className="py-2 pr-3">Area</th>
              <th className="py-2 pr-3">Floor Tiles (2×2 ft)</th>
              <th className="py-2 pr-3">Wall Paint</th>
            </tr>
          </thead>
          <tbody>
            {roomMaterials.map((r, i) => (
              <tr key={`${r.name}-${i}`} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-3 font-semibold text-slate-800">{r.name}</td>
                <td className="py-2 pr-3 text-slate-600">{r.areaSqFt} sq.ft</td>
                <td className="py-2 pr-3 text-slate-600">{r.flooringTiles} pcs</td>
                <td className="py-2 pr-3 text-slate-600">{r.paintLitres} L</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 font-bold text-slate-800">
              <td className="py-2 pr-3">Total</td>
              <td className="py-2 pr-3">{totalArea} sq.ft</td>
              <td className="py-2 pr-3">{totalTiles} pcs</td>
              <td className="py-2 pr-3">{totalPaint} L</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Estimates assume roughly square rooms (only area was detected, not exact wall
        lengths), 5% tile wastage, and 2 coats of paint at ~100 sq.ft/litre coverage.
        Treat as a starting point, not a final material order.
      </p>
    </div>
  );
}