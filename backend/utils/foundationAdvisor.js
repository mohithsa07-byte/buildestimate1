/**
 * Foundation Advisor
 * Runs isolated, strip and raft sizing for the SAME building + soil, adds an
 * indicative excavation cost, applies practical suitability rules, and ranks
 * the options by cost.
 *
 * Sizing/cost numbers come from foundationFormulas.js (thumb rules). This file
 * never guesses: every ranking and every sentence is derived from those
 * numbers, so the output is repeatable and auditable. It is a planning aid —
 * NOT a substitute for a soil investigation or a structural engineer.
 */

import { SQFT_PER_SQM } from './formulas.js';
import {
  calculateIsolatedFooting,
  calculateStripFooting,
  calculateRaftFoundation,
  calculateFoundationCost,
} from './foundationFormulas.js';

// ---- Assumptions (all returned to the caller so nothing is hidden) ---------
const PARTITION_LENGTH_FACTOR = 1.5;      // same thumb rule as formulas.js
const COLUMN_GRID_AREA_M2 = 14;           // ~one column per 14 m² of plan (≈3.7 m grid)
const DEFAULT_FOUNDING_DEPTH_M = 1.5;     // depth of footing base below ground
const DEFAULT_EXCAVATION_RATE = 350;      // ₹/m³, indicative — user can edit
const WORKING_SPACE_M = 0.3;              // extra excavation each side of a footing
const ISOLATED_COVERAGE_LIMIT = 0.5;      // textbook rule: >50% plan coverage → go raft
const ISOLATED_COVERAGE_CAUTION = 0.4;
const LOW_SBC_T_M2 = 5;
const SBC_GRID_T_M2 = [3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 35, 45];

const LABELS = {
  isolated: 'Isolated (Pad) Footings',
  strip: 'Strip (Wall) Footings',
  raft: 'Raft (Mat) Foundation',
};

const round = (n, d = 2) => Number(Number(n).toFixed(d));
const inr = (n, cur) => `${cur}${Math.round(n).toLocaleString('en-IN')}`;

export function soilGrade(sbcTM2) {
  if (sbcTM2 < 5) return { level: 'very_low', label: 'Very low bearing capacity' };
  if (sbcTM2 < 10) return { level: 'low', label: 'Low bearing capacity' };
  if (sbcTM2 < 20) return { level: 'moderate', label: 'Moderate bearing capacity' };
  if (sbcTM2 < 35) return { level: 'good', label: 'Good bearing capacity' };
  return { level: 'excellent', label: 'Excellent bearing capacity' };
}

// ---- Build + price all three options for one set of inputs -------------------
function buildOptions(p, rates) {
  const footprintM2 = p.builtUpArea / SQFT_PER_SQM;
  const sideM = Math.sqrt(footprintM2);

  const columnsEstimated = !p.numberOfColumns;
  const numberOfColumns = p.numberOfColumns || Math.max(4, Math.ceil(footprintM2 / COLUMN_GRID_AREA_M2));
  const wallLengthEstimated = !p.wallLengthM;
  const wallLengthM = p.wallLengthM || round(4 * sideM + PARTITION_LENGTH_FACTOR * sideM, 1);

  const common = {
    builtUpArea: p.builtUpArea,
    floors: p.floors,
    soilType: p.soilType,
    customSbcTM2: p.customSbcTM2,
    concreteGrade: p.concreteGrade,
  };

  const raw = {
    isolated: calculateIsolatedFooting({ ...common, numberOfColumns }),
    strip: calculateStripFooting({ ...common, wallLengthM }),
    raft: calculateRaftFoundation({ ...common, plotAreaSqFt: p.plotAreaSqFt }),
  };

  const depth = p.foundingDepthM;
  const ws = WORKING_SPACE_M;
  const excavationM3 = {
    isolated: numberOfColumns * (raw.isolated.footing.sideM + 2 * ws) ** 2 * depth,
    strip: (raw.strip.footing.widthM + 2 * ws) * depth * wallLengthM,
    raft: (Math.sqrt(raw.raft.footing.areaM2) + 2 * ws) ** 2 * depth,
  };

  const options = {};
  for (const type of Object.keys(raw)) {
    const result = raw[type];
    const { costBreakdown, totalCost: materialCost, combinedMaterials } = calculateFoundationCost(result, rates);
    const excavCost = Math.round(excavationM3[type] * p.excavationRatePerM3);
    options[type] = {
      type,
      label: LABELS[type],
      // `result` keeps the same shape as POST /foundation so the existing PDF export works on it
      result: { ...result, costBreakdown, totalCost: materialCost, combinedMaterials, currency: rates.currency },
      concreteM3: round(result.totalVolumeM3 + result.pcc.volumeM3, 2),
      steelTons: result.steelTons,
      excavationM3: round(excavationM3[type], 1),
      materialCost,
      excavationCost: excavCost,
      totalCost: materialCost + excavCost,
      notes: [],
      status: 'alternative',
    };
  }

  return {
    options, footprintM2, numberOfColumns, columnsEstimated, wallLengthM, wallLengthEstimated,
    sbcTM2: raw.isolated.inputs.sbcTM2,
    totalLoadKN: raw.isolated.inputs.totalLoadKN,
    loadPerColumnKN: raw.isolated.inputs.loadPerColumnKN,
  };
}

