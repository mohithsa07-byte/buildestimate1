import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  NOMINAL_MIXES,
  calculateConcreteMix,
  calculateMaterialQuantities,
  calculateCosts,
} from '../utils/formulas.js';
import { analyzePlan } from '../utils/planAnalysis.js';
import { streamEstimatePdf, streamFoundationPdf } from '../utils/pdfReport.js';
import {
  SOIL_PRESETS,
  calculateIsolatedFooting,
  calculateStripFooting,
  calculateRaftFoundation,
  calculateFoundationCost,
  suggestFoundationType,
} from '../utils/foundationFormulas.js';

const router = express.Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const RATES_FILE = path.join(DATA_DIR, 'rates.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

const RATE_KEYS = [
  'cementRatePerBag',
  'sandRatePerTon',
  'aggregateRatePerTon',
  'brickRatePerPiece',
  'steelRatePerKg',
  'laborRatePerDay',
];
const DEFAULT_RATES = {
  cementRatePerBag: 380,
  sandRatePerTon: 1200,
  aggregateRatePerTon: 1100,
  brickRatePerPiece: 9,
  steelRatePerKg: 65,
  laborRatePerDay: 750,
  currency: '₹',
};

// ---- helpers ------------------------------------------------------------
async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file);
}

const loadRates = async () => ({ ...DEFAULT_RATES, ...(await readJson(RATES_FILE, {})) });

const isPositive = (v) => v !== '' && v !== null && Number.isFinite(Number(v)) && Number(v) > 0;

// Cleans a rates object; returns { rates } or { error }
function sanitizeRates(input, base) {
  const rates = { ...base };
  for (const key of RATE_KEYS) {
    if (input[key] === undefined) continue;
    const n = Number(input[key]);
    if (input[key] === '' || !Number.isFinite(n) || n < 0) {
      return { error: `Rate "${key}" must be a non-negative number` };
    }
    rates[key] = n;
  }
  if (typeof input.currency === 'string' && input.currency.trim()) {
    rates.currency = input.currency.trim().slice(0, 4);
  }
  return { rates };
}

// Serialize project writes so concurrent requests can't clobber each other
let projectsLock = Promise.resolve();
const withProjectsLock = (fn) => {
  const run = projectsLock.then(fn);
  projectsLock = run.catch(() => {});
  return run;
};

// ---- estimate -----------------------------------------------------------
async function estimateHandler(req, res, next) {
  try {
    const b = req.body || {};

    if (!isPositive(b.builtUpArea)) {
      return res.status(400).json({ error: 'Built-up area must be a positive number' });
    }
    if (!isPositive(b.floors) || !Number.isInteger(Number(b.floors)) || Number(b.floors) > 100) {
      return res.status(400).json({ error: 'Number of floors must be a whole number between 1 and 100' });
    }
    if (!isPositive(b.floorHeight)) {
      return res.status(400).json({ error: 'Floor height must be a positive number' });
    }
    const wallThickness = String(b.wallThickness ?? '9');
    if (!['9', '4.5'].includes(wallThickness)) {
      return res.status(400).json({ error: 'Wall thickness must be 9 or 4.5 inches' });
    }
    const concreteGrade = b.concreteGrade ?? 'M20';
    if (!NOMINAL_MIXES[concreteGrade]) {
      return res.status(400).json({ error: `Unknown concrete grade "${concreteGrade}"` });
    }

    const plastering = b.includePlastering ?? b.plastering ?? true;
    const parameters = {
      plotArea: b.plotArea !== undefined && b.plotArea !== '' ? Number(b.plotArea) : null,
      builtUpArea: Number(b.builtUpArea),
      floors: Number(b.floors),
      floorHeight: Number(b.floorHeight),
      wallThickness,
      includePlastering: plastering === true || plastering === 'true',
      concreteGrade,
    };

    // Rates sent by the client (unsaved edits) win, otherwise use stored rates
    const stored = await loadRates();
    const { rates, error } = sanitizeRates(b.rates && typeof b.rates === 'object' ? b.rates : {}, stored);
    if (error) return res.status(400).json({ error });

    const quantities = calculateMaterialQuantities({
      builtUpArea: parameters.builtUpArea,
      floors: parameters.floors,
      floorHeight: parameters.floorHeight,
      wallThickness,
      plastering: parameters.includePlastering,
      concreteGrade,
    });
    const { costBreakdown, totalCost } = calculateCosts(quantities, rates);

    res.json({ parameters, quantities, costBreakdown, totalCost, currency: rates.currency });
  } catch (err) {
    next(err);
  }
}
router.post('/estimate', estimateHandler);
router.post('/calculate', estimateHandler); // alias

