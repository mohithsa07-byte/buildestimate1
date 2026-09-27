import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import EstimateForm from './components/EstimateForm';
import ResultsDashboard from './components/ResultsDashboard';
import ConcreteMix from './components/ConcreteMix';
import SavedProjects from './components/SavedProjects';
import { calculateEstimate, fetchRates, updateRates } from './api';

export default function App() {
  const [activeTab, setActiveTab] = useState('estimator');
  const [loading, setLoading] = useState(false);
  const [rates, setRates] = useState(null);
  const [estimateResult, setEstimateResult] = useState(null);

  useEffect(() => {
    // Fetch initial rates from backend on load
    fetchRates()
      .then((data) => setRates(data))
      .catch((err) => console.error("Failed to load initial rates:", err));
  }, []);

  const handleCalculate = async (formData) => {
    const { rooms, ...calcParams } = formData;
    setLoading(true);
    try {
      const data = await calculateEstimate({ ...calcParams, rates });
      setEstimateResult({ ...data, rooms: rooms || [] });
    } catch (err) {
      console.error("Calculation failed:", err);
      alert(err.message || "Failed to calculate estimate.");
    } finally {
      setLoading(false);
    }
  };

  const handleRateChange = (key, value) => {
    setRates((prev) => ({
      ...prev,
      [key]: key === 'currency' ? value : Number(value),
    }));
  };

  const handleSaveRates = async () => {
    try {
      await updateRates(rates);
      alert("Material unit rates saved successfully!");
    } catch (err) {
      console.error("Failed to save rates:", err);
      alert(err.message || "Could not update rates on server.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      {/* Header with activeTab and setActiveTab passed as props */}
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {activeTab === 'estimator' && (
          <>
            <Hero
              onStart={() =>
                document.getElementById('estimate-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Form Column */}
              <div id="estimate-form" className="lg:col-span-5 scroll-mt-20">
                <EstimateForm
                  onCalculate={handleCalculate}
                  loading={loading}
                  calculatedResults={estimateResult}
                />
              </div>

              {/* Dashboard / Empty State Column */}
              <div className="lg:col-span-7">
                {estimateResult ? (
                  <ResultsDashboard result={estimateResult} rates={rates} />
                ) : (
                  <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center flex flex-col items-center justify-center h-full min-h-[380px] shadow-sm">
                    <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4 text-3xl font-bold shadow-inner">
                      🏗️
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">No Estimate Generated Yet</h3>
                    <p className="text-slate-500 text-sm max-w-md leading-relaxed">
                      Fill out your plot size, floors, and dimensions on the left form, then click <strong className="text-slate-700">Calculate Material & Cost Estimate</strong> to see a full breakdown.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Material Rates Configuration Tab */}
        {activeTab === 'rates' && rates && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800 tracking-tight">Material Unit Rates (INR)</h2>
                <p className="text-sm text-slate-500">Update current unit prices to align with local Indian market rates.</p>
              </div>
              <button
                onClick={handleSaveRates}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition shadow-md text-sm"
              >
                Save Rates
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(rates).map(([key, val]) => {
                if (key === 'currency') return null;
                return (
                  <div key={key} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      {key.replace(/([A-Z])/g, ' $1')}
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-bold">₹</span>
                      <input
                        type="number"
                        value={val}
                        onChange={(e) => handleRateChange(key, e.target.value)}
                        className="w-full pl-8 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-bold text-slate-800 bg-white"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Concrete Mix Calculator Tab */}
        {activeTab === 'concrete' && <ConcreteMix />}

        {/* Saved Estimates Tab */}
        {activeTab === 'saved' && <SavedProjects />}
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-400 font-medium">
          BuildEstimate — Civil Engineering Construction Material & Cost Estimator Framework
        </div>
      </footer>
    </div>
  );
}