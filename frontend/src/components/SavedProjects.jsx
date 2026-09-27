import React, { useEffect, useState } from 'react';
import { fetchProjects, deleteProject } from '../api';

const inr = (n, currency = '₹') => `${currency}${Number(n || 0).toLocaleString('en-IN')}`;

function Row({ label, value, cost }) {
  return (
    <div className="flex justify-between items-center">
      <span>{label}: <strong>{value}</strong></span>
      {cost !== undefined && <span className="text-gray-600">{cost}</span>}
    </div>
  );
}

function EstimateDetails({ project }) {
  const params = project.parameters || {};
  const r = project.results || {};
  const q = r.quantities || {};
  const c = r.costBreakdown || {};
  const cur = r.currency || '₹';

  return (
    <>
      <div className="text-xs text-gray-500 bg-gray-50 p-2.5 rounded-xl space-y-1">
        {params.plotArea ? <p>Plot Area: <span className="font-semibold text-gray-700">{params.plotArea} sq.ft</span></p> : null}
        {params.builtUpArea ? <p>Built-Up Area / floor: <span className="font-semibold text-gray-700">{Number(params.builtUpArea).toFixed(0)} sq.ft</span></p> : null}
        {params.floors ? <p>Floors: <span className="font-semibold text-gray-700">{params.floors}</span></p> : null}
        {params.wallThickness ? <p>Wall Thickness: <span className="font-semibold text-gray-700">{params.wallThickness}"</span></p> : null}
        {params.concreteGrade ? <p>Concrete Grade: <span className="font-semibold text-gray-700">{params.concreteGrade}</span></p> : null}
      </div>

      <div className="text-xs text-gray-700 space-y-1.5 pt-2 border-t border-gray-100">
        <p className="font-semibold text-gray-900 text-sm mb-1">Breakdown & Quantities:</p>
        <Row label="Cement" value={`${q.cementBags ?? 0} bags`} cost={inr(c.cement, cur)} />
        <Row label="Sand" value={`${q.sandTons ?? 0} t`} cost={inr(c.sand, cur)} />
        <Row label="Aggregate" value={`${q.aggregateTons ?? 0} t`} cost={inr(c.aggregate, cur)} />
        <Row label="Bricks" value={`${(q.brickQuantity ?? 0).toLocaleString('en-IN')} pcs`} cost={inr(c.bricks, cur)} />
        <Row label="Steel" value={`${q.steelKg ?? 0} kg`} cost={inr(c.steel, cur)} />
        <div className="flex justify-between items-center text-gray-500 pt-1.5 border-t border-dashed border-gray-200">
          <span>Labor ({q.laborDays ?? 0} days):</span>
          <span>{inr(c.labor, cur)}</span>
        </div>
        <div className="flex justify-between items-center text-sm font-bold text-emerald-700 pt-2 border-t border-gray-200">
          <span>Total Cost:</span>
          <span>{inr(r.totalCost, cur)}</span>
        </div>
      </div>
    </>
  );
}

function MixDetails({ project }) {
  const r = project.results || {};
  return (
    <>
      <div className="text-xs text-gray-500 bg-gray-50 p-2.5 rounded-xl space-y-1">
        <p>Volume: <span className="font-semibold text-gray-700">{project.volume} m³</span></p>
        <p>Grade: <span className="font-semibold text-gray-700">{project.grade}{r.ratioStr ? ` (${r.ratioStr})` : ''}</span></p>
      </div>
      <div className="text-xs text-gray-700 space-y-1.5 pt-2 border-t border-gray-100">
        <p className="font-semibold text-gray-900 text-sm mb-1">Concrete Mix Quantities:</p>
        <Row label="Cement" value={`${r.cementBags ?? 0} bags`} />
        <Row label="Sand" value={`${r.sandCft ?? 0} cft`} />
        <Row label="Aggregate" value={`${r.aggregateCft ?? 0} cft`} />
        <Row label="Water" value={`${r.waterLitres ?? 0} L`} />
      </div>
    </>
  );
}

export default function SavedProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchProjects();
      setProjects(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load saved projects.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this estimate?')) return;

    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error('Failed to delete project:', err);
      alert(err.message || 'Failed to delete the estimate.');
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  if (loading) return <div className="p-6 text-center text-gray-500">Loading saved estimates...</div>;
  if (error) {
    return (
      <div className="p-6 text-center space-y-3">
        <p className="text-red-500">{error}</p>
        <button onClick={loadProjects} className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded transition-colors">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">Saved Estimates</h2>
        <button
          onClick={loadProjects}
          className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded transition-colors"
        >
          Refresh
        </button>
      </div>

      {projects.length === 0 ? (
        <p className="text-gray-500 text-sm">No saved estimates found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((p) => {
            const isMix = p.type === 'mix' || (p.volume !== undefined && !p.parameters);
            return (
              <div key={p.id} className="bg-white p-5 border rounded-2xl shadow-sm space-y-3 relative group">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg text-gray-800">{p.title}</h3>
                    <p className="text-xs text-gray-400">
                      {isMix ? 'Concrete mix' : 'Building estimate'} ·{' '}
                      {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'Recent'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-xs text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg transition-colors"
                    title="Delete Estimate"
                  >
                    ✕
                  </button>
                </div>
                {isMix ? <MixDetails project={p} /> : <EstimateDetails project={p} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
