import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchSoilTypes,
  recommendFoundation,
  downloadFoundationPdf,
  saveProject,
} from '../api';
import SoilReportUpload from './SoilReportUpload';

const CONCRETE_GRADES = ['M15', 'M20', 'M25'];

const STATUS_STYLE = {
  recommended: { label: 'Best value', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  alternative: { label: 'Also workable', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  not_suitable: { label: 'Not suitable', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
};

const inr = (n, cur = '₹') => `${cur}${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

export default function FoundationAdvisor({ rates }) {
  const [soilTypes, setSoilTypes] = useState([]);
  const [form, setForm] = useState({
    builtUpArea: 1000,
    floors: 2,
    constructionType: 'framed',
    soilType: 'medium_clay',
    customSbcTM2: '',
    concreteGrade: 'M20',
    numberOfColumns: '',
    wallLengthM: '',
    plotAreaSqFt: '',
    foundingDepthM: '',
    excavationRatePerM3: '',
  });
  const [soilTab, setSoilTab] = useState('preset'); // preset | custom | report
  const [reportCtx, setReportCtx] = useState(null); // confirmed soil-report values
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  const customSbcValid =
    Number(form.customSbcTM2) > 0 && Number(form.customSbcTM2) <= 150;
  const soilReady =
    soilTab === 'preset' ||
    (soilTab === 'custom' && customSbcValid) ||
    (soilTab === 'report' && reportCtx);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!soilReady) return;
    setError('');
    setLoading(true);
    setSaveStatus('');
    try {
      const payload = {
        builtUpArea: Number(form.builtUpArea),
        floors: Number(form.floors),
        constructionType: form.constructionType,
        concreteGrade: form.concreteGrade,
        numberOfColumns: form.numberOfColumns,
        wallLengthM: form.wallLengthM,
        plotAreaSqFt: form.plotAreaSqFt,
        foundingDepthM: form.foundingDepthM,
        excavationRatePerM3: form.excavationRatePerM3,
        rates,
      };
      if (soilTab === 'preset') {
        payload.soilType = form.soilType;
      } else if (soilTab === 'custom') {
        payload.customSbcTM2 = Number(form.customSbcTM2);
      } else {
        payload.customSbcTM2 = reportCtx.sbcTM2;
        payload.soilDescription = reportCtx.soilDescription;
        payload.reportRecommendation = reportCtx.reportRecommendation;
        if (reportCtx.waterTableDepthM != null) payload.waterTableDepthM = reportCtx.waterTableDepthM;
      }
      const data = await recommendFoundation(payload);
      setResult({ ...data, soilSource: soilTab });
    } catch (err) {
      setError(err.message || 'Could not compare foundations.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [form, rates, soilReady, soilTab, reportCtx]);

  const best = result ? result.options.find((o) => o.type === result.recommended) : null;

  const handleDownloadPdf = () => {
    if (!best) return;
    const r = best.result;
    downloadFoundationPdf({
      title: `${best.label} — Recommended Foundation Estimate`,
      result: r,
      costBreakdown: r.costBreakdown,
      totalCost: r.totalCost,
      currency: r.currency,
    }).catch((err) => alert(err.message || 'Failed to download PDF.'));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!projectTitle.trim() || !best) return;
    setIsSaving(true);
    setSaveStatus('');
    try {
      await saveProject({
        title: projectTitle.trim(),
        parameters: {
          foundationType: best.type,
          builtUpArea: result.inputs.builtUpArea,
          floors: result.inputs.floors,
          constructionType: result.inputs.constructionType,
          sbcTM2: result.inputs.sbcTM2,
        },
        results: {
          ...best.result,
          advisor: {
            headline: result.headline,
            comparison: result.options.map((o) => ({
              type: o.type, label: o.label, status: o.status, totalCost: o.totalCost,
            })),
          },
        },
      });
      setSaveStatus('Saved! 🎉');
      setProjectTitle('');
    } catch (err) {
      setSaveStatus(err.message || 'Failed to save.');
    } finally {
      setIsSaving(false);
    }
  };

  const tabBtn = (id, label) => (
    <button
      type="button"
      onClick={() => setSoilTab(id)}
      className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition ${
        soilTab === id ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* ---------------- Form ---------------- */}
      <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-bold text-slate-800 mb-1">Find the best foundation</h2>
        <p className="text-sm text-slate-500 mb-5">
          Tell us about the building and soil. We size isolated, strip and raft foundations side by side and
          rank the ones that suit your building by cost.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">How is the building built?</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['framed', 'RCC frame', 'Columns + beams carry the load'],
                ['load_bearing', 'Load-bearing walls', 'Masonry walls carry the load'],
              ].map(([id, label, hint]) => (
                <button key={id} type="button" onClick={() => update('constructionType', id)}
                  className={`text-left p-2.5 rounded-xl border transition ${
                    form.constructionType === id
                      ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}>
                  <div className="text-sm font-bold text-slate-800">{label}</div>
                  <div className="text-[11px] text-slate-500">{hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Soil */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
            <label className="text-xs font-semibold text-slate-600">Soil bearing capacity</label>
            <div className="flex gap-1 bg-slate-200/60 p-1 rounded-xl">
              {tabBtn('preset', 'Soil type')}
              {tabBtn('custom', 'I know the SBC')}
              {tabBtn('report', 'Upload soil report (AI)')}
            </div>

            {soilTab === 'preset' && (
              <select value={form.soilType} onChange={(e) => update('soilType', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500">
                {soilTypes.map((s) => (
                  <option key={s.key} value={s.key}>{s.label} (~{s.sbcTM2} t/m²)</option>
                ))}
              </select>
            )}

            {soilTab === 'custom' && (
              <div className="flex items-center border rounded-lg px-3 py-2 bg-white">
                <input type="number" min="0" step="any" value={form.customSbcTM2}
                  onChange={(e) => update('customSbcTM2', e.target.value)}
                  placeholder="e.g. 15" className="w-full outline-none text-sm" />
                <span className="text-xs text-slate-400 ml-2 whitespace-nowrap">t/m²</span>
              </div>
            )}

            {soilTab === 'report' && (
              <SoilReportUpload
                onConfirm={setReportCtx}
                onClear={() => setReportCtx(null)}
              />
            )}

            <p className="text-[11px] text-slate-400">
              1 kg/cm² = 10 t/m² ≈ 98 kN/m². Preset values are typical ranges — a real soil test is always better.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Concrete grade (footing)</label>
            <select value={form.concreteGrade} onChange={(e) => update('concreteGrade', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500">
              {CONCRETE_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <button type="button" onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
            {showAdvanced ? '− Hide' : '+ Show'} advanced options
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
              {[
                ['numberOfColumns', 'Number of columns', 'Auto-estimated'],
                ['wallLengthM', 'Load-bearing wall length (m)', 'Auto-estimated'],
                ['plotAreaSqFt', 'Plot / footprint area (sq.ft)', 'Same as built-up'],
                ['foundingDepthM', 'Founding depth (m)', '1.5'],
                ['excavationRatePerM3', 'Excavation rate (₹/m³)', '350'],
              ].map(([key, label, ph]) => (
                <div key={key}>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">{label}</label>
                  <input type="number" min="0" step="any" value={form[key]} placeholder={ph}
                    onChange={(e) => update(key, e.target.value)}
                    className="w-full border rounded-lg px-2.5 py-1.5 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              ))}
              <p className="col-span-2 text-[11px] text-slate-400">
                Leave blank to use the defaults shown. The excavation rate is indicative — set it for your city.
              </p>
            </div>
          )}

          <button type="submit" disabled={loading || !soilReady}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition shadow-sm disabled:opacity-50">
            {loading ? 'Comparing…' : 'Find the best foundation'}
          </button>
          {soilTab === 'report' && !reportCtx && (
            <p className="text-xs text-amber-600">Upload a soil report and confirm the value to continue.</p>
          )}
          {soilTab === 'custom' && !customSbcValid && (
            <p className="text-xs text-amber-600">Enter a bearing capacity between 0 and 150 t/m².</p>
          )}
          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
        </form>
      </div>

      {/* ---------------- Results ---------------- */}
      <div className="lg:col-span-7">
        {!result ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center flex flex-col items-center justify-center h-full min-h-[380px] shadow-sm">
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4 text-3xl">🧭</div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">No comparison yet</h3>
            <p className="text-slate-500 text-sm max-w-md">
              Enter your building and soil details (or upload a soil report) to see which foundation gives the best
              value, and why.
            </p>
          </div>
        ) : (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
            {/* Recommendation */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Recommended</span>
              <h3 className="text-xl font-black text-slate-900 mt-0.5">{best.label}</h3>
              <p className="text-sm text-slate-600 mt-0.5">
                {inr(best.totalCost, result.currency)} <span className="text-slate-400">(materials + excavation)</span>
              </p>
              <ul className="mt-3 space-y-1 text-sm text-slate-700 list-disc pl-5">
                {result.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>

            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <strong>{result.inputs.soil.label}</strong> — {result.inputs.sbcTM2} t/m²
              {result.soilSource === 'report' ? ' (from your soil report)' : ''} · building load ≈{' '}
              {Math.round(result.inputs.totalLoadKN).toLocaleString('en-IN')} kN · founding depth {result.inputs.foundingDepthM} m
            </div>

            {result.warnings.length > 0 && (
              <div className="space-y-2">
                {result.warnings.map((w, i) => (
                  <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                    <strong>Check:</strong> {w}
                  </div>
                ))}
              </div>
            )}

            {/* Comparison */}
            <div>
              <h4 className="text-sm font-bold text-slate-800 mb-2">Side-by-side comparison</h4>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs min-w-[560px]">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left p-2.5 font-semibold">Foundation</th>
                      <th className="text-right p-2.5 font-semibold">Concrete</th>
                      <th className="text-right p-2.5 font-semibold">Steel</th>
                      <th className="text-right p-2.5 font-semibold">Dig</th>
                      <th className="text-right p-2.5 font-semibold">Materials</th>
                      <th className="text-right p-2.5 font-semibold">Excav.</th>
                      <th className="text-right p-2.5 font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.options.map((o) => {
                      const st = STATUS_STYLE[o.status];
                      const muted = o.status === 'not_suitable';
                      return (
                        <React.Fragment key={o.type}>
                          <tr className={`border-t border-slate-100 ${muted ? 'text-slate-400' : 'text-slate-800'}`}>
                            <td className="p-2.5">
                              <div className="font-bold">{o.label}</div>
                              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${st.cls}`}>
                                {st.label}
                              </span>
                              <div className="text-[11px] text-slate-500 mt-1">{o.sizing}</div>
                            </td>
                            <td className="p-2.5 text-right whitespace-nowrap">{o.concreteM3} m³</td>
                            <td className="p-2.5 text-right whitespace-nowrap">{o.steelTons} t</td>
                            <td className="p-2.5 text-right whitespace-nowrap">{o.excavationM3} m³</td>
                            <td className="p-2.5 text-right whitespace-nowrap">{inr(o.materialCost, result.currency)}</td>
                            <td className="p-2.5 text-right whitespace-nowrap">{inr(o.excavationCost, result.currency)}</td>
                            <td className="p-2.5 text-right font-bold whitespace-nowrap">{inr(o.totalCost, result.currency)}</td>
                          </tr>
                          <tr className={muted ? 'text-slate-400' : 'text-slate-500'}>
                            <td colSpan={7} className="px-2.5 pb-2.5 text-[11px]">
                              {o.notes.join(' ')}
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">{result.costNote}</p>
            </div>

            {/* What if the soil is different */}
            <div className="text-xs text-slate-600 bg-indigo-50/60 border border-indigo-100 rounded-xl p-3">
              <strong>If the soil turns out different:</strong> {result.sensitivity.summary}
            </div>

            <p className="text-[11px] text-slate-400">
              Assumed {result.assumptions.numberOfColumns} columns
              {result.assumptions.columnsEstimated ? ' (estimated)' : ''} and {result.assumptions.wallLengthM} m of
              load-bearing wall{result.assumptions.wallLengthEstimated ? ' (estimated)' : ''}. Excavation at{' '}
              {inr(result.inputs.excavationRatePerM3, result.currency)}/m³.
            </p>

            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-[11px] text-red-700">
              {result.disclaimer}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <button onClick={handleDownloadPdf}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-lg transition">
                Download PDF (recommended)
              </button>
            </div>

            <form onSubmit={handleSave} className="flex gap-2">
              <input type="text" placeholder="Project title (e.g. Site A Foundation)" value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)} required
                className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
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
  );
}
