import PDFDocument from 'pdfkit';

const money = (currency, n) => `${currency}${Number(n || 0).toLocaleString('en-IN')}`;

function drawHeader(doc, title) {
  doc
    .fontSize(20)
    .fillColor('#1e1b4b')
    .text('BuildEstimate', { continued: false })
    .fontSize(10)
    .fillColor('#64748b')
    .text('Construction Material & Cost Estimate Report')
    .moveDown(0.6);

  doc
    .fontSize(14)
    .fillColor('#0f172a')
    .text(title || 'Estimate Summary')
    .fontSize(9)
    .fillColor('#94a3b8')
    .text(`Generated ${new Date().toLocaleString('en-IN')}`)
    .moveDown(1);

  doc.strokeColor('#e2e8f0').moveTo(doc.x, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.8);
}

function drawKeyValueGrid(doc, pairs) {
  const startX = doc.x;
  const colWidth = 170;
  let x = startX;
  let y = doc.y;
  const rowHeight = 32;

  pairs.forEach(([label, value], i) => {
    if (i > 0 && i % 3 === 0) {
      y += rowHeight;
      x = startX;
    }
    doc.fontSize(8).fillColor('#94a3b8').text(label.toUpperCase(), x, y, { width: colWidth - 10 });
    doc.fontSize(11).fillColor('#0f172a').text(String(value), x, y + 12, { width: colWidth - 10 });
    x += colWidth;
  });

  doc.y = y + rowHeight + 8;
  doc.x = startX;
}

function drawTable(doc, { headers, rows, colWidths, totalsRow }) {
  const startX = doc.x;
  let y = doc.y;
  const rowHeight = 20;

  const drawRow = (cells, opts = {}) => {
    let x = startX;
    cells.forEach((cell, i) => {
      doc
        .fontSize(opts.bold ? 9.5 : 9)
        .fillColor(opts.bold ? '#0f172a' : '#334155')
        .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(String(cell), x, y, { width: colWidths[i] - 6 });
      x += colWidths[i];
    });
    y += rowHeight;
  };

  doc.fontSize(8).fillColor('#64748b');
  let x = startX;
  headers.forEach((h, i) => {
    doc.font('Helvetica-Bold').text(h.toUpperCase(), x, y, { width: colWidths[i] - 6 });
    x += colWidths[i];
  });
  y += rowHeight - 4;
  doc.strokeColor('#e2e8f0').moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).stroke();
  y += 6;

  rows.forEach((row) => {
    if (y > 730) {
      doc.addPage();
      y = doc.y;
    }
    drawRow(row);
  });

  if (totalsRow) {
    doc.strokeColor('#cbd5e1').moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).stroke();
    y += 6;
    drawRow(totalsRow, { bold: true });
  }

  doc.font('Helvetica');
  doc.y = y + 10;
  doc.x = startX;
}

/**
 * Streams a full estimate report as a PDF directly to `res`.
 * @param {import('express').Response} res
 * @param {object} data - { title, parameters, quantities, costBreakdown, totalCost, currency, roomMaterials }
 */
export function streamEstimatePdf(res, data) {
  const {
    title,
    parameters = {},
    quantities = {},
    costBreakdown = {},
    totalCost = 0,
    currency = '₹',
    roomMaterials = [],
  } = data;

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="buildestimate-report.pdf"`);
  doc.pipe(res);

  drawHeader(doc, title);

  // --- Project parameters ---
  doc.fontSize(12).fillColor('#0f172a').font('Helvetica-Bold').text('Project Parameters').moveDown(0.3);
  doc.font('Helvetica');
  const paramPairs = [
    ['Plot Area', parameters.plotArea ? `${Math.round(parameters.plotArea)} sq.ft` : '—'],
    ['Built-up Area / Floor', parameters.builtUpArea ? `${Math.round(parameters.builtUpArea)} sq.ft` : '—'],
    ['Floors', parameters.floors ?? '—'],
    ['Floor Height', parameters.floorHeight ? `${Number(parameters.floorHeight).toFixed(1)} ft` : '—'],
    ['Wall Thickness', parameters.wallThickness ? `${parameters.wallThickness}"` : '—'],
    ['Concrete Grade', parameters.concreteGrade || '—'],
    ['Total Built-up Area', quantities.totalBuiltUpSqFt ? `${quantities.totalBuiltUpSqFt} sq.ft` : '—'],
    ['Plastering', parameters.includePlastering ? 'Included' : 'Not included'],
  ];
  drawKeyValueGrid(doc, paramPairs);

  // --- Quantities & cost breakdown ---
  doc.fontSize(12).fillColor('#0f172a').font('Helvetica-Bold').text('Material Quantities & Cost').moveDown(0.4);
  doc.font('Helvetica');

  const rows = [
    ['Cement', `${quantities.cementBags ?? 0} bags`, money(currency, costBreakdown.cement)],
    ['Sand', `${quantities.sandTons ?? 0} tons`, money(currency, costBreakdown.sand)],
    ['Coarse Aggregate', `${quantities.aggregateTons ?? 0} tons`, money(currency, costBreakdown.aggregate)],
    ['Bricks', `${(quantities.brickQuantity ?? 0).toLocaleString('en-IN')} pcs`, money(currency, costBreakdown.bricks)],
    ['TMT Steel', `${quantities.steelKg ?? 0} kg (${quantities.steelTons ?? 0} t)`, money(currency, costBreakdown.steel)],
    ['Labor', `${quantities.laborDays ?? 0} days`, money(currency, costBreakdown.labor)],
  ];

  drawTable(doc, {
    headers: ['Material', 'Quantity', 'Cost'],
    colWidths: [200, 180, 115],
    rows,
    totalsRow: ['Total Estimated Cost', '', money(currency, totalCost)],
  });

  // --- Room-by-room breakdown (only if the AI plan-upload detected rooms) ---
  if (roomMaterials.length > 0) {
    if (doc.y > 620) doc.addPage();
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#0f172a').font('Helvetica-Bold').text('Room-by-Room Finishing Materials').moveDown(0.2);
    doc.fontSize(8).fillColor('#94a3b8').font('Helvetica')
      .text('Flooring & paint only — structural materials above already cover the whole building.')
      .moveDown(0.4);

    const roomRows = roomMaterials.map((r) => [
      r.name,
      `${r.areaSqFt} sq.ft`,
      `${r.flooringTiles} tiles`,
      `${r.paintLitres} L paint`,
    ]);
    const totalArea = roomMaterials.reduce((a, r) => a + (r.areaSqFt || 0), 0);
    const totalTiles = roomMaterials.reduce((a, r) => a + (r.flooringTiles || 0), 0);
    const totalPaint = roomMaterials.reduce((a, r) => a + (r.paintLitres || 0), 0);

    drawTable(doc, {
      headers: ['Room', 'Area', 'Floor Tiles', 'Wall Paint'],
      colWidths: [160, 120, 115, 100],
      rows: roomRows,
      totalsRow: ['Total', `${totalArea} sq.ft`, `${totalTiles} tiles`, `${totalPaint} L`],
    });
  }

  doc.moveDown(1);
  doc.fontSize(8).fillColor('#94a3b8').text(
    'This is an automated estimate for planning purposes only. Actual material requirements and costs ' +
      'may vary based on site conditions, design changes, and local supplier pricing. Always confirm with ' +
      'a qualified structural engineer before construction.',
    { width: 495 }
  );

  doc.end();
}
