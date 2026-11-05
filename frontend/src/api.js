
// BuildEstimate API configuration
// VITE_API_URL should include /api at the end.
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  'https://buildestimate1.onrender.com/api'
).replace(/\/+$/, '');


// --------------------------------------------------
// COMMON API REQUEST
// --------------------------------------------------

async function request(path, options = {}) {
  let res;

  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error('Cannot reach the server. Please check your internet connection.');
  }

  let data = null;

  try {
    data = await res.json();
  } catch {
    // Response may not be JSON.
  }

  if (!res.ok) {
    throw new Error(
      (data && data.error) || `Request failed (${res.status})`
    );
  }

  return data;
}


// --------------------------------------------------
// COMMON FILE DOWNLOAD HELPER
// --------------------------------------------------

async function downloadFile(path, options, filename, errorLabel) {
  let res;

  try {
    res = await fetch(`${API_BASE_URL}${path}`, options);
  } catch {
    throw new Error('Cannot reach the server. Please check your internet connection.');
  }

  if (!res.ok) {
    let message = `${errorLabel} (${res.status})`;

    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // Response may not be JSON.
    }

    throw new Error(message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();
  a.remove();

  // Delay revocation to allow the browser to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


// --------------------------------------------------
// PROJECTS
// --------------------------------------------------

export const fetchProjects = () =>
  request('/projects');

export const saveProject = (projectData) =>
  request('/projects', {
    method: 'POST',
    body: JSON.stringify(projectData),
  });

export const deleteProject = (id) =>
  request(`/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });


// --------------------------------------------------
// RATES
// --------------------------------------------------

export const fetchRates = () =>
  request('/rates');

export const updateRates = (ratesData) =>
  request('/rates', {
    method: 'PUT',
    body: JSON.stringify(ratesData),
  });


// --------------------------------------------------
// CONSTRUCTION ESTIMATE
// --------------------------------------------------

export const calculateEstimate = (params) =>
  request('/estimate', {
    method: 'POST',
    body: JSON.stringify(params),
  });


// --------------------------------------------------
// PROJECT-SPECIFIC EXCEL DOWNLOAD
// --------------------------------------------------

export const downloadEstimateExcel = (payload) =>
  downloadFile(
    '/estimate/excel',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    'BuildEstimate_Project_Estimate.xlsx',
    'Failed to generate Excel workbook'
  );


// --------------------------------------------------
// EXCEL TEMPLATE DOWNLOAD
// --------------------------------------------------

export const downloadEstimateExcelTemplate = () =>
  downloadFile(
    '/estimate/excel-template',
    {},
    'BuildEstimate_Detailed_Estimate_Template.xlsx',
    'Failed to download Excel template'
  );


// --------------------------------------------------
// PDF ESTIMATE DOWNLOAD
// --------------------------------------------------

export const downloadEstimatePdf = (payload) =>
  downloadFile(
    '/estimate/pdf',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    'buildestimate-report.pdf',
    'Failed to generate PDF'
  );


// --------------------------------------------------
// FOUNDATION
// --------------------------------------------------

export const fetchSoilTypes = () =>
  request('/foundation/soil-types');

export const calculateFoundation = (params) =>
  request('/foundation', {
    method: 'POST',
    body: JSON.stringify(params),
  });


// --------------------------------------------------
// FOUNDATION PDF
// --------------------------------------------------

export const downloadFoundationPdf = (payload) =>
  downloadFile(
    '/foundation/pdf',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    'buildestimate-foundation-report.pdf',
    'Failed to generate foundation PDF'
  );


// --------------------------------------------------
// PLAN ANALYSIS
// --------------------------------------------------

export const analyzePlan = async (file) => {
  const formData = new FormData();
  formData.append('plan', file);

  let res;

  try {
    res = await fetch(`${API_BASE_URL}/analyze-plan`, {
      method: 'POST',
      body: formData,
    });
  } catch {
    throw new Error('Cannot reach the server. Please check your internet connection.');
  }

  let data = null;

  try {
    data = await res.json();
  } catch {
    // Response may not be JSON.
  }

  if (!res.ok) {
    throw new Error(
      (data && data.error) || `Plan analysis failed (${res.status})`
    );
  }

  return data.extracted;
};


// --------------------------------------------------
// FOUNDATION ADVISOR
// --------------------------------------------------

export const recommendFoundation = (params) =>
  request('/foundation/recommend', {
    method: 'POST',
    body: JSON.stringify(params),
  });


// --------------------------------------------------
// SOIL REPORT ANALYSIS
// --------------------------------------------------

export const analyzeSoilReport = async (file) => {
  const formData = new FormData();
  formData.append('report', file);

  let res;

  try {
    res = await fetch(`${API_BASE_URL}/foundation/soil-report`, {
      method: 'POST',
      body: formData,
    });
  } catch {
    throw new Error('Cannot reach the server. Please check your internet connection.');
  }

  let data = null;

  try {
    data = await res.json();
  } catch {
    // Response may not be JSON.
  }

  if (!res.ok) {
    throw new Error(
      (data && data.error) || `Soil report analysis failed (${res.status})`
    );
  }

  return data.extracted;
};
