/**
 * Soil report reader.
 * Sends an image of a soil investigation / geotechnical report page to the
 * NVIDIA-hosted vision model and extracts the bearing-capacity values printed
 * on it.
 *
 * Design rule: the model only TRANSCRIBES what is printed (value + unit +
 * depth). Unit conversion, plausibility checks and choosing a default are done
 * here in code, and the user confirms the value in the UI before it is used.
 */

import { getModel, DEFAULT_MODEL } from './planAnalysis.js';

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const MAX_BASE64_CHARS = 180_000;
const FETCH_TIMEOUT_MS = Number(process.env.NVIDIA_TIMEOUT_MS) || 45_000;

const MIN_PLAUSIBLE_T_M2 = 1;
const MAX_PLAUSIBLE_T_M2 = 150;
const KN_PER_TONNE = 9.81;

const SYSTEM_PROMPT = `You are a JSON API for a civil-engineering tool. You are shown an image of a page
from a soil investigation / geotechnical report (it may be a table, a scan or a photo).
Find the safe or allowable bearing capacity (SBC) values the report states.

Reply with ONE JSON object and nothing else, with exactly these keys:
{"readings":[{"label":string|null,"depthM":number|null,"value":number,"unit":string}],
 "soilDescription":string|null,"waterTableDepthM":number|null,
 "reportRecommendation":string|null,"confidence":number,"notes":string}

Rules:
- readings: every safe/allowable bearing capacity value printed on the page, at most 8. Give the unit
  exactly as printed (for example "kN/m2", "kPa", "t/m2", "kg/cm2", "MPa"). Include the depth in metres
  and the borehole / test-pit label if shown.
- Copy numbers exactly as printed. Do NOT convert units, calculate or estimate. If a number is not
  clearly printed, leave it out.
- If the page shows no bearing capacity value, return "readings": [] and say so in notes.
- soilDescription: one short phrase for the soil strata if stated (e.g. "medium dense silty sand"), else null.
- waterTableDepthM: depth to groundwater in metres if stated, else null.
- reportRecommendation: the foundation type/depth the report itself recommends, if stated, else null.
- confidence: 0 to 1 for how legible and unambiguous the values were.
- notes: one short sentence; mention any ambiguity.`;

// ---- Pure helpers (exported so they can be tested without the network) -------

export function normalizeUnit(raw) {
  if (!raw) return null;
  const u = String(raw).toLowerCase().replace(/²/g, '2').replace(/[\s.^]/g, '');
  if (/kpa/.test(u) || /kn/.test(u)) return 'kn_m2';
  if (/(kgf|kg)/.test(u) && /cm/.test(u)) return 'kg_cm2';
  if (/mpa/.test(u) || /n\/mm2/.test(u)) return 'mpa';
  if (/^(t|ton|tons|tonne|tonnes|mt)\/?(sq)?m(2|etre|eter)?$/.test(u) || /^t\/?sqm$/.test(u)) return 't_m2';
  return null;
}

export function toTonnesPerM2(value, unitKey) {
  switch (unitKey) {
    case 'kn_m2': return value / KN_PER_TONNE;
    case 't_m2': return value;
    case 'kg_cm2': return value * 10;
    case 'mpa': return (value * 1000) / KN_PER_TONNE;
    default: return null;
  }
}

function extractJson(text) {
  const cleaned = String(text).replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in model response');
  return JSON.parse(cleaned.slice(start, end + 1));
}

const cleanText = (v, max = 200) => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
  return t || null;
};
const numOrNull = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
};

/** Turns the model's raw JSON into validated, unit-converted readings. */
export function sanitizeSoilExtraction(raw) {
  const list = Array.isArray(raw?.readings) ? raw.readings.slice(0, 8) : [];
  const readings = [];
  for (const r of list) {
    const value = numOrNull(r?.value);
    const unitKey = normalizeUnit(r?.unit);
    if (value === null || value <= 0 || !unitKey) continue;
    const sbcTM2 = toTonnesPerM2(value, unitKey);
    const plausible = sbcTM2 >= MIN_PLAUSIBLE_T_M2 && sbcTM2 <= MAX_PLAUSIBLE_T_M2;
    readings.push({
      label: cleanText(r?.label, 60),
      depthM: numOrNull(r?.depthM),
      printedValue: value,
      printedUnit: cleanText(r?.unit, 20),
      sbcTM2: Math.round(sbcTM2 * 10) / 10,
      plausible,
    });
  }

  const usable = readings.filter((r) => r.plausible);
  // Conservative default: the lowest plausible value on the page
  const defaultSbcTM2 = usable.length ? Math.min(...usable.map((r) => r.sbcTM2)) : null;

  const conf = numOrNull(raw?.confidence);
  return {
    readings,
    defaultSbcTM2,
    soilDescription: cleanText(raw?.soilDescription),
    waterTableDepthM: numOrNull(raw?.waterTableDepthM),
    reportRecommendation: cleanText(raw?.reportRecommendation, 240),
    confidence: conf === null ? 0.5 : Math.max(0, Math.min(1, conf)),
    notes: cleanText(raw?.notes, 240) || '',
  };
}

