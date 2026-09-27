/**
 * Per-room finishing-material estimates (flooring tiles, wall paint).
 * Structural materials (cement, steel, bricks, aggregate) stay building-level
 * — they depend on load-bearing wall/column layout, not room-by-room floor
 * area, so we don't try to split those per room.
 *
 * These are deliberately simple, industry-thumb-rule estimates: rooms are
 * assumed roughly square (so perimeter = 4 x sqrt(area)) since the AI only
 * gives us area per room, not exact wall lengths.
 */

const OPENINGS_NET = 0.85; // 15% off wall area for doors/windows, same as formulas.js
const TILE_AREA_SQFT = 4; // standard 2ft x 2ft floor tile
const TILE_WASTAGE = 1.05; // 5% cutting/breakage allowance
const PAINT_COVERAGE_SQFT_PER_LITRE = 100; // per coat, typical emulsion coverage
const PAINT_COATS = 2;

export function computeRoomMaterials(rooms, floorHeightFt) {
  const height = Number(floorHeightFt) > 0 ? Number(floorHeightFt) : 10;

  return (rooms || []).map((room) => {
    const areaSqFt = Number(room.areaSqFt) || 0;
    const side = Math.sqrt(areaSqFt);
    const perimeterFt = 4 * side;
    const wallAreaSqFt = perimeterFt * height * OPENINGS_NET;
    const flooringTiles = Math.ceil((areaSqFt * TILE_WASTAGE) / TILE_AREA_SQFT);
    const paintLitres = Math.ceil((wallAreaSqFt * PAINT_COATS) / PAINT_COVERAGE_SQFT_PER_LITRE);

    return {
      name: room.name,
      areaSqFt: Math.round(areaSqFt),
      wallAreaSqFt: Math.round(wallAreaSqFt),
      flooringTiles,
      paintLitres,
    };
  });
}