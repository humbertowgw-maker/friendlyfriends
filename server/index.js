import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { initDb } from './db/database.js';
import { createAdapters } from './adapters/index.js';
import { CostOptimizer } from './cost-optimizer.js';
import { UsagePredictor } from './usage-predictor.js';
import { AlertEngine } from './alert-engine.js';
import { SmartRouter } from './smart-router.js';
import { createInventoryRoutes } from './inventory/inventory-routes.js';
import { CharacterInventory } from './inventory/character-inventory.js';

const app = express();
const server = createServer(app);

app.use(cors());
app.use(express.json());

// --- SSE clients ---
const sseClients = new Set();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    res.write(msg);
  }
}

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(':\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// --- Init ---
const db = await initDb();
const adapters = createAdapters();
const optimizer = new CostOptimizer(db);
const predictor = new UsagePredictor(db);
const alerts = new AlertEngine(db, broadcast);
const router = new SmartRouter(db, optimizer);

// --- Seed character roster ---
const inventory = new CharacterInventory(db);
const CHARACTERS = [
  { name: 'Achilles', slug: 'achilles', description: 'Tan, ~60 lbs, half Australian Shepherd/half Husky, blind, service dog' },
  { name: 'Athena', slug: 'athena', description: "Achilles's sister, tan/beige, has diabetes" },
  { name: 'Henry', slug: 'henry', description: 'All-white cat, deaf, expressive eyes' },
  { name: 'Falcor', slug: 'falcor', description: 'Eldest, all-white short-hair cat, cross-eyed blue eyes' },
  { name: 'Peter', slug: 'peter', description: 'Parakeet, vocal, loves singing' },
  { name: 'Walter', slug: 'walter', description: "Blue lovebird, Peter's cage-mate" },
];
for (const char of CHARACTERS) {
  const existing = inventory.getCharacterBySlug(char.slug);
  if (!existing) {
    inventory.createCharacter(char);
  }
}

// --- Inventory routes ---
app.use('/api/inventory', createInventoryRoutes(db));

// --- Provider routes ---
app.get('/api/providers', (req, res) => {
  const providers = Object.entries(adapters).map(([name, a]) => ({
    name,
    configured: a.isConfigured(),
    models: a.getModels(),
  }));
  res.json(providers);
});

app.get('/api/rate-limits/:provider', async (req, res) => {
  const adapter = adapters[req.params.provider];
  if (!adapter) return res.status(404).json({ error: 'Unknown provider' });
  try {
    const limits = await adapter.getRateLimits();
    res.json(limits);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/usage/:provider', async (req, res) => {
  const { provider } = req.params;
  const { days = 7 } = req.query;
  const rows = db.prepare(`
    SELECT * FROM usage_events
    WHERE provider = ? AND timestamp > datetime('now', '-' || ? || ' days')
    ORDER BY timestamp DESC
  `).all(provider, Number(days));
  res.json(rows);
});

// --- Cost routes ---
app.get('/api/costs', (req, res) => {
  const { days = 30 } = req.query;
  const rows = db.prepare(`
    SELECT provider, model,
      SUM(cost_usd) as total_cost,
      SUM(input_tokens) as total_input_tokens,
      SUM(output_tokens) as total_output_tokens,
      COUNT(*) as request_count
    FROM usage_events
    WHERE timestamp > datetime('now', '-' || ? || ' days')
    GROUP BY provider, model
    ORDER BY total_cost DESC
  `).all(Number(days));
  res.json(rows);
});

app.get('/api/costs/daily', (req, res) => {
  const { days = 30 } = req.query;
  const rows = db.prepare(`
    SELECT date(timestamp) as day, provider,
      SUM(cost_usd) as total_cost,
      SUM(input_tokens + output_tokens) as total_tokens,
      COUNT(*) as requests
    FROM usage_events
    WHERE timestamp > datetime('now', '-' || ? || ' days')
    GROUP BY day, provider
    ORDER BY day
  `).all(Number(days));
  res.json(rows);
});

// --- Optimization routes ---
app.get('/api/optimize/suggestions', (req, res) => {
  const suggestions = optimizer.getSuggestions();
  res.json(suggestions);
});

app.get('/api/predictions', (req, res) => {
  const predictions = predictor.predict();
  res.json(predictions);
});

app.get('/api/router/recommendation', (req, res) => {
  const { task_type = 'general' } = req.query;
  const rec = router.recommend(task_type);
  res.json(rec);
});

// --- Alert routes ---
app.get('/api/alerts/rules', (req, res) => {
  const rules = db.prepare('SELECT * FROM alert_rules ORDER BY id').all();
  res.json(rules);
});

app.post('/api/alerts/rules', (req, res) => {
  const { provider, metric, threshold, type = 'warning' } = req.body;
  const result = db.prepare(`
    INSERT INTO alert_rules (provider, metric, threshold, type)
    VALUES (?, ?, ?, ?)
  `).all(provider, metric, threshold, type);
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/alerts/rules/:id', (req, res) => {
  db.prepare('DELETE FROM alert_rules WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/alerts/history', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM alert_events ORDER BY timestamp DESC LIMIT 100
  `).all();
  res.json(rows);
});

// --- Log usage (for manual tracking or from proxy) ---
app.post('/api/usage', (req, res) => {
  const { provider, model, input_tokens, output_tokens, latency_ms, cost_usd, metadata } = req.body;
  db.prepare(`
    INSERT INTO usage_events (provider, model, input_tokens, output_tokens, latency_ms, cost_usd, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(provider, model, input_tokens || 0, output_tokens || 0, latency_ms || 0, cost_usd || 0, JSON.stringify(metadata || {}));

  alerts.checkThresholds(provider, model, { input_tokens, output_tokens, cost_usd });
  broadcast('usage', { provider, model, input_tokens, output_tokens, cost_usd });
  res.json({ ok: true });
});

// --- Dashboard summary ---
app.get('/api/dashboard', (req, res) => {
  const today = db.prepare(`
    SELECT
      SUM(cost_usd) as cost_today,
      SUM(input_tokens + output_tokens) as tokens_today,
      COUNT(*) as requests_today
    FROM usage_events
    WHERE date(timestamp) = date('now')
  `).get();

  const month = db.prepare(`
    SELECT
      SUM(cost_usd) as cost_month,
      SUM(input_tokens + output_tokens) as tokens_month,
      COUNT(*) as requests_month
    FROM usage_events
    WHERE timestamp > datetime('now', '-30 days')
  `).get();

  const byProvider = db.prepare(`
    SELECT provider,
      SUM(cost_usd) as cost,
      COUNT(*) as requests,
      SUM(input_tokens + output_tokens) as tokens
    FROM usage_events
    WHERE date(timestamp) = date('now')
    GROUP BY provider
  `).all();

  const recentAlerts = db.prepare(`
    SELECT * FROM alert_events ORDER BY timestamp DESC LIMIT 5
  `).all();

  res.json({
    today: today || { cost_today: 0, tokens_today: 0, requests_today: 0 },
    month: month || { cost_month: 0, tokens_month: 0, requests_month: 0 },
    byProvider,
    recentAlerts,
    predictions: predictor.predict(),
    suggestions: optimizer.getSuggestions(),
  });
});

// --- Periodic polling for rate limits ---
let pollInterval = null;
function startPolling() {
  pollInterval = setInterval(async () => {
    for (const [name, adapter] of Object.entries(adapters)) {
      if (!adapter.isConfigured()) continue;
      try {
        const limits = await adapter.getRateLimits();
        broadcast('rate-limit', { provider: name, ...limits });
        alerts.checkRateLimits(name, limits);
      } catch { /* ignore polling errors */ }
    }
  }, 30000);
}

// --- Start ---
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`AI Rate Gauge server running on http://localhost:${PORT}`);
  startPolling();
});
