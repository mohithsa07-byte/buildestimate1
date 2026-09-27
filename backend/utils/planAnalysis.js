/**
 * Sends an uploaded floor-plan image to an NVIDIA-hosted vision model
 * (build.nvidia.com) and asks it to extract the numbers EstimateForm needs.
 * Uses the OpenAI-compatible /v1/chat/completions endpoint via global fetch
 * (Node 18+), so no SDK dependency is required.
 */

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
export const DEFAULT_MODEL = 'meta/llama-3.2-11b-vision-instruct';

// Resolves and sanitizes the configured model, defaulting to the fast 11b vision model
export function getModel() {
  const envModel = process.env.NVIDIA_MODEL || '';
  const cleaned = envModel
    .trim()
    .replace(/^NVIDIA_MODEL\s*=\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
  return cleaned || DEFAULT_MODEL;
}

// NVIDIA's hosted VLMs officially support JPG/JPEG/PNG only (no PDF/WEBP),
// and inline base64 payloads are meant to stay under ~180 KB of base64 data
// — larger images need their separate assets-upload API. We keep this
// simple and ask the frontend to downscale/compress before upload instead.
const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const MAX_BASE64_CHARS = 180_000;
const FETCH_TIMEOUT_MS = Number(process.env.NVIDIA_TIMEOUT_MS) || 45_000;

const SYSTEM_PROMPT = `You are a JSON API for a civil-engineering tool. You are shown an architectural
floor plan (a drawing, blueprint, or hand-sketched layout of a building).

Estimate the following about the building:
- plotAreaSqFt: total plot/site area in square feet, if shown or inferable. null if you cannot tell.
- builtUpAreaSqFt: built-up (constructed) area PER FLOOR in square feet. Sum room
  dimensions/wall footprint if there's no explicit built-up area label. If the plan
  gives dimensions in meters or feet-inches, convert to square feet.
- floors: integer number of floors/storeys shown or stated (default 1 if unclear).
- wallThickness: "9" or "4.5" (inches) - use "9" for standard external load-bearing
  walls, "4.5" for thin partition-only plans. Pick the dominant external wall thickness.
- concreteGrade: one of "M10","M15","M20","M25" - your best guess for a residential
  building of this type if not labeled (default "M20").
- rooms: an array of every distinct room/space you can identify on ONE floor of the
  plan (use the ground floor if multiple floors are shown). For each room give:
  {"name": short label like "Bedroom 1" or "Kitchen", "areaSqFt": number}.
  Estimate areaSqFt from the room's labeled dimensions if given, otherwise from its
  visual proportion of the total built-up area. Include every room you can see;
  it's fine to have anywhere from 1 to 15 entries depending on the plan.
- confidence: your confidence in these numbers, from 0 to 1.
- notes: one short sentence (max ~25 words) flagging anything the user should
  double check (e.g. "no scale bar found, area is a rough visual estimate").

STRICT OUTPUT RULES — read carefully:
- Output ONLY a single-line JSON object. Nothing else.
- Do NOT write any explanation, headings, bullet points, or markdown before or after it.
- Do NOT wrap it in \`\`\`json fences.
- Do NOT restate the field descriptions. Just the final values.

Example of a correct, complete response (your entire reply, verbatim, no more no less):
{"plotAreaSqFt":1200,"builtUpAreaSqFt":1200,"floors":2,"wallThickness":"9","concreteGrade":"M20","rooms":[{"name":"Bedroom 1","areaSqFt":225},{"name":"Bedroom 2","areaSqFt":225},{"name":"Living Room","areaSqFt":225},{"name":"Kitchen","areaSqFt":225}],"confidence":0.8,"notes":"no scale bar found"}`;

function extractJson(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in model response');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// --- Fallback for models that answer in prose/markdown instead of JSON ---
// Finds each field by looking for its section heading anywhere in the text
// (however it's phrased) and pulling the first relevant value out of that
// section's own text, rather than requiring an exact "key: value" format.

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, single: 1, double: 2, triple: 3,
};

function splitIntoSections(text) {
  // Split on markdown-style bold headings ("**Heading**", "**Heading:**")
  // or on standalone lines ending in ":" — whichever the model used.
  const parts = text.split(/\*\*([^*]+)\*\*:?/g);
  const sections = {};
  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i].toLowerCase();
    const body = (parts[i + 1] || '').split(/\*\*/)[0];
    sections[heading] = (sections[heading] || '') + ' ' + body;
  }
  return sections;
}

