import React, { useRef, useState } from 'react';
import { analyzeSoilReport } from '../api';

// The vision API takes JPEG/PNG only and small inline images (~130 KB). Soil
// reports are text-heavy, so keep a larger dimension than the floor-plan
// uploader and shrink quality/size step by step until it fits.
const MAX_BYTES_IN = 25 * 1024 * 1024;
const TARGET_BYTES = 120 * 1024;
const MAX_DIMENSION = 2000;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image file.'));
    img.src = URL.createObjectURL(file);
  });
}

const toBlob = (canvas, quality) =>
  new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

async function compressReport(file) {
  const img = await loadImage(file);
  try {
    let scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    for (let pass = 0; pass < 4; pass += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      let quality = 0.85;
      for (let i = 0; i < 5; i += 1) {
        const blob = await toBlob(canvas, Math.max(quality, 0.3));
        if (blob && blob.size <= TARGET_BYTES) {
          return new File([blob], 'soil-report.jpg', { type: 'image/jpeg' });
        }
        quality -= 0.14;
      }
      scale *= 0.8;
    }
    throw new Error('Could not shrink that image enough. Try cropping to just the bearing capacity table.');
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

/**
 * Props: onConfirm({ sbcTM2, soilDescription, waterTableDepthM, reportRecommendation })
 *        onClear()  — called when the user discards a confirmed value
 */
export default function SoilReportUpload({ onConfirm, onClear }) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState('idle'); // idle | compressing | analyzing | review | confirmed | error
  const [error, setError] = useState('');
  const [extracted, setExtracted] = useState(null);
  const [picked, setPicked] = useState(0);
  const [sbcInput, setSbcInput] = useState('');

  const reset = () => {
    setFileName('');
    setStatus('idle');
    setError('');
    setExtracted(null);
    setPicked(0);
    setSbcInput('');
    if (inputRef.current) inputRef.current.value = '';
    onClear && onClear();
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus('error');
      setError('Please upload a JPEG or PNG image (a photo or screenshot of the report page). PDFs are not supported yet.');
      return;
    }
    if (file.size > MAX_BYTES_IN) {
      setStatus('error');
      setError('File is too large (25 MB max).');
      return;
    }

    setFileName(file.name);
    setStatus('compressing');
    setError('');
    try {
      const compressed = await compressReport(file);
      setStatus('analyzing');
      const data = await analyzeSoilReport(compressed);
      setExtracted(data);
      // Default to the lowest plausible reading (conservative)
      const firstBest = data.readings.findIndex((r) => r.plausible && r.sbcTM2 === data.defaultSbcTM2);
      const idx = firstBest >= 0 ? firstBest : 0;
      setPicked(idx);
      setSbcInput(String(data.readings[idx]?.sbcTM2 ?? data.defaultSbcTM2 ?? ''));
      setStatus('review');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setError(err.message || 'Could not read this soil report.');
    }
  };

  const pickReading = (i) => {
    setPicked(i);
    setSbcInput(String(extracted.readings[i].sbcTM2));
  };

  const sbcValue = Number(sbcInput);
  const sbcValid = Number.isFinite(sbcValue) && sbcValue >= 1 && sbcValue <= 150;

  const confirm = () => {
    if (!sbcValid) return;
    setStatus('confirmed');
    onConfirm({
      sbcTM2: sbcValue,
      soilDescription: extracted.soilDescription || '',
      waterTableDepthM: extracted.waterTableDepthM,
      reportRecommendation: extracted.reportRecommendation || '',
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/*"
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="hidden"
          id="soil-report-input"
        />
        <label
          htmlFor="soil-report-input"
          className="cursor-pointer text-sm font-semibold bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 px-4 py-2 rounded-xl transition-colors"
        >
          {fileName ? 'Choose another' : 'Choose soil report image'}
        </label>
        {fileName && <span className="text-xs text-slate-500 truncate max-w-[10rem]">{fileName}</span>}
        {status !== 'idle' && (
          <button type="button" onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 ml-auto">
            Clear
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-400">
        Upload a photo or screenshot of the report page that shows the safe bearing capacity (SBC) table. Cropping to
        just that table gives the best reading.
      </p>

      {status === 'compressing' && <p className="text-xs text-indigo-600 font-medium animate-pulse">Preparing image…</p>}
      {status === 'analyzing' && <p className="text-xs text-indigo-600 font-medium animate-pulse">Reading the soil report…</p>}
      {status === 'error' && <p className="text-xs text-red-600 font-medium">{error}</p>}

      {status === 'review' && extracted && (
        <div className="bg-white border border-indigo-100 rounded-xl p-3 space-y-3 text-xs">
          <div>
            <p className="font-semibold text-slate-700">
              Here is what the AI read — please check it against your report
            </p>
            <p className="text-slate-400">AI can misread digits or units. Confidence {Math.round(extracted.confidence * 100)}%.</p>
          </div>

          <div className="space-y-1.5">
            {extracted.readings.map((r, i) => (
              <label
                key={i}
                className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${
                  picked === i ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'
                } ${r.plausible ? '' : 'opacity-50 cursor-not-allowed'}`}
              >
                <input
                  type="radio"
                  name="soil-reading"
                  checked={picked === i}
                  disabled={!r.plausible}
                  onChange={() => pickReading(i)}
                  className="mt-0.5"
                />
                <span className="text-slate-700">
                  {r.label ? <strong>{r.label}</strong> : 'Reading'}
                  {r.depthM != null ? ` · ${r.depthM} m deep` : ''}
                  <br />
                  Printed: {r.printedValue} {r.printedUnit} → <strong>{r.sbcTM2} t/m²</strong>
                  {!r.plausible && <span className="text-red-600"> (unrealistic — ignored)</span>}
                </span>
              </label>
            ))}
          </div>

          <div>
            <label className="block font-semibold text-slate-600 mb-1">Bearing capacity to use (t/m²)</label>
            <input
              type="number"
              step="any"
              min="1"
              max="150"
              value={sbcInput}
              onChange={(e) => setSbcInput(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-slate-400 mt-1">
              The lowest reading is pre-selected because it is the safest choice. You can edit it.
            </p>
          </div>

          {(extracted.soilDescription || extracted.waterTableDepthM != null || extracted.reportRecommendation) && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-0.5 text-slate-600">
              {extracted.soilDescription && <p>Soil: <strong>{extracted.soilDescription}</strong></p>}
              {extracted.waterTableDepthM != null && <p>Water table: <strong>{extracted.waterTableDepthM} m</strong></p>}
              {extracted.reportRecommendation && <p>Report recommends: <strong>{extracted.reportRecommendation}</strong></p>}
            </div>
          )}
          {extracted.notes && <p className="text-amber-600 italic">{extracted.notes}</p>}

          <button
            type="button"
            onClick={confirm}
            disabled={!sbcValid}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg disabled:opacity-50"
          >
            Use {sbcValid ? `${sbcValue} t/m²` : 'this value'}
          </button>
        </div>
      )}

      {status === 'confirmed' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800">
          Using <strong>{sbcValue} t/m²</strong> from your soil report. Click <em>Clear</em> to choose a different one.
        </div>
      )}
    </div>
  );
}
