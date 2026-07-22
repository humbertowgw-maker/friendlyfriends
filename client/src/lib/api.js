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

export async function createCharacter(data) {
  const res = await fetch(`${API_BASE}/inventory/characters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateCharacter(id, data) {
  const res = await fetch(`${API_BASE}/inventory/characters/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
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

export async function fetchPoseOptions() {
  const res = await fetch(`${API_BASE}/inventory/poses`);
  return res.json();
}

export async function generatePose(data) {
  const res = await fetch(`${API_BASE}/inventory/generate-pose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
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

export async function fetchGeneratorStatus() {
  const res = await fetch(`${API_BASE}/inventory/generators/status`);
  return res.json();
}

// --- Episodes API ---

export async function fetchEpisodes() {
  const res = await fetch(`${API_BASE}/episodes`);
  return res.json();
}

export async function fetchEpisode(id) {
  const res = await fetch(`${API_BASE}/episodes/${id}`);
  return res.json();
}

export async function createEpisode(data) {
  const res = await fetch(`${API_BASE}/episodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateEpisode(id, data) {
  const res = await fetch(`${API_BASE}/episodes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteEpisode(id) {
  const res = await fetch(`${API_BASE}/episodes/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function addScene(episodeId, data) {
  const res = await fetch(`${API_BASE}/episodes/${episodeId}/scenes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateScene(sceneId, data) {
  const res = await fetch(`${API_BASE}/episodes/scenes/${sceneId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function reorderScenes(episodeId, sceneIds) {
  const res = await fetch(`${API_BASE}/episodes/${episodeId}/scenes/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scene_ids: sceneIds }),
  });
  return res.json();
}

export async function deleteScene(sceneId) {
  const res = await fetch(`${API_BASE}/episodes/scenes/${sceneId}`, { method: 'DELETE' });
  return res.json();
}

export async function approveEpisodeStage(episodeId, stage, reviewer, notes) {
  const res = await fetch(`${API_BASE}/episodes/${episodeId}/approve/${stage}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewer, notes }),
  });
  return res.json();
}

export async function rejectEpisodeStage(episodeId, stage, reviewer, notes) {
  const res = await fetch(`${API_BASE}/episodes/${episodeId}/reject/${stage}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewer, notes }),
  });
  return res.json();
}

export async function generateEpisodeAssets(episodeId) {
  const res = await fetch(`${API_BASE}/episodes/${episodeId}/generate-assets`, { method: 'POST' });
  return res.json();
}

export async function generateSceneBackground(sceneId) {
  const res = await fetch(`${API_BASE}/episodes/scenes/${sceneId}/generate-background`, { method: 'POST' });
  return res.json();
}

export async function generateSceneAudio(sceneId) {
  const res = await fetch(`${API_BASE}/episodes/scenes/${sceneId}/generate-audio`, { method: 'POST' });
  return res.json();
}

export async function assembleSceneVideo(sceneId, duration) {
  const res = await fetch(`${API_BASE}/episodes/scenes/${sceneId}/assemble-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration }),
  });
  return res.json();
}

export async function fullBuildEpisode(episodeId, sceneDuration = 5) {
  const res = await fetch(`${API_BASE}/episodes/${episodeId}/full-build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scene_duration: sceneDuration }),
  });
  return res.json();
}

export async function fetchEpisodePipelineStatus() {
  const res = await fetch(`${API_BASE}/episodes/pipeline/status`);
  return res.json();
}