function findSection(sections, keywords) {
  const entry = Object.entries(sections).find(([heading]) =>
    keywords.some((k) => heading.includes(k))
  );
  return entry ? entry[1] : '';
}

// Prefers a number that's explicitly tagged as an area ("1200 sq ft"),
// taking the LAST such match (the final stated total, after any
// intermediate room-by-room math) — falls back to the last plain number
// in the section if no area-tagged one is found.
function lastAreaNumber(str) {
  if (!str) return null;
  const cleaned = str.replace(/,/g, '');
  const areaMatches = [...cleaned.matchAll(/(-?\d+(?:\.\d+)?)\s*(?:sq\.?\s*\.?\s*ft|sqft|square\s*feet|sq\.?\s*m\b|sqm|square\s*met(?:er|re)s?)/gi)];
  if (areaMatches.length) return Number(areaMatches[areaMatches.length - 1][1]);
  const plainMatches = [...cleaned.matchAll(/-?\d+(?:\.\d+)?/g)];
  return plainMatches.length ? Number(plainMatches[plainMatches.length - 1][0]) : null;
}

function firstNumber(str) {
  if (!str) return null;
  const m = str.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function wordOrNumberCount(str) {
  const n = firstNumber(str);
  if (n !== null) return n;
  const lower = (str || '').toLowerCase();
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) return value;
  }
  return null;
}

function extractFieldsFromProse(text) {
  const sections = splitIntoSections(text);

  const plotSec = findSection(sections, ['plot area']);
  const builtUpSec = findSection(sections, ['built-up area', 'built up area', 'builtup area']);
  const floorsSec = findSection(sections, ['number of floors', 'floors']).replace(/"[^"]*"/g, '');
  const wallSec = findSection(sections, ['wall thickness']);
  const gradeSec = findSection(sections, ['concrete grade']);
  const confSec = findSection(sections, ['confidence']);
  const notesSec = findSection(sections, ['notes']);

  const gradeMatch = (gradeSec || text).toUpperCase().match(/M\s?(\d{1,2}(\.\d+)?)/);

  let confidence = firstNumber(confSec);
  if (confidence !== null && confidence > 1) confidence = confidence / 100; // "80%" or "80"
  if (confidence === null) {
    if (/\bhigh\b/i.test(confSec)) confidence = 0.8;
    else if (/\bmedium\b/i.test(confSec)) confidence = 0.5;
    else if (/\blow\b/i.test(confSec)) confidence = 0.3;
  }

  const notes = notesSec
    .replace(/^\s*[:.-]\s*/, '')
    .split(/(?<=[.!?])\s/)[0]
    ?.trim();

  return {
    plotAreaSqFt: lastAreaNumber(plotSec),
    builtUpAreaSqFt: lastAreaNumber(builtUpSec) ?? lastAreaNumber(plotSec),
    floors: wordOrNumberCount(floorsSec),
    wallThickness: (firstNumber(wallSec) ?? '').toString(),
    concreteGrade: gradeMatch ? `M${gradeMatch[1]}` : undefined,
    confidence,
    notes: notes && !/no (additional )?notes|none/i.test(notes) ? notes : '',
  };
}

function sanitizeRooms(rawRooms, builtUpAreaSqFt) {
  if (!Array.isArray(rawRooms)) return [];
  const rooms = rawRooms
    .map((r) => ({
      name: typeof r?.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 40) : null,
      areaSqFt: Number(r?.areaSqFt),
    }))
    .filter((r) => r.name && Number.isFinite(r.areaSqFt) && r.areaSqFt > 0)
    .slice(0, 20)
    .map((r) => ({ name: r.name, areaSqFt: Math.round(r.areaSqFt) }));

  // Sanity check: if the model's room areas add up to something wildly
  // different from the built-up area (e.g. it used a different unit by
  // mistake), the breakdown is more likely to mislead than help — drop it
  // rather than show a room list that doesn't add up.
  const sum = rooms.reduce((a, r) => a + r.areaSqFt, 0);
  if (rooms.length === 0 || !Number.isFinite(builtUpAreaSqFt) || builtUpAreaSqFt <= 0) return rooms;
  const ratio = sum / builtUpAreaSqFt;
  if (ratio < 0.4 || ratio > 2.5) return [];
  return rooms;
}

