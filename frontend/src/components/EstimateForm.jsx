import React, { useState } from 'react';
import { saveProject } from '../api';
import PlanUpload from './PlanUpload';

const SQFT_PER_SQM = 10.7639;
const FT_PER_M = 3.28084;
const GRADES = ['M10', 'M15', 'M20', 'M25'];

const fmt = (n, d = 1) => (Number.isFinite(n) ? Number(n.toFixed(d)).toString() : '-');

export default function EstimateForm({ calculatedResults, onCalculate, loading = false }) {
  const [plotArea, setPlotArea] = useState(1200);
  const [builtUpArea, setBuiltUpArea] = useState(1000);
  const [floors, setFloors] = useState(2);
  const [floorHeight, setFloorHeight] = useState(10);
  const [wallThickness, setWallThickness] = useState('9');
  const [concreteGrade, setConcreteGrade] = useState('M20');
  const [includePlastering, setIncludePlastering] = useState(true);

  // Unit toggles
  const [areaUnit, setAreaUnit] = useState('sq.ft');
  const [heightUnit, setHeightUnit] = useState('ft');

  // Save State
  const [projectTitle, setProjectTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  const [rooms, setRooms] = useState([]);

  // Convert the typed value when the unit is switched so the physical size stays the same
  const switchAreaUnit = (unit) => {
    if (unit === areaUnit) return;
    const n = Number(builtUpArea);
    if (Number.isFinite(n) && builtUpArea !== '') {
      setBuiltUpArea(fmt(unit === 'm²' ? n / SQFT_PER_SQM : n * SQFT_PER_SQM, 2));
    }
    setAreaUnit(unit);
  };

  const switchHeightUnit = (unit) => {
    if (unit === heightUnit) return;
    const n = Number(floorHeight);
    if (Number.isFinite(n) && floorHeight !== '') {
      setFloorHeight(fmt(unit === 'm' ? n / FT_PER_M : n * FT_PER_M, 2));
    }
    setHeightUnit(unit);
  };

  const builtUpSqFt = areaUnit === 'sq.ft' ? Number(builtUpArea) : Number(builtUpArea) * SQFT_PER_SQM;
  const floorHeightFt = heightUnit === 'ft' ? Number(floorHeight) : Number(floorHeight) * FT_PER_M;
  const exceedsPlot = Number(plotArea) > 0 && builtUpSqFt > Number(plotArea);

  const handleCalculate = (e) => {
    e.preventDefault();
    if (onCalculate) {
      // The backend always works in sq.ft / ft
      onCalculate({
        plotArea: Number(plotArea),
        builtUpArea: builtUpSqFt,
        floors: Number(floors),
        floorHeight: floorHeightFt,
        wallThickness,
        concreteGrade,
        includePlastering,
        rooms,
      });
    }
  };

  const handlePlanExtracted = (extracted) => {
    // Always sq.ft — reset unit toggles so the displayed number matches the raw value
    setAreaUnit('sq.ft');
    setHeightUnit('ft');
    setBuiltUpArea(extracted.builtUpAreaSqFt);
    setFloors(extracted.floors);
    setWallThickness(extracted.wallThickness);
    setConcreteGrade(extracted.concreteGrade);
    if (extracted.plotAreaSqFt) setPlotArea(extracted.plotAreaSqFt);
    setRooms(Array.isArray(extracted.rooms) ? extracted.rooms : []);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!projectTitle.trim() || !calculatedResults) return;

    setIsSaving(true);
    try {
      await saveProject({
        title: projectTitle.trim(),
        // Save the parameters the result was actually calculated with
        parameters: calculatedResults.parameters,
        results: calculatedResults,
      });
      alert('Estimate saved successfully!');
      setProjectTitle('');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to save estimate.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative space-y-6">
      <PlanUpload onExtracted={handlePlanExtracted} />

      {/* 1. Project Parameters Header */}
      <div className="flex justify-between items-start">
        <h2 className="text-xl font-bold text-gray-900">1. Project Parameters</h2>
        <span className="bg-indigo-50 text-indigo-600 text-xs font-medium px-3 py-1.5 rounded-full">
          Imperial & Metric Supported
        </span>
      </div>

      <form onSubmit={handleCalculate} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Plot Area */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Plot Area (sq.ft)
            </label>
            <input
              type="number"
              value={plotArea}
              min="1"
              required
              onChange={(e) => setPlotArea(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Built-Up Area Per Floor */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Built-Up Area Per Floor
              </label>
              <div className="bg-gray-100 p-0.5 rounded-lg flex text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => switchAreaUnit('sq.ft')}
                  className={`px-2 py-0.5 rounded-md ${areaUnit === 'sq.ft' ? 'bg-indigo-600 text-white' : 'text-gray-600'}`}
                >
                  sq.ft
                </button>
                <button
                  type="button"
                  onClick={() => switchAreaUnit('m²')}
                  className={`px-2 py-0.5 rounded-md ${areaUnit === 'm²' ? 'bg-indigo-600 text-white' : 'text-gray-600'}`}
                >
                  m²
                </button>
              </div>
            </div>
            <input
              type="number"
              value={builtUpArea}
              min="1"
              step="any"
              required
              onChange={(e) => setBuiltUpArea(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 outline-none focus:border-indigo-500 transition-colors"
            />
            <span className="text-xs text-gray-400 mt-1 block">
              ≈ {areaUnit === 'sq.ft' ? `${fmt(builtUpSqFt / SQFT_PER_SQM)} m²` : `${fmt(builtUpSqFt, 0)} sq.ft`}
            </span>
            {exceedsPlot && (
              <span className="text-xs text-amber-600 mt-1 block">
                Built-up area per floor is larger than the plot area.
              </span>
            )}
          </div>

          {/* Number of Floors */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Number of Floors
            </label>
            <input
              type="number"
              value={floors}
              min="1"
              max="100"
              step="1"
              required
              onChange={(e) => setFloors(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Floor Height */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Floor Height
              </label>
              <div className="bg-gray-100 p-0.5 rounded-lg flex text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => switchHeightUnit('ft')}
                  className={`px-2 py-0.5 rounded-md ${heightUnit === 'ft' ? 'bg-indigo-600 text-white' : 'text-gray-600'}`}
                >
                  ft
                </button>
                <button
                  type="button"
                  onClick={() => switchHeightUnit('m')}
                  className={`px-2 py-0.5 rounded-md ${heightUnit === 'm' ? 'bg-indigo-600 text-white' : 'text-gray-600'}`}
                >
                  m
                </button>
              </div>
            </div>
            <input
              type="number"
              value={floorHeight}
              min="0.1"
              step="any"
              required
              onChange={(e) => setFloorHeight(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 outline-none focus:border-indigo-500 transition-colors"
            />
            <span className="text-xs text-gray-400 mt-1 block">
              ≈ {heightUnit === 'ft' ? `${fmt(floorHeightFt * 0.3048)} m` : `${fmt(floorHeightFt)} ft`}
            </span>
          </div>

          {/* Wall Thickness */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Wall Thickness
            </label>
            <select
              value={wallThickness}
              onChange={(e) => setWallThickness(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 bg-white outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="9">9 inches (Standard Outer Wall)</option>
              <option value="4.5">4.5 inches (Inner Partition)</option>
            </select>
          </div>

          {/* Concrete Grade */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Concrete Grade (Slabs, Beams, Columns)
            </label>
            <select
              value={concreteGrade}
              onChange={(e) => setConcreteGrade(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 bg-white outline-none focus:border-indigo-500 transition-colors"
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Include Plastering */}
          <div className="flex items-center gap-3 pt-6">
            <input
              type="checkbox"
              id="plastering"
              checked={includePlastering}
              onChange={(e) => setIncludePlastering(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
            />
            <label htmlFor="plastering" className="text-sm font-medium text-gray-700 cursor-pointer">
              Include Wall Plastering & Finishing
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 px-6 rounded-xl shadow-md transition-all mt-4 disabled:opacity-50"
        >
          {loading ? 'Calculating...' : 'Calculate Material & Cost Estimate'}
        </button>
      </form>

      {/* Save Full Estimation Project */}
      <form onSubmit={handleSave} className="pt-4 border-t border-gray-100">
        <label className="block text-sm text-gray-600 font-medium mb-2">
          Save Full Estimation Project
        </label>
        {!calculatedResults && (
          <p className="text-xs text-gray-400 mb-2">Calculate an estimate first, then save it here.</p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. Ground Floor Slab Estimation"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-emerald-500 transition-colors"
            required
          />
          <button
            type="submit"
            disabled={isSaving || !calculatedResults}
            title={calculatedResults ? '' : 'Calculate an estimate first'}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-5 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Estimate'}
          </button>
        </div>
      </form>
    </div>
  );
}