// client/src/api.js
// Thin fetch wrapper that attaches the auth token to every request.
export function getToken() {
  return localStorage.getItem('devos_token');
}

export function apiFetch(url, opts = {}) {
  const token   = getToken();
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...opts, headers });
}
