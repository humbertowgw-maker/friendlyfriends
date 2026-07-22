const API_BASE = '/api';

export async function fetchProviders() {
  const res = await fetch(`${API_BASE}/providers`);
  return res.json();
}

export async function fetchDashboard() {
  const res = await fetch(`${API_BASE}/dashboard`);
  return res.json();
}

export async function fetchRateLimits(provider) {
  const res = await fetch(`${API_BASE}/rate-limits/${provider}`);
  return res.json();
}

export async function fetchCosts(days = 30) {
  const res = await fetch(`${API_BASE}/costs?days=${days}`);
  return res.json();
}

export async function fetchDailyCosts(days = 30) {
  const res = await fetch(`${API_BASE}/costs/daily?days=${days}`);
  return res.json();
}

export async function fetchPredictions() {
  const res = await fetch(`${API_BASE}/predictions`);
  return res.json();
}

export async function fetchSuggestions() {
  const res = await fetch(`${API_BASE}/optimize/suggestions`);
  return res.json();
}

export async function fetchRouterRecommendation(taskType = 'general') {
  const res = await fetch(`${API_BASE}/router/recommendation?task_type=${taskType}`);
  return res.json();
}

export async function fetchAlertRules() {
  const res = await fetch(`${API_BASE}/alerts/rules`);
  return res.json();
}

export async function createAlertRule(rule) {
  const res = await fetch(`${API_BASE}/alerts/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule),
  });
  return res.json();
}

export async function deleteAlertRule(id) {
  const res = await fetch(`${API_BASE}/alerts/rules/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function fetchAlertHistory() {
  const res = await fetch(`${API_BASE}/alerts/history`);
  return res.json();
}

export async function logUsage(data) {
  const res = await fetch(`${API_BASE}/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export function createEventSource() {
  return new EventSource(`${API_BASE}/events`);
}
