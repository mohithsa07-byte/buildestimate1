/**
 * Foundation Estimation Logic & Formulas
 * Thumb-rule preliminary sizing for isolated, strip, and raft foundations —
 * same spirit as formulas.js: fast estimates for planning/costing, NOT a
 * substitute for a geotechnical report or a structural engineer's design.
 *
 * All inputs are validated by the caller (see routes/api.js).
 */

import { SQFT_PER_SQM, calculateConcreteMix } from './formulas.js';

// ---- Soil bearing capacity presets (IS 1904 style indicative ranges) -----
// Values are the LOWER/typical end of each range — conservative on purpose.
// sbcKNm2 is what calculations use; sbcTM2 is only for display (Indian
// practice usually quotes bearing capacity in tonnes/m²).
export const SOIL_PRESETS = {
  soft_clay: { label: 'Soft Clay / Made-up / Filled Ground', sbcTM2: 5 },
  loose_sand: { label: 'Loose Sand / Soft Silt', sbcTM2: 8 },
  medium_clay: { label: 'Medium Clay / Medium Dense Sand', sbcTM2: 10 },
  stiff_clay: { label: 'Stiff Clay / Dense Sand', sbcTM2: 20 },
  gravel: { label: 'Gravel / Very Dense Sand', sbcTM2: 25 },
  soft_rock: { label: 'Soft Rock / Weathered Rock', sbcTM2: 35 },
  hard_rock: { label: 'Hard Rock', sbcTM2: 45 },
};
const T_M2_TO_KN_M2 = 9.81;
for (const key of Object.keys(SOIL_PRESETS)) {
  SOIL_PRESETS[key].sbcKNm2 = Math.round(SOIL_PRESETS[key].sbcTM2 * T_M2_TO_KN_M2);
}

// ---- Thumb-rule constants -------------------------------------------------
const LOAD_PER_SQM_PER_FLOOR_KN = 12.5; // dead + live load, residential RCC frame, per floor
const WALL_LOAD_PER_M_PER_FLOOR_KN = 12; // load-bearing wall construction, per running metre per floor
const FOOTING_SELF_WEIGHT_FACTOR = 1.10; // adds ~10% for footing's own weight when sizing

const MIN_ISOLATED_DEPTH_M = 0.3;
const MIN_STRIP_DEPTH_M = 0.3;
const MIN_RAFT_THICKNESS_M = 0.15;
const MAX_RAFT_THICKNESS_M = 0.45;

const ISOLATED_FOOTING_STEEL_KG_PER_M3 = 80;  // indicative, ~0.5-1% by volume
const STRIP_FOOTING_STEEL_KG_PER_M3 = 65;
const RAFT_STEEL_KG_PER_M3 = 100;             // mat foundations carry top + bottom steel

const PCC_BED_THICKNESS_M = 0.075; // 75 mm plain concrete leveling/blinding course
const PCC_GRADE = 'M10';

const round = (n, d = 2) => Number(n.toFixed(d));
// round a dimension UP to the nearest 0.05 m so it's a buildable size
const roundUpTo5cm = (n) => Math.ceil(n * 20) / 20;

function resolveSbcKNm2({ soilType, customSbcTM2 }) {
  if (customSbcTM2 !== undefined && customSbcTM2 !== null && customSbcTM2 !== '') {
    const v = Number(customSbcTM2);
    return { sbcKNm2: v * T_M2_TO_KN_M2, sbcTM2: v, source: 'custom' };
  }
  const preset = SOIL_PRESETS[soilType] || SOIL_PRESETS.medium_clay;
  return { sbcKNm2: preset.sbcKNm2, sbcTM2: preset.sbcTM2, source: soilType || 'medium_clay' };
}

function totalBuildingLoadKN(builtUpAreaSqFtPerFloor, floors) {
  const totalSqFt = Number(builtUpAreaSqFtPerFloor) * Number(floors);
  const totalSqM = totalSqFt / SQFT_PER_SQM;
  return totalSqM * LOAD_PER_SQM_PER_FLOOR_KN;
}

function pccQuantities(footprintAreaM2) {
  const volumeM3 = round(footprintAreaM2 * PCC_BED_THICKNESS_M, 3);
  return { thicknessM: PCC_BED_THICKNESS_M, volumeM3, mix: calculateConcreteMix(volumeM3, PCC_GRADE) };
}

