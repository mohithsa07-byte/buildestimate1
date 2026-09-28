import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchSoilTypes,
  calculateFoundation,
  downloadFoundationPdf,
  saveProject,
} from '../api';

const FOUNDATION_TYPES = [
  { id: 'isolated', label: 'Isolated Footing', hint: 'RCC-framed buildings, individual columns' },
  { id: 'strip', label: 'Strip Footing', hint: 'Load-bearing wall construction' },
  { id: 'raft', label: 'Raft (Mat)', hint: 'Poor soil, heavy loads, basements' },
];

const FOUNDATION_LABELS = { isolated: 'Isolated (Pad) Footing', strip: 'Strip (Wall) Footing', raft: 'Raft (Mat) Foundation' };

const CONCRETE_GRADES = ['M15', 'M20', 'M25'];

export default function FoundationEstimator({ rates }) {
  const [foundationType, setFoundationType] = useState('isolated');
  const [soilTypes, setSoilTypes] = useState([]);
  const [form, setForm] = useState({
    builtUpArea: 1000,
    floors: 2,
    soilType: 'medium_clay',
    useCustomSbc: false,
    customSbcTM2: '',
    concreteGrade: 'M20',
    numberOfColumns: 12,
    wallLengthM: 40,
    plotAreaSqFt: '',
    constructionType: 'framed',
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSoilTypes().then(setSoilTypes).catch(() => {});
  }, []);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleCalculate = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        foundationType,
        builtUpArea: Number(form.builtUpArea),
        floors: Number(form.floors),
        concreteGrade: form.concreteGrade,
        constructionType: form.constructionType,
        rates,
        ...(form.useCustomSbc
          ? { customSbcTM2: Number(form.customSbcTM2) }
          : { soilType: form.soilType }),
        ...(foundationType === 'isolated' ? { numberOfColumns: Number(form.numberOfColumns) } : {}),
        ...(foundationType === 'strip' ? { wallLengthM: Number(form.wallLengthM) } : {}),
        ...(foundationType === 'raft' && form.plotAreaSqFt ? { plotAreaSqFt: Number(form.plotAreaSqFt) } : {}),
      };
      const data = await calculateFoundation(payload);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Calculation failed.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [foundationType, form, rates]);

  const handleDownloadPdf = () => {
    if (!result) return;
    downloadFoundationPdf({
      title: `${FOUNDATION_LABELS[result.foundationType]} Estimate`,
      result,
      costBreakdown: result.costBreakdown,
      totalCost: result.totalCost,
      currency: result.currency,
    }).catch((err) => alert(err.message || 'Failed to download PDF.'));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!projectTitle.trim() || !result) return;
    setIsSaving(true);
    setSaveStatus('');
    try {
      await saveProject({ title: projectTitle.trim(), parameters: { foundationType }, results: result });
      setSaveStatus('Saved! 🎉');
      setProjectTitle('');
    } catch (err) {
      setSaveStatus(err.message || 'Failed to save.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form */}
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-1">Foundation estimator</h2>
          <p className="text-sm text-slate-500 mb-5">
            Thumb-rule preliminary sizing for isolated, strip, or raft foundations.
          </p>

          {/* Type selector */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            {FOUNDATION_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setFoundationType(t.id);
                  update('constructionType', t.id === 'strip' ? 'load_bearing' : 'framed');
                  setResult(null);
                }}
                className={`text-left p-3 rounded-xl border transition ${
                  foundationType === t.id
                    ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="text-sm font-bold text-slate-800">{t.label}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{t.hint}</div>
              </button>
            ))}
          </div>

          <form onSubmit={handleCalculate} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Built-up area / floor (sq.ft)</label>
                <input type="number" min="1" required value={form.builtUpArea}
                  onChange={(e) => update('builtUpArea', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Number of floors</label>
                <input type="number" min="1" max="100" required value={form.floors}
                  onChange={(e) => update('floors', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>

            {foundationType === 'isolated' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Number of columns</label>
                <input type="number" min="1" required value={form.numberOfColumns}
                  onChange={(e) => update('numberOfColumns', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            )}
            {foundationType === 'strip' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Total load-bearing wall length (m)</label>
                <input type="number" min="1" step="any" required value={form.wallLengthM}
                  onChange={(e) => update('wallLengthM', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            )}
            {foundationType === 'raft' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Plot / footprint area (sq.ft) — optional</label>
                <input type="number" min="0" value={form.plotAreaSqFt}
                  placeholder="Defaults to built-up area"
                  onChange={(e) => update('plotAreaSqFt', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            )}

            {/* Soil */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-600">Soil type / bearing capacity</label>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                  <input type="checkbox" checked={form.useCustomSbc}
                    onChange={(e) => update('useCustomSbc', e.target.checked)} />
                  Enter custom SBC
                </label>
              </div>
              {form.useCustomSbc ? (
                <div className="flex items-center border rounded-lg px-3 py-2 bg-white">
                  <input type="number" min="0" step="any" required value={form.customSbcTM2}
                    onChange={(e) => update('customSbcTM2', e.target.value)}
                    placeholder="e.g. 15" className="w-full outline-none text-sm" />
                  <span className="text-xs text-slate-400 ml-2 whitespace-nowrap">t/m²</span>
                </div>
              ) : (
                <select value={form.soilType} onChange={(e) => update('soilType', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500">
                  {soilTypes.map((s) => (
                    <option key={s.key} value={s.key}>{s.label} (~{s.sbcTM2} t/m²)</option>
                  ))}
                </select>
              )}
              <p className="text-[11px] text-slate-400">
                Get an actual soil test before construction — this is a typical/indicative value.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Concrete grade (footing)</label>
              <select value={form.concreteGrade} onChange={(e) => update('concreteGrade', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500">
                {CONCRETE_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition shadow-sm disabled:opacity-50">
              {loading ? 'Calculating…' : 'Calculate Foundation Estimate'}
            </button>
            {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
          </form>
        </div>

        {/* Results */}
        <div className="lg:col-span-7">
          {!result ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center flex flex-col items-center justify-center h-full min-h-[380px] shadow-sm">
              <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4 text-3xl">🧱</div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">No Foundation Estimate Yet</h3>
              <p className="text-slate-500 text-sm max-w-md">
                Choose a foundation type, fill in the details, and calculate to see sizing, material quantities and cost.
              </p>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                    {FOUNDATION_LABELS[result.foundationType]}
                  </span>
                  <h3 className="text-2xl font-black text-slate-900 mt-1">
                    {result.currency}{result.totalCost.toLocaleString('en-IN')}
                  </h3>
                  <p className="text-xs text-slate-500">Estimated foundation material cost</p>
                </div>
                <button onClick={handleDownloadPdf}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-lg transition">
                  Download PDF
                </button>
              </div>

              {/* Design basis */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Stat label="Soil bearing capacity" value={`${result.inputs.sbcTM2} t/m²`} />
                <Stat label="Total building load" value={`${result.inputs.totalLoadKN} kN`} />
                {result.foundationType === 'isolated' && (
                  <>
                    <Stat label="Footing size" value={`${result.footing.sideM} × ${result.footing.sideM} m`} />
                    <Stat label="Footing depth" value={`${result.footing.depthM} m`} />
                    <Stat label="No. of columns" value={result.inputs.numberOfColumns} />
                  </>
                )}
                {result.foundationType === 'strip' && (
                  <>
                    <Stat label="Footing width" value={`${result.footing.widthM} m`} />
                    <Stat label="Footing depth" value={`${result.footing.depthM} m`} />
                    <Stat label="Wall length" value={`${result.inputs.wallLengthM} m`} />
                  </>
                )}
                {result.foundationType === 'raft' && (
                  <>
                    <Stat label="Raft area" value={`${result.footing.areaM2} m²`} />
                    <Stat label="Raft thickness" value={`${result.footing.thicknessM} m`} />
                  </>
                )}
              </div>

              {/* Materials */}
              <div className="border-t border-slate-100 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Cement" value={`${result.combinedMaterials.cementBags} bags`} accent />
                <Stat label="Sand" value={`${result.combinedMaterials.sandTons} t`} accent />
                <Stat label="Aggregate" value={`${result.combinedMaterials.aggregateTons} t`} accent />
                <Stat label="Steel" value={`${result.steelTons} t`} accent />
              </div>
              <p className="text-[11px] text-slate-400">
                Includes a {result.pcc.thicknessM * 1000}mm M10 PCC leveling bed ({result.pcc.volumeM3} m³) under the footing.
              </p>

              {result.suggestion && result.suggestion.type !== result.foundationType && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                  <strong>Note:</strong> based on your inputs, a <strong>{FOUNDATION_LABELS[result.suggestion.type]}</strong> may
                  be a better fit — {result.suggestion.reason}
                </div>
              )}

              <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-[11px] text-red-700">
                Preliminary thumb-rule estimate only. Foundation design must be verified by a structural
                engineer using an actual soil investigation report before construction.
              </div>

              {/* Save */}
              <form onSubmit={handleSave} className="border-t border-slate-100 pt-4 flex gap-2">
                <input type="text" placeholder="Project title (e.g. Site A Foundation)" value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" required />
                <button type="submit" disabled={isSaving}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
              </form>
              {saveStatus && <p className="text-xs text-slate-600 font-medium">{saveStatus}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className={`p-3 rounded-xl border ${accent ? 'bg-amber-50/50 border-amber-100' : 'bg-slate-50 border-slate-200'}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-base font-bold text-slate-800 mt-0.5">{value}</div>
    </div>
  );
}