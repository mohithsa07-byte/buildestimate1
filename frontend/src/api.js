// VITE_API_URL must include the /api suffix, e.g. http://localhost:5050/api
const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5050/api').replace(/\/+$/, '');

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

export const fetchProjects = () => request('/projects');

export const saveProject = (projectData) =>
  request('/projects', { method: 'POST', body: JSON.stringify(projectData) });

export const deleteProject = (id) =>
  request(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const fetchRates = () => request('/rates');

export const updateRates = (ratesData) =>
  request('/rates', { method: 'PUT', body: JSON.stringify(ratesData) });

export const calculateEstimate = (params) =>
  request('/estimate', { method: 'POST', body: JSON.stringify(params) });

// Downloads the PDF report and triggers a save-as in the browser — this one
// doesn't go through request() since the response body is a binary PDF, not JSON.
export const downloadEstimatePdf = async (payload) => {
  let res;
  try {
    res = await fetch(`${API_BASE_URL}/estimate/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?');
  }

  if (!res.ok) {
    let message = `Failed to generate PDF (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* response wasn't JSON (shouldn't happen on error path) */
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'buildestimate-report.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// Multipart upload — do NOT set Content-Type, the browser adds the boundary.
export const analyzePlan = async (file) => {
  const formData = new FormData();
  formData.append('plan', file);

  let res;
  try {
    res = await fetch(`${API_BASE_URL}/analyze-plan`, { method: 'POST', body: formData });
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    throw new Error((data && data.error) || `Plan analysis failed (${res.status})`);
  }
  return data.extracted;
};