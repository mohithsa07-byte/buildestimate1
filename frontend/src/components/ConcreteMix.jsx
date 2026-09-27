import React, { useState } from 'react';
import { saveProject } from '../api';

export default function ConcreteMix() {
  const [volume, setVolume] = useState(10);
  const [grade, setGrade] = useState('M10');
  const [projectTitle, setProjectTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // Nominal Mix ratios as per IS 456
  const mixes = {
    'M5':   { ratioStr: '1 : 5 : 10',   c: 1, s: 5,   a: 10, wc: 0.60 },
    'M7.5': { ratioStr: '1 : 4 : 8',    c: 1, s: 4,   a: 8,  wc: 0.55 },
    'M10':  { ratioStr: '1 : 3 : 6',    c: 1, s: 3,   a: 6,  wc: 0.50 },
    'M15':  { ratioStr: '1 : 2 : 4',    c: 1, s: 2,   a: 4,  wc: 0.50 },
    'M20':  { ratioStr: '1 : 1.5 : 3', c: 1, s: 1.5, a: 3,  wc: 0.45 },
    'M25':  { ratioStr: '1 : 1 : 2',   c: 1, s: 1,   a: 2,  wc: 0.40 },
  };

  const calculateMix = () => {
    const volNum = Number(volume);
    if (!volNum || volNum <= 0) {
      return { ratioStr: '-', wc: '-', cementBags: 0, sandCft: 0, aggregateCft: 0, waterLitres: 0 };
    }

    const currentMix = mixes[grade] || mixes['M10'];
    const { c, s, a, wc, ratioStr } = currentMix;

    const dryVolume = volNum * 1.54;
    const totalParts = c + s + a;

    // 1. Cement (1 bag = 0.0347 m³)
    const cementVol = (c / totalParts) * dryVolume;
    const cementBags = Math.ceil(cementVol / 0.0347);

    // 2. Sand (1 m³ = 35.3147 cft)
    const sandVol = (s / totalParts) * dryVolume;
    const sandCft = Math.round(sandVol * 35.3147);

    // 3. Aggregate
    const aggregateVol = (a / totalParts) * dryVolume;
    const aggregateCft = Math.round(aggregateVol * 35.3147);

    // 4. Water
    const waterLitres = Math.round(cementBags * 50 * wc);

    return { ratioStr, wc, cementBags, sandCft, aggregateCft, waterLitres };
  };

  const results = calculateMix();

  const handleSave = async (e) => {
    e.preventDefault();
    if (!projectTitle.trim() || !(Number(volume) > 0)) return;

    setIsSaving(true);
    setSaveStatus('');

    try {
      await saveProject({
        title: projectTitle.trim(),
        volume: Number(volume),
        grade,
        results,
      });
      setSaveStatus('Project saved successfully! 🎉');
      setProjectTitle('');
    } catch (err) {
      console.error(err);
      setSaveStatus(err.message || 'Failed to save project.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Form Inputs */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-gray-800 mb-1">Concrete mix design</h2>
          <p className="text-sm text-gray-500 mb-6">
            Nominal mix method (IS 456) — quick material quantities for a given volume of concrete.
          </p>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Volume of concrete required
            </label>
            <div className="flex items-center border rounded-md px-3 py-2 bg-white focus-within:ring-2 focus-within:ring-blue-500">
              <input
                type="number"
                min="0"
                step="any"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                className="w-full outline-none text-gray-700"
                placeholder="Enter volume"
              />
              <span className="text-gray-400 text-sm ml-2">m³</span>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Concrete grade
            </label>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-gray-700 bg-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="M5">M5</option>
              <option value="M7.5">M7.5</option>
              <option value="M10">M10</option>
              <option value="M15">M15</option>
              <option value="M20">M20</option>
              <option value="M25">M25</option>
            </select>
          </div>

          {/* Save Estimation Section */}
          <form onSubmit={handleSave} className="border-t pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Save Project Estimate
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Project title (e.g. Slab Estimate)"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="flex-1 border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <button
                type="submit"
                disabled={isSaving || !(Number(volume) > 0)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
            {saveStatus && (
              <p className="text-xs mt-2 text-gray-600 font-medium">{saveStatus}</p>
            )}
          </form>
        </div>

        {/* Results Panel */}
        <div className="space-y-4">
          <div className="bg-amber-50/50 p-4 rounded-lg border border-amber-100">
            <span className="text-xs font-semibold tracking-wider text-gray-500 uppercase">MIX RATIO</span>
            <h3 className="text-2xl font-bold text-gray-800 mt-1">
              {grade} – {results.ratioStr}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Water-cement ratio: {results.wc}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-amber-50/50 p-4 rounded-lg border border-amber-100">
              <span className="text-xs font-semibold tracking-wider text-gray-500 uppercase">CEMENT</span>
              <p className="text-xl font-bold text-gray-800 mt-1">{results.cementBags} bags</p>
            </div>
            <div className="bg-amber-50/50 p-4 rounded-lg border border-amber-100">
              <span className="text-xs font-semibold tracking-wider text-gray-500 uppercase">SAND</span>
              <p className="text-xl font-bold text-gray-800 mt-1">{results.sandCft} cft</p>
            </div>
            <div className="bg-amber-50/50 p-4 rounded-lg border border-amber-100">
              <span className="text-xs font-semibold tracking-wider text-gray-500 uppercase">AGGREGATE</span>
              <p className="text-xl font-bold text-gray-800 mt-1">{results.aggregateCft} cft</p>
            </div>
            <div className="bg-amber-50/50 p-4 rounded-lg border border-amber-100">
              <span className="text-xs font-semibold tracking-wider text-gray-500 uppercase">WATER</span>
              <p className="text-xl font-bold text-gray-800 mt-1">{results.waterLitres} L</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}