// ---- Network call ---------------------------------------------------------------

async function callNvidia(apiKey, dataUrl, { withJsonMode, model }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract the bearing capacity values from this soil report page as instructed. Reply with the JSON object only.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    max_tokens: 1500,
    temperature: 0.1,
    top_p: 0.7,
  };
  if (withJsonMode) body.response_format = { type: 'json_object' };

  try {
    return await fetch(NVIDIA_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (fetchErr) {
    if (fetchErr.name === 'AbortError') {
      const err = new Error(`NVIDIA API took too long to respond (${model}). Try again or enter the value manually.`);
      err.status = 504;
      err.code = 'TIMEOUT';
      throw err;
    }
    const err = new Error(`Could not reach NVIDIA API: ${fetchErr.message}`);
    err.status = 502;
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * @param {Buffer} fileBuffer
 * @param {string} mimetype
 * @returns {Promise<object>} sanitized extraction (see sanitizeSoilExtraction)
 */
export async function analyzeSoilReport(fileBuffer, mimetype) {
  if (!ACCEPTED_MIME_TYPES.has(mimetype)) {
    const err = new Error('Unsupported file type. Upload a JPEG or PNG image of the soil report page.');
    err.status = 400;
    throw err;
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    const err = new Error('Soil report reading is not configured on this server (missing NVIDIA_API_KEY).');
    err.status = 503;
    throw err;
  }

  const base64Data = fileBuffer.toString('base64');
  if (base64Data.length > MAX_BASE64_CHARS) {
    const err = new Error('Image is too large for inline analysis. Please upload a smaller or cropped image.');
    err.status = 413;
    throw err;
  }
  const dataUrl = `data:${mimetype};base64,${base64Data}`;

  const selectedModel = getModel();

  async function attemptCall(model) {
    let resp = await callNvidia(apiKey, dataUrl, { withJsonMode: true, model });
    if (resp.status === 400) resp = await callNvidia(apiKey, dataUrl, { withJsonMode: false, model });
    return resp;
  }

  let response;
  try {
    response = await attemptCall(selectedModel);
    if (!response.ok && response.status === 404 && selectedModel !== DEFAULT_MODEL) {
      console.warn(`Model "${selectedModel}" returned 404 on NVIDIA API. Falling back to "${DEFAULT_MODEL}"...`);
      response = await attemptCall(DEFAULT_MODEL);
    }
  } catch (err) {
    if (err.code === 'TIMEOUT' && selectedModel !== DEFAULT_MODEL) {
      console.warn(`Model "${selectedModel}" timed out on NVIDIA API. Falling back to "${DEFAULT_MODEL}"...`);
      response = await attemptCall(DEFAULT_MODEL);
    } else {
      throw err;
    }
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    const err = new Error(`NVIDIA API error (${response.status}): ${bodyText.slice(0, 300)}`);
    err.status = 502;
    throw err;
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    const err = new Error('Model returned no readable text');
    err.status = 502;
    throw err;
  }

  let raw;
  try {
    raw = extractJson(text);
  } catch {
    const err = new Error("Couldn't read a clear result from this page. Try a sharper image of the page with the bearing capacity table, or enter the value manually.");
    err.status = 422;
    throw err;
  }

  const extracted = sanitizeSoilExtraction(raw);
  if (!extracted.readings.some((r) => r.plausible)) {
    const err = new Error(
      extracted.readings.length
        ? 'Found numbers, but none looked like a realistic bearing capacity. Check the units on the report and enter the value manually.'
        : "Couldn't find a bearing capacity value on this page. Try the page with the SBC table, or enter the value manually."
    );
    err.status = 422;
    throw err;
  }
  return extracted;
}
