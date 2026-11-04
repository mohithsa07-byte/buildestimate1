import React, { useState } from 'react';
import FoundationAdvisor from './FoundationAdvisor';
import FoundationEstimator from './FoundationEstimator';

export default function FoundationHub({ rates }) {
  const [mode, setMode] = useState('advisor'); // advisor | single

  const pill = (id, label) => (
    <button
      type="button"
      onClick={() => setMode(id)}
      className={`px-4 py-2 text-sm font-semibold rounded-xl transition ${
        mode === id ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="max-w-6xl mx-auto px-6 pt-6 flex flex-wrap gap-2">
        {pill('advisor', '🧭 Foundation advisor')}
        {pill('single', '🧱 Single-type calculator')}
      </div>
      {mode === 'advisor' ? (
        <div className="p-6 max-w-6xl mx-auto">
          <FoundationAdvisor rates={rates} />
        </div>
      ) : (
        <FoundationEstimator rates={rates} />
      )}
    </div>
  );
}
