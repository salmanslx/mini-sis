// In development the Vite proxy forwards /api to localhost:5000.
// In production set VITE_API_URL to the deployed API address (for example https://mini-sis-api.onrender.com).
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

export async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}