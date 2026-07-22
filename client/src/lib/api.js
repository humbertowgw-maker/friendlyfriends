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

// --- Inventory API ---

export async function fetchInventoryCharacters() {
  const res = await fetch(`${API_BASE}/inventory/characters`);
  return res.json();
}

export async function fetchInventoryCharacter(id) {
  const res = await fetch(`${API_BASE}/inventory/characters/${id}`);
  return res.json();
}

export async function fetchInventoryAssets(characterId, type) {
  const url = type
    ? `${API_BASE}/inventory/characters/${characterId}/assets?type=${type}`
    : `${API_BASE}/inventory/characters/${characterId}/assets`;
  const res = await fetch(url);
  return res.json();
}

export async function lookupInventoryAsset(characterId, label, type) {
  const url = new URL(`${API_BASE}/inventory/characters/${characterId}/assets/lookup`);
  url.searchParams.set('label', label);
  if (type) url.searchParams.set('type', type);
  const res = await fetch(url.toString());
  return res.json();
}

export async function registerAsset(characterId, data) {
  const res = await fetch(`${API_BASE}/inventory/characters/${characterId}/assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchInventoryStats() {
  const res = await fetch(`${API_BASE}/inventory/stats`);
  return res.json();
}

export async function fetchInventoryGaps(status) {
  const url = status ? `${API_BASE}/inventory/gaps?status=${status}` : `${API_BASE}/inventory/gaps`;
  const res = await fetch(url);
  return res.json();
}

export async function resolveGap(id) {
  const res = await fetch(`${API_BASE}/inventory/gaps/${id}/resolve`, { method: 'POST' });
  return res.json();
}

export async function ignoreGap(id) {
  const res = await fetch(`${API_BASE}/inventory/gaps/${id}/ignore`, { method: 'POST' });
  return res.json();
}

export async function ingestBookContent(chunks, autoGenerate = false) {
  const res = await fetch(`${API_BASE}/inventory/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chunks, autoGenerate }),
  });
  return res.json();
}

export async function generateScene(scene) {
  const res = await fetch(`${API_BASE}/inventory/pipeline/generate-scene`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scene),
  });
  return res.json();
}

export async function processEpisode(episode) {
  const res = await fetch(`${API_BASE}/inventory/pipeline/process-episode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(episode),
  });
  return res.json();
}
