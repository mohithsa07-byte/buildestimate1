/**
 * Civil Engineering Estimation Logic & Formulas
 * All inputs are validated by the caller (see routes/api.js).
 */

// ---- Unit conversions -------------------------------------------------
export const SQFT_PER_SQM = 10.7639;
export const M_PER_FT = 0.3048;
export const M_PER_INCH = 0.0254;
export const CFT_PER_M3 = 35.3147;

// ---- Dry volume factors ----------------------------------------------
const MORTAR_DRY_VOLUME_FACTOR = 1.33;   // brickwork mortar
const PLASTER_DRY_VOLUME_FACTOR = 1.27;  // plaster mortar
const CONCRETE_DRY_VOLUME_FACTOR = 1.54; // concrete

// ---- Material properties ----------------------------------------------
const CEMENT_BAG_WEIGHT_KG = 50;
const CEMENT_DENSITY_KG_M3 = 1440;
const SAND_DENSITY_T_M3 = 1.6;
const AGGREGATE_DENSITY_T_M3 = 1.5;
const BRICKS_PER_M3 = 500;

// ---- Thumb rules --------------------------------------------------------
const CONCRETE_M3_PER_SQFT = 0.012; // slabs + beams + columns
const STEEL_KG_PER_SQFT = 4.5;      // residential RCC
const LABOR_DAYS_PER_SQFT = 0.8;
const OPENINGS_DEDUCTION = 0.15;    // doors & windows, 15% of wall area
const MORTAR_SHARE_OF_BRICKWORK = 0.30;
const PLASTER_THICKNESS_M = 0.012;  // 12 mm
const PARTITION_THICKNESS_IN = 4.5;
const PARTITION_LENGTH_FACTOR = 1.5; // partition length per floor = 1.5 x plan side

// Nominal Mix Ratios (Cement : Sand : Aggregate) - IS 456 Table 9
export const NOMINAL_MIXES = {
  M5: { ratio: [1, 5, 10], wc: 0.6, description: 'Lean Concrete / Sub-base' },
  'M7.5': { ratio: [1, 4, 8], wc: 0.55, description: 'Plain Cement Concrete (PCC)' },
  M10: { ratio: [1, 3, 6], wc: 0.5, description: 'Levelling Course / Foundations' },
  M15: { ratio: [1, 2, 4], wc: 0.5, description: 'PCC / Floor Screeds' },
  M20: { ratio: [1, 1.5, 3], wc: 0.45, description: 'RCC Slabs, Beams & Columns' },
  M25: { ratio: [1, 1, 2], wc: 0.4, description: 'Heavy Duty Structural RCC' },
};

const round = (n, d = 2) => Number(n.toFixed(d));
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

/**
 * Split a dry volume of cement/sand/aggregate mix into material quantities.
 */
function splitMix(dryVolM3, ratio) {
  const parts = sum(ratio);
  const cementM3 = dryVolM3 * (ratio[0] / parts);
  const cementKg = cementM3 * CEMENT_DENSITY_KG_M3;
  return {
    cementKg,
    sandM3: dryVolM3 * (ratio[1] / parts),
    aggregateM3: ratio[2] !== undefined ? dryVolM3 * (ratio[2] / parts) : 0,
  };
}

export function calculateConcreteMix(volumeM3, mixGrade = 'M20') {
  const grade = NOMINAL_MIXES[mixGrade] ? mixGrade : 'M20';
  const mix = NOMINAL_MIXES[grade];
  const volume = Number(volumeM3);
  const dryVol = volume * CONCRETE_DRY_VOLUME_FACTOR;

  const { cementKg, sandM3, aggregateM3 } = splitMix(dryVol, mix.ratio);
  const cementBags = Math.ceil(cementKg / CEMENT_BAG_WEIGHT_KG);

  return {
    grade,
    ratioStr: mix.ratio.join(' : '),
    waterCementRatio: mix.wc,
    volumeM3: volume,
    dryVolumeM3: round(dryVol),
    cementBags,
    cementKg: Math.round(cementKg),
    sandM3: round(sandM3),
    sandCft: Math.round(sandM3 * CFT_PER_M3),
    sandTons: round(sandM3 * SAND_DENSITY_T_M3),
    aggregateM3: round(aggregateM3),
    aggregateCft: Math.round(aggregateM3 * CFT_PER_M3),
    aggregateTons: round(aggregateM3 * AGGREGATE_DENSITY_T_M3),
    waterLitres: Math.round(cementBags * CEMENT_BAG_WEIGHT_KG * mix.wc),
  };
}

/**
 * params: builtUpArea (sq.ft PER FLOOR), floors, floorHeight (ft),
 *         wallThickness ('9' | '4.5', external walls, inches),
 *         plastering (bool), concreteGrade (key of NOMINAL_MIXES)
 */