// ---- Isolated (pad) footing -----------------------------------------------
/**
 * params: builtUpArea (sqft/floor), floors, numberOfColumns,
 *         soilType | customSbcTM2, concreteGrade
 */
export function calculateIsolatedFooting(params) {
  const {
    builtUpArea, floors, numberOfColumns,
    soilType, customSbcTM2, concreteGrade = 'M20',
  } = params;

  const { sbcKNm2, sbcTM2, source } = resolveSbcKNm2({ soilType, customSbcTM2 });
  const totalLoadKN = totalBuildingLoadKN(builtUpArea, floors);
  const loadPerColumnKN = totalLoadKN / Number(numberOfColumns);
  const factoredLoadKN = loadPerColumnKN * FOOTING_SELF_WEIGHT_FACTOR;

  const rawAreaM2 = factoredLoadKN / sbcKNm2;
  const sideM = roundUpTo5cm(Math.sqrt(rawAreaM2));
  const depthM = roundUpTo5cm(Math.max(MIN_ISOLATED_DEPTH_M, sideM / 5));

  const perFootingVolumeM3 = round(sideM * sideM * depthM, 3);
  const totalVolumeM3 = round(perFootingVolumeM3 * Number(numberOfColumns), 3);
  const steelKg = Math.ceil(totalVolumeM3 * ISOLATED_FOOTING_STEEL_KG_PER_M3);

  const footprintAreaM2 = round(sideM * sideM * Number(numberOfColumns), 2);

  return {
    foundationType: 'isolated',
    inputs: {
      numberOfColumns: Number(numberOfColumns),
      totalLoadKN: round(totalLoadKN),
      loadPerColumnKN: round(loadPerColumnKN),
      sbcTM2: round(sbcTM2), sbcKNm2: round(sbcKNm2), soilSource: source,
    },
    footing: { sideM, depthM, perFootingVolumeM3 },
    totalVolumeM3,
    concrete: calculateConcreteMix(totalVolumeM3, concreteGrade),
    steelKg, steelTons: round(steelKg / 1000),
    pcc: pccQuantities(footprintAreaM2),
    footprintAreaM2,
  };
}

// ---- Strip (wall) footing --------------------------------------------------
/**
 * params: builtUpArea (sqft/floor), floors, wallLengthM (total load-bearing
 *         wall length at foundation level), soilType | customSbcTM2, concreteGrade
 */
export function calculateStripFooting(params) {
  const {
    builtUpArea, floors, wallLengthM,
    soilType, customSbcTM2, concreteGrade = 'M20',
  } = params;

  const { sbcKNm2, sbcTM2, source } = resolveSbcKNm2({ soilType, customSbcTM2 });
  const lengthM = Number(wallLengthM);

  // Load per metre run: derive from total building load spread over wall length
  const totalLoadKN = totalBuildingLoadKN(builtUpArea, floors);
  const derivedLoadPerM = totalLoadKN / lengthM;
  // Sanity floor so unrealistic short wall lengths don't collapse the estimate
  const loadPerMKN = Math.max(derivedLoadPerM, WALL_LOAD_PER_M_PER_FLOOR_KN * Number(floors) * 0.5);
  const factoredLoadPerMKN = loadPerMKN * FOOTING_SELF_WEIGHT_FACTOR;

  const widthM = roundUpTo5cm(factoredLoadPerMKN / sbcKNm2);
  const depthM = roundUpTo5cm(Math.max(MIN_STRIP_DEPTH_M, widthM / 3));

  const totalVolumeM3 = round(widthM * depthM * lengthM, 3);
  const steelKg = Math.ceil(totalVolumeM3 * STRIP_FOOTING_STEEL_KG_PER_M3);
  const footprintAreaM2 = round(widthM * lengthM, 2);

  return {
    foundationType: 'strip',
    inputs: {
      wallLengthM: lengthM,
      totalLoadKN: round(totalLoadKN),
      loadPerMKN: round(loadPerMKN),
      sbcTM2: round(sbcTM2), sbcKNm2: round(sbcKNm2), soilSource: source,
    },
    footing: { widthM, depthM },
    totalVolumeM3,
    concrete: calculateConcreteMix(totalVolumeM3, concreteGrade),
    steelKg, steelTons: round(steelKg / 1000),
    pcc: pccQuantities(footprintAreaM2),
    footprintAreaM2,
  };
}