// ---- Practical suitability rules (independent of cost) ----------------------
function applySuitability(built, p) {
  const { options, footprintM2, sbcTM2 } = built;
  const { isolated, strip, raft } = options;
  const framed = p.constructionType !== 'load_bearing';

  // Isolated
  const coverage = isolated.result.footprintAreaM2 / footprintM2;
  const covPct = Math.round(coverage * 100);
  isolated.sizing = `${built.numberOfColumns} footings, ${isolated.result.footing.sideM} × ${isolated.result.footing.sideM} m × ${isolated.result.footing.depthM} m`;
  isolated.coverage = round(coverage, 2);
  if (!framed) {
    isolated.status = 'not_suitable';
    isolated.notes.push('Load-bearing walls need continuous support — isolated footings suit RCC-framed buildings (columns).');
  } else if (coverage > ISOLATED_COVERAGE_LIMIT) {
    isolated.status = 'not_suitable';
    isolated.notes.push(`Footings would cover ${covPct}% of the plan area. Above ~50% a raft is normally more practical and economical.`);
  } else if (coverage > ISOLATED_COVERAGE_CAUTION) {
    isolated.notes.push(`Footings cover ${covPct}% of the plan area — close to the point where a raft becomes the better choice.`);
  } else {
    isolated.notes.push(`Footings cover only ${covPct}% of the plan area, which keeps concrete and excavation low.`);
  }

  // Strip
  strip.sizing = `${strip.result.footing.widthM} m wide × ${strip.result.footing.depthM} m deep under ${built.wallLengthM} m of walls`;
  if (framed) {
    strip.status = 'not_suitable';
    strip.notes.push('Strip footings carry continuous walls. In an RCC-framed building the columns carry the load, so isolated footings or a raft are the normal choice.');
  } else {
    strip.notes.push('Natural fit for load-bearing wall construction.');
    if (p.floors > 3) {
      strip.notes.push('Load-bearing masonry is usually limited to about 3 storeys — have an engineer confirm this height.');
    }
  }

  // Raft
  raft.sizing = `${raft.result.footing.areaM2} m² slab, ${Math.round(raft.result.footing.thicknessM * 1000)} mm thick`;
  if (sbcTM2 < 10) {
    raft.notes.push('Spreads the load over the whole footprint — helpful on weaker soil and for limiting uneven settlement.');
  } else if (sbcTM2 >= 20) {
    raft.notes.push('On soil this strong a raft is usually more concrete than the building needs.');
  } else {
    raft.notes.push('Covers the full footprint, so it uses the most concrete and excavation of the three.');
  }
}

function rank(options) {
  const suitable = Object.values(options).filter((o) => o.status !== 'not_suitable').sort((a, b) => a.totalCost - b.totalCost);
  return { suitable, best: suitable[0] };
}

// ---- What-if: which option wins at other bearing capacities ------------------
function sensitivity(p, rates, currentSbcTM2) {
  const points = [];
  for (const sbc of SBC_GRID_T_M2) {
    const built = buildOptions({ ...p, soilType: undefined, customSbcTM2: sbc }, rates);
    applySuitability(built, p);
    points.push({ sbcTM2: sbc, best: rank(built.options).best.type });
  }
  const ranges = [];
  for (const pt of points) {
    const last = ranges[ranges.length - 1];
    if (last && last.best === pt.best) last.toSbcTM2 = pt.sbcTM2;
    else ranges.push({ fromSbcTM2: pt.sbcTM2, toSbcTM2: pt.sbcTM2, best: pt.best });
  }
  let summary;
  if (ranges.length === 1) {
    summary = `${LABELS[ranges[0].best]} stay the most economical choice across the whole range of soils (3–45 t/m²) for this building.`;
  } else {
    const parts = ranges.map((r) => `${r.fromSbcTM2 === r.toSbcTM2 ? r.fromSbcTM2 : `${r.fromSbcTM2}–${r.toSbcTM2}`} t/m²: ${LABELS[r.best]}`);
    summary = `Cheapest suitable option as soil strength changes — ${parts.join('; ')}. Your soil: ${round(currentSbcTM2, 1)} t/m².`;
  }
  return { ranges, summary };
}