export function calculateMaterialQuantities(params) {
  const {
    builtUpArea = 1000,
    floors = 1,
    floorHeight = 10,
    wallThickness = '9',
    plastering = true,
    concreteGrade = 'M20',
  } = params;

  const areaPerFloorSqFt = Number(builtUpArea);
  const nFloors = Number(floors);
  const totalBuiltUpSqFt = areaPerFloorSqFt * nFloors;
  const totalBuiltUpSqM = totalBuiltUpSqFt / SQFT_PER_SQM;

  // 1. Wall geometry ---------------------------------------------------
  const sideM = Math.sqrt(areaPerFloorSqFt / SQFT_PER_SQM);
  const heightM = Number(floorHeight) * M_PER_FT;
  const externalLenM = 4 * sideM * nFloors;
  const partitionLenM = PARTITION_LENGTH_FACTOR * sideM * nFloors;

  const externalThicknessM = Number(wallThickness) * M_PER_INCH;
  const partitionThicknessM = PARTITION_THICKNESS_IN * M_PER_INCH;
  const net = 1 - OPENINGS_DEDUCTION;

  const externalWallAreaM2 = externalLenM * heightM * net;
  const partitionWallAreaM2 = partitionLenM * heightM * net;
  const brickworkVolumeM3 =
    externalWallAreaM2 * externalThicknessM + partitionWallAreaM2 * partitionThicknessM;

  // 2. Bricks -----------------------------------------------------------
  const brickQuantity = Math.ceil(brickworkVolumeM3 * BRICKS_PER_M3);

  // 3. Brickwork mortar 1:6 ---------------------------------------------
  const dryMortarVolM3 = brickworkVolumeM3 * MORTAR_SHARE_OF_BRICKWORK * MORTAR_DRY_VOLUME_FACTOR;
  const brickMortar = splitMix(dryMortarVolM3, [1, 6]);

  // 4. Plaster 12 mm, 1:6, both faces of every wall ----------------------
  let plasterMortar = { cementKg: 0, sandM3: 0 };
  if (plastering) {
    const plasterAreaM2 = 2 * (externalWallAreaM2 + partitionWallAreaM2);
    const dryPlasterVolM3 = plasterAreaM2 * PLASTER_THICKNESS_M * PLASTER_DRY_VOLUME_FACTOR;
    plasterMortar = splitMix(dryPlasterVolM3, [1, 6]);
  }

  // 5. Structural concrete (chosen nominal mix) --------------------------
  const grade = NOMINAL_MIXES[concreteGrade] ? concreteGrade : 'M20';
  const concreteVolumeM3 = totalBuiltUpSqFt * CONCRETE_M3_PER_SQFT;
  const concrete = splitMix(concreteVolumeM3 * CONCRETE_DRY_VOLUME_FACTOR, NOMINAL_MIXES[grade].ratio);

  // 6. Steel & labor ------------------------------------------------------
  const steelKg = Math.ceil(totalBuiltUpSqFt * STEEL_KG_PER_SQFT);
  const laborDays = Math.ceil(totalBuiltUpSqFt * LABOR_DAYS_PER_SQFT);

  // 7. Totals (cement bags rounded once, on the summed weight) ------------
  const totalCementKg = concrete.cementKg + brickMortar.cementKg + plasterMortar.cementKg;
  const cementBags = Math.ceil(totalCementKg / CEMENT_BAG_WEIGHT_KG);
  const sandTons = (concrete.sandM3 + brickMortar.sandM3 + plasterMortar.sandM3) * SAND_DENSITY_T_M3;
  const aggregateTons = concrete.aggregateM3 * AGGREGATE_DENSITY_T_M3;

  return {
    totalBuiltUpSqFt: round(totalBuiltUpSqFt),
    totalBuiltUpSqM: round(totalBuiltUpSqM, 1),
    concreteGrade: grade,
    concreteVolumeM3: round(concreteVolumeM3),
    brickworkVolumeM3: round(brickworkVolumeM3),
    brickQuantity,
    cementBags,
    sandTons: round(sandTons),
    aggregateTons: round(aggregateTons),
    steelKg,
    steelTons: round(steelKg / 1000),
    laborDays,
  };
}

/**
 * Multiply quantities by unit rates.
 */
export function calculateCosts(quantities, rates) {
  const costBreakdown = {
    cement: Math.round(quantities.cementBags * rates.cementRatePerBag),
    sand: Math.round(quantities.sandTons * rates.sandRatePerTon),
    aggregate: Math.round(quantities.aggregateTons * rates.aggregateRatePerTon),
    bricks: Math.round(quantities.brickQuantity * rates.brickRatePerPiece),
    steel: Math.round(quantities.steelKg * rates.steelRatePerKg),
    labor: Math.round(quantities.laborDays * rates.laborRatePerDay),
  };
  return { costBreakdown, totalCost: sum(Object.values(costBreakdown)) };
}