// ---- Raft (mat) foundation --------------------------------------------------
/**
 * params: builtUpArea (sqft/floor), floors, plotAreaSqFt (footprint to cover;
 *         raft is at least as large as the building footprint regardless of
 *         load), soilType | customSbcTM2, concreteGrade
 */
export function calculateRaftFoundation(params) {
  const {
    builtUpArea, floors, plotAreaSqFt,
    soilType, customSbcTM2, concreteGrade = 'M20',
  } = params;

  const { sbcKNm2, sbcTM2, source } = resolveSbcKNm2({ soilType, customSbcTM2 });
  const totalLoadKN = totalBuildingLoadKN(builtUpArea, floors);
  const factoredLoadKN = totalLoadKN * FOOTING_SELF_WEIGHT_FACTOR;

  const footprintSqFt = Number(plotAreaSqFt) > 0 ? Number(plotAreaSqFt) : Number(builtUpArea);
  const footprintM2 = footprintSqFt / SQFT_PER_SQM;
  const requiredByLoadM2 = factoredLoadKN / sbcKNm2;
  // A raft is never smaller than the building footprint it sits under
  const raftAreaM2 = round(Math.max(footprintM2, requiredByLoadM2), 2);

  const thicknessM = roundUpTo5cm(
    Math.min(MAX_RAFT_THICKNESS_M, Math.max(MIN_RAFT_THICKNESS_M, 0.15 + 0.03 * (Number(floors) - 1)))
  );

  const totalVolumeM3 = round(raftAreaM2 * thicknessM, 2);
  const steelKg = Math.ceil(totalVolumeM3 * RAFT_STEEL_KG_PER_M3);

  return {
    foundationType: 'raft',
    inputs: {
      totalLoadKN: round(totalLoadKN),
      requiredAreaByLoadM2: round(requiredByLoadM2),
      footprintM2: round(footprintM2),
      sbcTM2: round(sbcTM2), sbcKNm2: round(sbcKNm2), soilSource: source,
    },
    footing: { areaM2: raftAreaM2, thicknessM },
    totalVolumeM3,
    concrete: calculateConcreteMix(totalVolumeM3, concreteGrade),
    steelKg, steelTons: round(steelKg / 1000),
    pcc: pccQuantities(raftAreaM2),
    footprintAreaM2: raftAreaM2,
  };
}

// ---- Simple heuristic suggestion -------------------------------------------
// A rough pointer only — never a substitute for an engineer's judgement.
export function suggestFoundationType({ floors, soilType, customSbcTM2, constructionType }) {
  const { sbcTM2 } = resolveSbcKNm2({ soilType, customSbcTM2 });
  const nFloors = Number(floors) || 1;

  if (sbcTM2 <= 6 || nFloors >= 5) {
    return { type: 'raft', reason: 'Low soil bearing capacity or a taller building usually needs a raft/mat foundation to spread the load.' };
  }
  if (constructionType === 'load_bearing') {
    return { type: 'strip', reason: 'Load-bearing wall construction is typically supported on continuous strip footings.' };
  }
  return { type: 'isolated', reason: 'An RCC-framed building on reasonable soil is typically supported on isolated column footings.' };
}

// ---- Cost -------------------------------------------------------------------
export function calculateFoundationCost(result, rates) {
  const { concrete, steelKg, pcc } = result;
  const cementBags = concrete.cementBags + pcc.mix.cementBags;
  const sandTons = concrete.sandTons + pcc.mix.sandTons;
  const aggregateTons = concrete.aggregateTons + pcc.mix.aggregateTons;

  const costBreakdown = {
    cement: Math.round(cementBags * rates.cementRatePerBag),
    sand: Math.round(sandTons * rates.sandRatePerTon),
    aggregate: Math.round(aggregateTons * rates.aggregateRatePerTon),
    steel: Math.round(steelKg * rates.steelRatePerKg),
  };
  const totalCost = Object.values(costBreakdown).reduce((a, b) => a + b, 0);
  return { costBreakdown, totalCost, combinedMaterials: { cementBags, sandTons, aggregateTons } };
}