function sanitizeExtraction(raw) {
  const floors = Math.round(Number(raw.floors));
  const builtUpAreaSqFt = Number(raw.builtUpAreaSqFt);
  const plotAreaSqFt = raw.plotAreaSqFt === null || raw.plotAreaSqFt === undefined
    ? null
    : Number(raw.plotAreaSqFt);

  if (!Number.isFinite(builtUpAreaSqFt) || builtUpAreaSqFt <= 0) {
    throw new Error('Model did not return a usable built-up area');
  }
  if (!Number.isInteger(floors) || floors < 1 || floors > 100) {
    throw new Error('Model did not return a usable floor count');
  }

  return {
    plotAreaSqFt: plotAreaSqFt !== null && Number.isFinite(plotAreaSqFt) && plotAreaSqFt > 0
      ? Math.round(plotAreaSqFt)
      : null,
    builtUpAreaSqFt: Math.round(builtUpAreaSqFt),
    floors,
    wallThickness: raw.wallThickness === '4.5' ? '4.5' : '9',
    concreteGrade: ['M10', 'M15', 'M20', 'M25'].includes(raw.concreteGrade) ? raw.concreteGrade : 'M20',
    rooms: sanitizeRooms(raw.rooms, builtUpAreaSqFt),
    confidence: Number.isFinite(Number(raw.confidence)) ? Math.min(1, Math.max(0, Number(raw.confidence))) : 0.5,
    notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 300) : '',
  };
}

async function callNvidia(apiKey, dataUrl, { withJsonMode, model }) {
  const activeModel = model || getModel();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const body = {
    model: activeModel,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract the building parameters from this floor plan as instructed. Reply with the JSON object only.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    max_tokens: 400,
    temperature: 0.2,
    top_p: 0.7,
  };
  if (withJsonMode) body.response_format = { type: 'json_object' };

  try {
    const response = await fetch(NVIDIA_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    return response;
  } catch (fetchErr) {
    if (fetchErr.name === 'AbortError') {
      const err = new Error(`NVIDIA API took too long to respond (${activeModel}). Check your network connection or try again.`);
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
 * @returns {Promise<object>} sanitized extraction
 */
export async function analyzePlan(fileBuffer, mimetype) {
  if (!ACCEPTED_MIME_TYPES.has(mimetype)) {
    const err = new Error('Unsupported file type. Upload a JPEG or PNG image of the plan.');
    err.status = 400;
    throw err;
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    const err = new Error('Plan analysis is not configured on this server (missing NVIDIA_API_KEY).');
    err.status = 503;
    throw err;
  }

  const base64Data = fileBuffer.toString('base64');
  if (base64Data.length > MAX_BASE64_CHARS) {
    const err = new Error(
      'Image is too large for inline analysis. Please upload a smaller/more compressed image (under ~130 KB).'
    );
    err.status = 413;
    throw err;
  }

  const dataUrl = `data:${mimetype};base64,${base64Data}`;

  const selectedModel = getModel();

  async function attemptCall(modelToUse) {
    let resp = await callNvidia(apiKey, dataUrl, { withJsonMode: true, model: modelToUse });
    if (resp.status === 400) {
      resp = await callNvidia(apiKey, dataUrl, { withJsonMode: false, model: modelToUse });
    }
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
    raw = extractFieldsFromProse(text);
    if (!raw.builtUpAreaSqFt) {
      const err = new Error("Couldn't read a clear result from the plan. Try a clearer image or enter values manually.");
      err.status = 422;
      throw err;
    }
  }

  try {
    return sanitizeExtraction(raw);
  } catch (e) {
    e.status = 422;
    throw e;
  }
}
