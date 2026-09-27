import React, { useRef, useState } from 'react';
import { analyzePlan } from '../api';

// NVIDIA's hosted vision models only accept JPEG/PNG, and inline base64
// payloads need to stay well under ~180 KB of base64 data. We downscale
// and re-encode as JPEG client-side so almost any photo/scan works.
const MAX_BYTES_IN = 25 * 1024 * 1024; // reject absurdly large source files early
const TARGET_BYTES = 95 * 1024; // ~95 KB raw -> comfortably under the base64 limit
const MAX_DIMENSION = 1600;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image file.'));
    img.src = URL.createObjectURL(file);
  });
}

async function compressToJpeg(file) {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // flatten transparency (PNGs) onto white before JPEG encode
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);

  const toBlob = (quality) =>
    new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

  let quality = 0.82;
  let blob = await toBlob(quality);
  for (let i = 0; i < 6 && blob && blob.size > TARGET_BYTES; i += 1) {
    quality -= 0.12;
    blob = await toBlob(Math.max(quality, 0.25));
  }
  if (!blob) throw new Error('Could not compress that image.');
  return new File([blob], 'plan.jpg', { type: 'image/jpeg' });
}

export default function PlanUpload({ onExtracted }) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState('idle'); // idle | compressing | analyzing | done | error
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const reset = () => {
    setFileName('');
    setStatus('idle');
    setError('');
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus('error');
      setError('Please upload an image of the plan (JPEG or PNG). PDFs are not supported.');
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
    setResult(null);

    try {
      const compressed = await compressToJpeg(file);
      setStatus('analyzing');
      const extracted = await analyzePlan(compressed);
      setResult(extracted);
      setStatus('done');
      onExtracted && onExtracted(extracted);
    } catch (err) {
      console.error(err);
      setStatus('error');
      setError(err.message || 'Could not analyze this plan.');
    }
  };

  // --- Drag & drop handlers ---
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer?.types?.includes('Files')) setIsDragging(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    handleFile(file);
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative bg-indigo-50/60 border-2 rounded-xl p-4 space-y-3 transition-colors ${
        isDragging ? 'border-indigo-400 bg-indigo-100/70' : 'border-indigo-100 border-dashed'
      }`}
    >
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-indigo-100/90 rounded-xl border-2 border-indigo-400 border-dashed pointer-events-none">
          <p className="text-sm font-bold text-indigo-700">Drop the plan image here</p>
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Upload a floor plan (optional)</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Drag and drop an image here, or choose a file. AI reads the plan and fills in the fields
            below — always double-check the numbers it finds.
          </p>
        </div>
        <span className="text-2xl leading-none">📐</span>
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="hidden"
          id="plan-upload-input"
        />
        <label
          htmlFor="plan-upload-input"
          className="cursor-pointer text-sm font-semibold bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 px-4 py-2 rounded-xl transition-colors"
        >
          Choose file
        </label>
        {fileName && <span className="text-xs text-slate-500 truncate max-w-[10rem]">{fileName}</span>}
        {status !== 'idle' && (
          <button
            type="button"
            onClick={reset}
            className="text-xs text-slate-400 hover:text-slate-600 ml-auto"
          >
            Clear
          </button>
        )}
      </div>

      {status === 'compressing' && (
        <p className="text-xs text-indigo-600 font-medium animate-pulse">Preparing image…</p>
      )}
      {status === 'analyzing' && (
        <p className="text-xs text-indigo-600 font-medium animate-pulse">Reading the plan…</p>
      )}

      {status === 'error' && <p className="text-xs text-red-600 font-medium">{error}</p>}

      {status === 'done' && result && (
        <div className="text-xs bg-white border border-indigo-100 rounded-lg p-3 space-y-1.5">
          <p className="font-semibold text-slate-700">
            Filled in below — confidence {Math.round(result.confidence * 100)}%
          </p>
          <p className="text-slate-500">
            Built-up area/floor: <strong className="text-slate-700">{result.builtUpAreaSqFt} sq.ft</strong>
            {' · '}Floors: <strong className="text-slate-700">{result.floors}</strong>
            {' · '}Wall: <strong className="text-slate-700">{result.wallThickness}"</strong>
            {' · '}Grade: <strong className="text-slate-700">{result.concreteGrade}</strong>
            {result.plotAreaSqFt ? (
              <>
                {' · '}Plot: <strong className="text-slate-700">{result.plotAreaSqFt} sq.ft</strong>
              </>
            ) : null}
            {result.rooms && result.rooms.length > 0 ? (
              <>
                {' · '}Rooms detected: <strong className="text-slate-700">{result.rooms.length}</strong>
              </>
            ) : null}
          </p>
          {result.notes && <p className="text-amber-600 italic">{result.notes}</p>}
        </div>
      )}
    </div>
  );
}