// ---- concrete mix -------------------------------------------------------
// ---- AI floor-plan analysis ---------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
});

router.post('/analyze-plan', (req, res) => {
  upload.single('plan')(req, res, async (uploadErr) => {
    if (uploadErr) {
      const message = uploadErr.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large (8 MB max).'
        : 'Could not read the uploaded file.';
      return res.status(400).json({ error: message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded (expected field "plan").' });
    }

    try {
      const extracted = await analyzePlan(req.file.buffer, req.file.mimetype);
      res.json({ extracted });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Plan analysis failed.' });
    }
  });
});

// ---- PDF export -----------------------------------------------------------
router.post('/estimate/pdf', (req, res) => {
  const { parameters, quantities, costBreakdown, totalCost, currency, roomMaterials, title } = req.body || {};

  if (!quantities || typeof quantities !== 'object' || !costBreakdown || typeof costBreakdown !== 'object') {
    return res.status(400).json({ error: 'Nothing to export: calculate an estimate first.' });
  }

  try {
    streamEstimatePdf(res, {
      title: typeof title === 'string' ? title.slice(0, 120) : undefined,
      parameters: parameters && typeof parameters === 'object' ? parameters : {},
      quantities,
      costBreakdown,
      totalCost: Number(totalCost) || 0,
      currency: typeof currency === 'string' && currency ? currency : '₹',
      roomMaterials: Array.isArray(roomMaterials) ? roomMaterials : [],
    });
  } catch (err) {
    console.error('PDF generation failed:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate PDF report.' });
    }
  }
});
// ---- foundation ----------------------------------------------------------
router.get('/foundation/soil-types', (req, res) => {
  const list = Object.entries(SOIL_PRESETS).map(([key, v]) => ({
    key, label: v.label, sbcTM2: v.sbcTM2, sbcKNm2: v.sbcKNm2,
  }));
  res.json(list);
});

router.post('/foundation', async (req, res, next) => {
  try {
    const b = req.body || {};
    const foundationType = b.foundationType;
    if (!['isolated', 'strip', 'raft'].includes(foundationType)) {
      return res.status(400).json({ error: 'foundationType must be "isolated", "strip", or "raft"' });
    }
    if (!isPositive(b.builtUpArea)) {
      return res.status(400).json({ error: 'Built-up area must be a positive number' });
    }
    if (!isPositive(b.floors) || !Number.isInteger(Number(b.floors)) || Number(b.floors) > 100) {
      return res.status(400).json({ error: 'Number of floors must be a whole number between 1 and 100' });
    }
    if (b.soilType && !SOIL_PRESETS[b.soilType] && !isPositive(b.customSbcTM2)) {
      return res.status(400).json({ error: `Unknown soil type "${b.soilType}"` });
    }
    if (b.customSbcTM2 !== undefined && b.customSbcTM2 !== '' && !isPositive(b.customSbcTM2)) {
      return res.status(400).json({ error: 'Custom soil bearing capacity must be a positive number' });
    }
    const concreteGrade = b.concreteGrade || 'M20';
    if (!NOMINAL_MIXES[concreteGrade]) {
      return res.status(400).json({ error: `Unknown concrete grade "${concreteGrade}"` });
    }

    const common = {
      builtUpArea: Number(b.builtUpArea),
      floors: Number(b.floors),
      soilType: b.soilType,
      customSbcTM2: b.customSbcTM2 !== '' ? b.customSbcTM2 : undefined,
      concreteGrade,
    };

    let result;
    if (foundationType === 'isolated') {
      if (!isPositive(b.numberOfColumns) || !Number.isInteger(Number(b.numberOfColumns))) {
        return res.status(400).json({ error: 'Number of columns must be a whole number greater than 0' });
      }
      result = calculateIsolatedFooting({ ...common, numberOfColumns: Number(b.numberOfColumns) });
    } else if (foundationType === 'strip') {
      if (!isPositive(b.wallLengthM)) {
        return res.status(400).json({ error: 'Total wall length (in metres) must be a positive number' });
      }
      result = calculateStripFooting({ ...common, wallLengthM: Number(b.wallLengthM) });
    } else {
      result = calculateRaftFoundation({
        ...common,
        plotAreaSqFt: isPositive(b.plotAreaSqFt) ? Number(b.plotAreaSqFt) : undefined,
      });
    }

    const stored = await loadRates();
    const { rates, error } = sanitizeRates(b.rates && typeof b.rates === 'object' ? b.rates : {}, stored);
    if (error) return res.status(400).json({ error });

    const { costBreakdown, totalCost, combinedMaterials } = calculateFoundationCost(result, rates);
    const suggestion = suggestFoundationType({
      floors: common.floors,
      soilType: common.soilType,
      customSbcTM2: common.customSbcTM2,
      constructionType: b.constructionType,
    });

    res.json({ ...result, costBreakdown, totalCost, combinedMaterials, currency: rates.currency, suggestion });
  } catch (err) {
    next(err);
  }
});