// ---- Public API ---------------------------------------------------------------
/**
 * @param {object} params
 *   builtUpArea (sq.ft per floor), floors, constructionType ('framed'|'load_bearing'),
 *   soilType | customSbcTM2, concreteGrade, numberOfColumns?, wallLengthM?, plotAreaSqFt?,
 *   foundingDepthM?, excavationRatePerM3?, waterTableDepthM?, soilDescription?, reportRecommendation?
 * @param {object} rates  { cementRatePerBag, sandRatePerTon, aggregateRatePerTon, steelRatePerKg, currency }
 */
export function compareFoundations(params, rates) {
  const p = {
    ...params,
    constructionType: params.constructionType === 'load_bearing' ? 'load_bearing' : 'framed',
    concreteGrade: params.concreteGrade || 'M20',
    foundingDepthM: params.foundingDepthM || DEFAULT_FOUNDING_DEPTH_M,
    excavationRatePerM3: params.excavationRatePerM3 || DEFAULT_EXCAVATION_RATE,
  };
  const cur = rates.currency || '₹';

  const built = buildOptions(p, rates);
  applySuitability(built, p);
  const { suitable, best } = rank(built.options);
  best.status = 'recommended';
  const next = suitable[1];

  // ---- Reasons (all derived from the numbers above) ----
  const grade = soilGrade(built.sbcTM2);
  const reasons = [];
  if (next) {
    const saving = next.totalCost - best.totalCost;
    const pct = Math.round((saving / next.totalCost) * 100);
    reasons.push(`About ${inr(saving, cur)} (${pct}%) cheaper than the next-best suitable option, ${next.label}.`);
  } else {
    reasons.push('It is the only option that fits this building and soil.');
  }
  reasons.push(...best.notes);
  reasons.push(`${grade.label} (${round(built.sbcTM2, 1)} t/m²) for a ${p.floors}-floor building of about ${Math.round(p.builtUpArea)} sq.ft per floor.`);

  // ---- Warnings ----
  const warnings = [];
  if (built.sbcTM2 < LOW_SBC_T_M2) {
    warnings.push('Bearing capacity is very low. Shallow foundations may be inadequate — ask a geotechnical engineer whether piles or ground improvement are needed. Piles are not covered by this tool.');
  }
  if (p.floors > 4) {
    warnings.push('Buildings above 4 floors are outside what thumb-rule sizing can reliably cover — they need an engineered foundation design (often a raft or piles).');
  }
  if (p.waterTableDepthM != null && p.waterTableDepthM < p.foundingDepthM + 0.5) {
    warnings.push(`Groundwater was reported at ${p.waterTableDepthM} m, close to the founding depth (${p.foundingDepthM} m). Dewatering, waterproofing and a different foundation design may be needed; their cost is not included.`);
  }
  if (p.soilDescription && /black\s*cotton|expansive|swell|made\s*ground|filled|fill\b|peat|organic/i.test(p.soilDescription)) {
    warnings.push(`The soil report mentions "${p.soilDescription}". Expansive, filled or organic soils usually need special treatment — follow your geotechnical engineer's advice.`);
  }
  if (p.reportRecommendation) {
    warnings.push(`Your soil report itself recommends: "${p.reportRecommendation}". Follow the geotechnical engineer's recommendation wherever it differs from this estimate.`);
  }

  // Order: recommended, other suitable (cheapest first), then not suitable
  const ordered = [
    best,
    ...suitable.slice(1),
    ...Object.values(built.options).filter((o) => o.status === 'not_suitable'),
  ];

  return {
    currency: cur,
    inputs: {
      builtUpArea: p.builtUpArea,
      floors: p.floors,
      constructionType: p.constructionType,
      sbcTM2: round(built.sbcTM2, 1),
      soil: grade,
      footprintM2: round(built.footprintM2, 1),
      totalLoadKN: built.totalLoadKN,
      foundingDepthM: p.foundingDepthM,
      excavationRatePerM3: p.excavationRatePerM3,
    },
    assumptions: {
      numberOfColumns: built.numberOfColumns,
      columnsEstimated: built.columnsEstimated,
      wallLengthM: built.wallLengthM,
      wallLengthEstimated: built.wallLengthEstimated,
    },
    recommended: best.type,
    headline: `${best.label} look like the most economical suitable choice.`,
    reasons,
    warnings,
    options: ordered,
    sensitivity: sensitivity(p, rates, built.sbcTM2),
    costNote: 'Costs cover concrete materials (incl. a PCC bed), steel and an indicative excavation allowance. Shuttering, labour, plinth beams and dewatering are not included.',
    disclaimer: 'Preliminary thumb-rule comparison for planning only. Foundation type and design must be confirmed by a structural engineer using an actual soil investigation report.',
  };
}
