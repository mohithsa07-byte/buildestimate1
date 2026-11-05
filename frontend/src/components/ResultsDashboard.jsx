
import React, { useState } from 'react';
import RoomBreakdown from './RoomBreakdown';
import { computeRoomMaterials } from '../utils/roomMaterials';
import { downloadEstimatePdf, downloadEstimateExcel } from '../api';

export default function ResultsDashboard({ result }) {
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);

  if (!result || !result.quantities || !result.costBreakdown) {
    return null;
  }

  const {
    quantities = {},
    costBreakdown = {},
    totalCost = 0,
    currency = '₹',
    parameters = {},
    rooms = []
  } = result;

  const items = [
    {
      name: 'Cement',
      qty: `${quantities.cementBags || 0} Bags`,
      cost: costBreakdown.cement || 0,
      icon: '🧱'
    },
    {
      name: 'Sand',
      qty: `${quantities.sandTons || 0} Tons`,
      cost: costBreakdown.sand || 0,
      icon: '⏳'
    },
    {
      name: 'Coarse Aggregate',
      qty: `${quantities.aggregateTons || 0} Tons`,
      cost: costBreakdown.aggregate || 0,
      icon: '🪨'
    },
    {
      name: 'Bricks',
      qty: `${quantities.brickQuantity || 0} Pcs`,
      cost: costBreakdown.bricks || 0,
      icon: '🏠'
    },
    {
      name: 'TMT Steel',
      qty: `${quantities.steelKg || 0} Kg (${quantities.steelTons || 0} T)`,
      cost: costBreakdown.steel || 0,
      icon: '🏗️'
    },
    {
      name: 'Labor Effort',
      qty: `${quantities.laborDays || 0} Days`,
      cost: costBreakdown.labor || 0,
      icon: '👷'
    }
  ];

  // Download project-specific Excel estimate
  const handleDownloadExcel = async () => {
    setIsDownloadingExcel(true);

    try {
      await downloadEstimateExcel({
        parameters,
        quantities,
        costBreakdown,
        totalCost,
        currency
      });
    } catch (err) {
      console.error('Excel download error:', err);
      alert(err.message || 'Failed to generate Excel workbook.');
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  // Download PDF estimate
  const handleDownloadPdf = async () => {
    setIsExporting(true);

    try {
      const roomMaterials = computeRoomMaterials(
        rooms,
        parameters.floorHeight
      );

      await downloadEstimatePdf({
        title: `Estimate — ${quantities.totalBuiltUpSqFt || 0} sq.ft, ${parameters.floors || 1} floor(s)`,
        parameters,
        quantities,
        costBreakdown,
        totalCost,
        currency,
        roomMaterials
      });
    } catch (err) {
      console.error('PDF download error:', err);
      alert(err.message || 'Failed to generate PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* CALCULATION RESULTS */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-4 gap-4">

          <div>
            <h2 className="text-xl font-bold text-slate-800">
              2. Calculation Results
            </h2>

            <p className="text-sm text-slate-500">
              Total Built-Up Area:{' '}
              <span className="font-semibold text-slate-700">
                {quantities.totalBuiltUpSqFt || 0} sq.ft
              </span>
              {' '}(~{quantities.totalBuiltUpSqM || 0} m²)
            </p>

            <p className="text-xs text-slate-400 mt-1">
              Download your project-specific construction estimate in Excel or PDF format.
            </p>
          </div>

          {/* COST AND DOWNLOAD BUTTONS */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">

            {/* TOTAL COST */}
            <div className="bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-xl text-right w-full sm:w-auto">
              <span className="block text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                Estimated Total Cost
              </span>

              <span className="text-2xl font-extrabold text-indigo-700">
                {currency} {Number(totalCost).toLocaleString('en-IN')}
              </span>
            </div>

            {/* DOWNLOAD BUTTONS */}
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">

              {/* EXCEL DOWNLOAD */}
              <button
                type="button"
                onClick={handleDownloadExcel}
                disabled={isDownloadingExcel}
                title="Download your project-specific Excel estimate"
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {isDownloadingExcel
                  ? 'Preparing Excel...'
                  : '⬇ Download Excel'}
              </button>

              {/* PDF DOWNLOAD */}
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isExporting}
                title="Download your construction estimate PDF"
                className="bg-slate-800 hover:bg-slate-900 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {isExporting
                  ? 'Generating PDF...'
                  : '⬇ Download PDF'}
              </button>

            </div>
          </div>
        </div>

        {/* MATERIAL BREAKDOWN */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {items.map((item) => (
            <div
              key={item.name}
              className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between"
            >
              <div className="flex items-center space-x-3">

                <span className="text-2xl">
                  {item.icon}
                </span>

                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    {item.name}
                  </h4>

                  <p className="text-xs font-semibold text-indigo-600">
                    {item.qty}
                  </p>
                </div>

              </div>

              <div className="text-right">
                <span className="text-sm font-bold text-slate-800">
                  {currency} {Number(item.cost).toLocaleString('en-IN')}
                </span>
              </div>

            </div>
          ))}

        </div>
      </div>

      {/* ROOM-WISE BREAKDOWN */}
      <RoomBreakdown
        rooms={rooms}
        floorHeightFt={parameters.floorHeight}
      />

    </div>
  );
}