router.post('/foundation/pdf', (req, res) => {
  const { result, costBreakdown, totalCost, currency, title } = req.body || {};
  if (!result || typeof result !== 'object' || !costBreakdown || typeof costBreakdown !== 'object') {
    return res.status(400).json({ error: 'Nothing to export: calculate a foundation estimate first.' });
  }
  try {
    streamFoundationPdf(res, {
      title: typeof title === 'string' ? title.slice(0, 120) : undefined,
      result,
      costBreakdown,
      totalCost: Number(totalCost) || 0,
      currency: typeof currency === 'string' && currency ? currency : '₹',
    });
  } catch (err) {
    console.error('Foundation PDF generation failed:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate PDF report.' });
    }
  }
});
router.post('/mix', (req, res) => {
  const { volume, grade = 'M20' } = req.body || {};
  if (!isPositive(volume)) {
    return res.status(400).json({ error: 'Volume must be a positive number' });
  }
  if (!NOMINAL_MIXES[grade]) {
    return res.status(400).json({ error: `Unknown concrete grade "${grade}"` });
  }
  res.json(calculateConcreteMix(Number(volume), grade));
});

// ---- rates --------------------------------------------------------------
router.get('/rates', async (req, res, next) => {
  try {
    res.json(await loadRates());
  } catch (err) {
    next(err);
  }
});

async function updateRatesHandler(req, res, next) {
  try {
    const { rates, error } = sanitizeRates(req.body || {}, await loadRates());
    if (error) return res.status(400).json({ error });
    await writeJson(RATES_FILE, rates);
    res.json(rates);
  } catch (err) {
    next(err);
  }
}
router.put('/rates', updateRatesHandler);
router.post('/rates', updateRatesHandler); // backwards compatible

// ---- projects -----------------------------------------------------------
router.get('/projects', async (req, res, next) => {
  try {
    res.json(await readJson(PROJECTS_FILE, []));
  } catch (err) {
    next(err);
  }
});

router.post('/projects', async (req, res, next) => {
  try {
    const { title, parameters, volume, grade, results } = req.body || {};
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Project title is required' });
    }
    if (!results || typeof results !== 'object') {
      return res.status(400).json({ error: 'Nothing to save: calculate a result first' });
    }

    const isMix = volume !== undefined;
    const project = {
      id: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
      type: isMix ? 'mix' : 'estimate',
      title: title.trim().slice(0, 120),
      ...(isMix ? { volume: Number(volume), grade } : { parameters: parameters || results.parameters || {} }),
      results,
      createdAt: new Date().toISOString(),
    };

    await withProjectsLock(async () => {
      const projects = await readJson(PROJECTS_FILE, []);
      projects.unshift(project);
      await writeJson(PROJECTS_FILE, projects);
    });
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

router.delete('/projects/:id', async (req, res, next) => {
  try {
    const removed = await withProjectsLock(async () => {
      const projects = await readJson(PROJECTS_FILE, []);
      const remaining = projects.filter((p) => p.id !== req.params.id);
      if (remaining.length === projects.length) return false;
      await writeJson(PROJECTS_FILE, remaining);
      return true;
    });
    if (!removed) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

export default router;
