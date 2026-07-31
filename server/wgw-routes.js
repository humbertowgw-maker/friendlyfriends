import { Router } from 'express';
import crypto from 'crypto';

const SOPHIA_SYSTEM_PROMPT = `You are Sophia, a friendly AI companion and "second brain" for WGW (WhiteGlove) BrainOS. You are helpful, warm, and concise. You help manage tasks, answer questions, summarize information, and keep track of things. You have a slight playful personality — you're like a knowledgeable pet friend who lives on the screen. Keep responses under 150 words unless asked for detail. You can discuss: task planning, AI model recommendations, cost optimization, code, creative ideas, and general knowledge.`;

function getChatProvider() {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GOOGLE_GEMINI_API_KEY) return 'gemini';
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.OLLAMA_BASE_URL) return 'ollama';
  return null;
}

async function callAI(messages, includeSystem = true) {
  const provider = getChatProvider();
  if (!provider) throw new Error('No AI provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_BASE_URL in .env');

  const fullMessages = includeSystem ? [{ role: 'system', content: SOPHIA_SYSTEM_PROMPT }, ...messages] : messages;

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: fullMessages, max_tokens: 500 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'OpenAI error');
    return { reply: data.choices[0].message.content, model: data.model, usage: data.usage };
  }

  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-3-haiku-20240307', system: SOPHIA_SYSTEM_PROMPT, messages, max_tokens: 500 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Anthropic error');
    const replyText = data.content?.find(c => c.type === 'text')?.text || '';
    return { reply: replyText, model: data.model, usage: { input_tokens: data.usage?.input_tokens || 0, output_tokens: data.usage?.output_tokens || 0 } };
  }

  if (provider === 'ollama') {
    const res = await fetch(`${process.env.OLLAMA_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama3.1', messages: fullMessages, max_tokens: 500, stream: false }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Ollama error');
    return { reply: data.choices[0].message.content, model: data.model, usage: data.usage };
  }

  throw new Error('Provider not yet supported for chat: ' + provider);
}

export function createWgwRoutes(db) {
  const router = Router();

  router.get('/sophia-calls/logs', (req, res) => {
    const { org_id, filter = 'all', date_range = '7d' } = req.query;
    const days = parseInt(date_range);
    const validDays = isNaN(days) ? 7 : Math.min(Math.max(days, 1), 365);

    try {
      let rows;
      if (filter === 'all') {
        rows = db.prepare(`
          SELECT id, provider, model, input_tokens, output_tokens,
                 latency_ms, cost_usd, metadata, timestamp
          FROM usage_events
          WHERE timestamp > datetime('now', '-' || ? || ' days')
          ORDER BY timestamp DESC
          LIMIT 500
        `).all(validDays);
      } else {
        rows = db.prepare(`
          SELECT id, provider, model, input_tokens, output_tokens,
                 latency_ms, cost_usd, metadata, timestamp
          FROM usage_events
          WHERE provider = ? AND timestamp > datetime('now', '-' || ? || ' days')
          ORDER BY timestamp DESC
          LIMIT 500
        `).all(filter, validDays);
      }
      res.json({ logs: rows, total: rows.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/sophia-calls/analytics', (req, res) => {
    const { org_id } = req.query;

    try {
      const totalCalls = db.prepare('SELECT COUNT(*) as count FROM usage_events').get();
      const totalCost = db.prepare('SELECT COALESCE(SUM(cost_usd), 0) as total FROM usage_events').get();
      const byProvider = db.prepare(`
        SELECT provider, COUNT(*) as calls, COALESCE(SUM(cost_usd), 0) as cost,
               AVG(latency_ms) as avg_latency
        FROM usage_events
        GROUP BY provider
      `).all();
      const today = db.prepare(`
        SELECT COUNT(*) as calls, COALESCE(SUM(cost_usd), 0) as cost
        FROM usage_events
        WHERE date(timestamp) = date('now')
      `).get();

      res.json({
        total_calls: totalCalls.count,
        total_cost: totalCost.total,
        by_provider: byProvider,
        today: today,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/work-plan', (req, res) => {
    const { rep_id } = req.query;

    if (!rep_id) {
      return res.status(400).json({ error: 'rep_id is required' });
    }

    try {
      const today = new Date().toISOString().split('T')[0];

      const recentActivity = db.prepare(`
        SELECT COUNT(*) as tasks, COALESCE(SUM(cost_usd), 0) as cost
        FROM usage_events
        WHERE date(timestamp) = date('now')
      `).get();

      res.json({
        rep: { id: rep_id, name: 'Rep ' + rep_id.slice(0, 8), slug: rep_id },
        date: today,
        tasks_completed: recentActivity?.tasks || 0,
        total_cost_today: recentActivity?.cost || 0,
        priorities: [],
        next_actions: [],
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/personal/emails', (req, res) => {
    const { mailbox = 'inbox', limit = 40 } = req.query;
    const maxLimit = Math.min(parseInt(limit) || 40, 100);

    try {
      const emails = [];
      const total = 0;
      res.json({
        emails,
        total,
        mailbox,
        message: 'Email integration requires upstream IMAP/API connection. Configure EMAIL_* environment variables.',
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/pet/status', (req, res) => {
    try {
      const today = db.prepare(`
        SELECT COUNT(*) as requests, COALESCE(SUM(cost_usd), 0) as cost,
               COALESCE(SUM(input_tokens + output_tokens), 0) as tokens
        FROM usage_events WHERE date(timestamp) = date('now')
      `).get();
      const recentAlert = db.prepare(`
        SELECT message, type, timestamp FROM alert_events
        ORDER BY timestamp DESC LIMIT 1
      `).get();
      const activeProviders = db.prepare(`
        SELECT DISTINCT provider FROM usage_events
        WHERE timestamp > datetime('now', '-1 day')
      `).all().map(r => r.provider);
      const hour = new Date().getHours();
      const timeOfDay = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

      res.json({
        timeOfDay,
        today: today || { requests: 0, cost: 0, tokens: 0 },
        lastAlert: recentAlert || null,
        activeProviders,
        petName: 'Sophia',
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/pet/nudge', (req, res) => {
    try {
      const today = db.prepare(`SELECT COUNT(*) as r, COALESCE(SUM(cost_usd),0) as c, COALESCE(SUM(input_tokens+output_tokens),0) as t FROM usage_events WHERE date(timestamp)=date('now')`).get();
      const yesterday = db.prepare(`SELECT COUNT(*) as r, COALESCE(SUM(cost_usd),0) as c FROM usage_events WHERE date(timestamp)=date('now','-1 day')`).get();
      const weekAvg = db.prepare(`SELECT AVG(cnt) as avg_r, AVG(cst) as avg_c FROM (SELECT date(timestamp) as d, COUNT(*) as cnt, COALESCE(SUM(cost_usd),0) as cst FROM usage_events WHERE timestamp>datetime('now','-7 days') GROUP BY d)`).get();
      const topProvider = db.prepare(`SELECT provider, COUNT(*) as cnt FROM usage_events WHERE date(timestamp)=date('now') GROUP BY provider ORDER BY cnt DESC LIMIT 1`).get();
      const recentAlert = db.prepare(`SELECT message, type FROM alert_events ORDER BY timestamp DESC LIMIT 1`).get();
      const hour = new Date().getHours();

      const nudges = [];
      const rToday = today?.r || 0;
      const cToday = today?.c || 0;
      const rYest = yesterday?.r || 0;
      const cYest = yesterday?.c || 0;

      if (rToday > 0 && rYest > 0 && rToday > rYest * 1.5) nudges.push(`Requests are up ${Math.round((rToday/rYest-1)*100)}% from yesterday. Busy day?`);
      if (cToday > 0 && cYest > 0 && cToday > cYest * 1.5) nudges.push(`Costs spiked today ($${cToday.toFixed(4)} vs $${cYest.toFixed(4)} yesterday). Want me to optimize?`);
      if (rToday === 0 && hour > 10) nudges.push('No AI calls yet today. Everything okay?');
      if (weekAvg?.avg_r && rToday > weekAvg.avg_r * 2) nudges.push(`This is your busiest day this week — ${rToday} requests so far.`);
      if (weekAvg?.avg_r && rToday > 0 && rToday < weekAvg.avg_r * 0.3) nudges.push(`Quiet day compared to your weekly average (${rToday} vs ${Math.round(weekAvg.avg_r)}/day).`);
      if (topProvider) nudges.push(`${topProvider.provider} is your most-used provider today (${topProvider.cnt} calls).`);
      if (recentAlert) nudges.push(`Last alert: ${recentAlert.message}`);
      if (hour < 6) nudges.push('It\'s late — should you be sleeping? I\'ll keep watch.');
      if (hour >= 6 && hour < 9) nudges.push('Good morning! Ready to be productive today?');
      if (hour >= 17 && hour < 19) nudges.push('Evening winding down. Want me to summarize today?');

      const nudge = nudges.length > 0 ? nudges[Math.floor(Math.random() * nudges.length)] : 'All quiet on the WGW front.';

      res.json({ nudge, stats: { requests: rToday, cost: cToday, tokens: today?.t || 0 } });
    } catch (err) {
      res.json({ nudge: 'Just checking in — everything looks fine from here.', stats: null });
    }
  });

  // --- Brain document store ---

  const getUserId = (req) => req.headers['x-user-id'] || 'default';

  const canRead = (doc, userId) => doc.permission === 'public' || doc.owner_id === userId || doc.permission === 'shared';
  const canWrite = (doc, userId) => doc.owner_id === userId || doc.permission === 'public';

  router.get('/pet/brain', (req, res) => {
    try {
      const userId = getUserId(req);
      const { search, pinned } = req.query;
      let rows;
      if (pinned === 'true') {
        rows = db.prepare('SELECT * FROM brain_docs WHERE pinned = 1 AND (owner_id = ? OR permission IN (?, ?)) ORDER BY created_at DESC').all(userId, 'shared', 'public');
      } else if (search) {
        rows = db.prepare('SELECT * FROM brain_docs WHERE (content LIKE ? OR title LIKE ?) AND (owner_id = ? OR permission IN (?, ?)) ORDER BY pinned DESC, created_at DESC').all(`%${search}%`, `%${search}%`, userId, 'shared', 'public');
      } else {
        rows = db.prepare('SELECT * FROM brain_docs WHERE (owner_id = ? OR permission IN (?, ?)) ORDER BY pinned DESC, created_at DESC').all(userId, 'shared', 'public');
      }
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/pet/brain', (req, res) => {
    const userId = getUserId(req);
    const { title, content, type = 'text', tags = '', permission = 'private' } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'content is required' });
    try {
      const r = db.prepare('INSERT INTO brain_docs (title, content, type, tags, owner_id, permission) VALUES (?, ?, ?, ?, ?, ?)')
        .run(title || 'Untitled', content.trim(), type, tags, userId, permission);
      res.json({ id: r.lastInsertRowid, ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/pet/brain/:id', (req, res) => {
    const userId = getUserId(req);
    try {
      const doc = db.prepare('SELECT * FROM brain_docs WHERE id = ?').get(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Not found' });
      if (!canWrite(doc, userId)) return res.status(403).json({ error: 'Forbidden' });
      db.prepare('DELETE FROM brain_docs WHERE id = ?').run(req.params.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.patch('/pet/brain/:id', (req, res) => {
    const userId = getUserId(req);
    const { title, content, pinned, tags, permission } = req.body;
    try {
      const doc = db.prepare('SELECT * FROM brain_docs WHERE id = ?').get(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Not found' });
      if (!canWrite(doc, userId)) return res.status(403).json({ error: 'Forbidden' });
      if (pinned !== undefined) db.prepare('UPDATE brain_docs SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, req.params.id);
      if (title !== undefined) db.prepare('UPDATE brain_docs SET title = ? WHERE id = ?').run(title, req.params.id);
      if (content !== undefined) db.prepare('UPDATE brain_docs SET content = ? WHERE id = ?').run(content, req.params.id);
      if (tags !== undefined) db.prepare('UPDATE brain_docs SET tags = ? WHERE id = ?').run(tags, req.params.id);
      if (permission !== undefined) db.prepare('UPDATE brain_docs SET permission = ? WHERE id = ?').run(permission, req.params.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/pet/brain/export', (req, res) => {
    const userId = getUserId(req);
    try {
      const rows = db.prepare('SELECT * FROM brain_docs WHERE (owner_id = ? OR permission IN (?, ?)) ORDER BY created_at DESC').all(userId, 'shared', 'public');
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/pet/brain/import', (req, res) => {
    const userId = getUserId(req);
    const { docs } = req.body;
    if (!Array.isArray(docs)) return res.status(400).json({ error: 'docs array required' });
    try {
      const ins = db.prepare('INSERT INTO brain_docs (title, content, type, tags, pinned, owner_id, permission) VALUES (?, ?, ?, ?, ?, ?, ?)');
      let count = 0;
      for (const d of docs) {
        if (!d.content) continue;
        ins.run(d.title || 'Untitled', d.content, d.type || 'text', d.tags || '', d.pinned ? 1 : 0, userId, d.permission || 'private');
        count++;
      }
      res.json({ ok: true, count });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // --- Document Version History ---
  router.get('/pet/brain/:id/versions', (req, res) => {
    const userId = getUserId(req);
    try {
      const doc = db.prepare('SELECT * FROM brain_docs WHERE id = ?').get(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Not found' });
      if (doc.owner_id !== userId && doc.permission === 'private') return res.status(403).json({ error: 'Forbidden' });
      const versions = db.prepare('SELECT id, content_preview, created_at FROM doc_versions WHERE brain_doc_id = ? ORDER BY created_at DESC LIMIT 50').all(req.params.id);
      res.json(versions);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/pet/brain/:id/versions', (req, res) => {
    const userId = getUserId(req);
    const { yjs_update, content_preview } = req.body;
    if (!yjs_update) return res.status(400).json({ error: 'yjs_update required' });
    try {
      const doc = db.prepare('SELECT * FROM brain_docs WHERE id = ?').get(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Not found' });
      if (doc.owner_id !== userId && doc.permission === 'private') return res.status(403).json({ error: 'Forbidden' });
      const r = db.prepare('INSERT INTO doc_versions (brain_doc_id, user_id, yjs_update, content_preview) VALUES (?, ?, ?, ?)')
        .run(req.params.id, userId, yjs_update, content_preview || '');
      res.json({ ok: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/pet/brain/:id/versions/:versionId/restore', (req, res) => {
    const userId = getUserId(req);
    try {
      const doc = db.prepare('SELECT * FROM brain_docs WHERE id = ?').get(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Not found' });
      if (doc.owner_id !== userId && doc.permission === 'private') return res.status(403).json({ error: 'Forbidden' });
      const version = db.prepare('SELECT * FROM doc_versions WHERE id = ? AND brain_doc_id = ?').get(req.params.versionId, req.params.id);
      if (!version) return res.status(404).json({ error: 'Version not found' });
      // The client will apply the Yjs update, we just return it
      res.json({ ok: true, yjs_update: version.yjs_update });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // --- Notion Integration ---
  router.get('/pet/notion/status', (req, res) => {
    try {
      const row = db.prepare('SELECT * FROM notion_integrations WHERE user_id = ?').get(req.headers['x-user-id'] || 'default');
      res.json({ connected: !!row, workspace: row?.workspace_name || null, hasOAuth: !!row?.client_id });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // OAuth2: Generate authorization URL
  router.get('/pet/notion/oauth/url', (req, res) => {
    try {
      const row = db.prepare('SELECT * FROM notion_integrations WHERE user_id = ?').get(req.headers['x-user-id'] || 'default');
      if (!row?.client_id) return res.status(400).json({ error: 'OAuth client not configured' });
      const redirectUri = `${req.protocol}://${req.get('host')}/api/pet/notion/oauth/callback`;
      const state = crypto.randomUUID();
      const scope = 'read write';
      const url = `https://api.notion.com/v1/oauth/authorize?client_id=${row.client_id}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;
      res.json({ url, state });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // OAuth2: POST to generate auth URL (for popup)
  router.post('/pet/notion/oauth/authorize', (req, res) => {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const row = db.prepare('SELECT * FROM notion_integrations WHERE user_id = ?').get(userId);
      if (!row?.client_id) return res.status(400).json({ error: 'OAuth client not configured' });
      const redirectUri = `${req.protocol}://${req.get('host')}/api/pet/notion/oauth/callback`;
      const state = crypto.randomUUID();
      const scope = 'read write';
      const url = `https://api.notion.com/v1/oauth/authorize?client_id=${row.client_id}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;
      res.json({ url, state });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // OAuth2: Callback - exchange code for tokens
  router.get('/pet/notion/oauth/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const userId = req.headers['x-user-id'] || 'default';
    if (error) return res.redirect(`/?notion_error=${encodeURIComponent(error)}`);
    if (!code) return res.status(400).send('Missing code');
    try {
      const row = db.prepare('SELECT * FROM notion_integrations WHERE user_id = ?').get(userId);
      if (!row?.client_id || !row?.client_secret) return res.status(400).send('OAuth not configured');
      const redirectUri = `${req.protocol}://${req.get('host')}/api/pet/notion/oauth/callback`;
      const tokenResp = await fetch('https://api.notion.com/v1/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${Buffer.from(`${row.client_id}:${row.client_secret}`).toString('base64')}` },
        body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
      });
      const tokens = await tokenResp.json();
      if (!tokenResp.ok) throw new Error(tokens.error_description || 'Token exchange failed');
      const expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;
      db.prepare('INSERT OR REPLACE INTO notion_integrations (user_id, client_id, client_secret, access_token, refresh_token, workspace_id, workspace_name, bot_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(userId, row.client_id, row.client_secret, tokens.access_token, tokens.refresh_token, tokens.workspace_id, tokens.workspace_name, tokens.bot_id, expiresAt);
      res.redirect('/?notion_connected=1');
    } catch (err) {
      console.error('Notion OAuth error:', err);
      res.redirect(`/?notion_error=${encodeURIComponent(err.message)}`);
    }
  });

  // OAuth2: Save client credentials (admin step)
  router.post('/pet/notion/oauth/configure', (req, res) => {
    const { client_id, client_secret } = req.body;
    if (!client_id || !client_secret) return res.status(400).json({ error: 'client_id and client_secret required' });
    try {
      const userId = req.headers['x-user-id'] || 'default';
      db.prepare('INSERT OR REPLACE INTO notion_integrations (user_id, client_id, client_secret) VALUES (?, ?, ?)')
        .run(userId, client_id, client_secret);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/pet/notion/connect', (req, res) => {
    const { access_token, workspace_id, workspace_name, bot_id, expires_in } = req.body;
    if (!access_token) return res.status(400).json({ error: 'access_token required' });
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const expiresAt = expires_in ? Date.now() + expires_in * 1000 : null;
      db.prepare('INSERT OR REPLACE INTO notion_integrations (user_id, access_token, workspace_id, workspace_name, bot_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(userId, access_token, workspace_id, workspace_name, bot_id, expiresAt);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/pet/notion/disconnect', (req, res) => {
    try {
      db.prepare('DELETE FROM notion_integrations WHERE user_id = ?').run(req.headers['x-user-id'] || 'default');
      db.prepare('DELETE FROM notion_page_mappings WHERE user_id = ?').run(req.headers['x-user-id'] || 'default');
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/pet/notion/sync', async (req, res) => {
    const userId = req.headers['x-user-id'] || 'default';
    try {
      const integ = db.prepare('SELECT * FROM notion_integrations WHERE user_id = ?').get(userId);
      if (!integ) return res.status(400).json({ error: 'Notion not connected' });

      // Get all brain docs
      const docs = db.prepare('SELECT * FROM brain_docs ORDER BY created_at DESC').all();
      let synced = 0, errors = 0;

      for (const doc of docs) {
        try {
          // Check existing mapping
          const mapping = db.prepare('SELECT * FROM notion_page_mappings WHERE user_id = ? AND brain_doc_id = ?').get(userId, doc.id);

          const notionData = {
            parent: { database_id: integ.workspace_id },
            properties: {
              Title: { title: [{ text: { content: doc.title || 'Untitled' } }] },
              Content: { rich_text: [{ text: { content: doc.content.slice(0, 2000) } }] },
              Type: { select: { name: doc.type || 'text' } },
              Tags: { rich_text: [{ text: { content: doc.tags || '' } }] },
              Pinned: { checkbox: !!doc.pinned }
            }
          };

          let pageId;
          if (mapping) {
            // Update existing page
            await fetch(`https://api.notion.com/v1/pages/${mapping.notion_page_id}`, {
              method: 'PATCH',
              headers: { 'Authorization': `Bearer ${integ.access_token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
              body: JSON.stringify({ properties: notionData.properties })
            });
            pageId = mapping.notion_page_id;
          } else {
            // Create new page
            const resp = await fetch('https://api.notion.com/v1/pages', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${integ.access_token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
              body: JSON.stringify(notionData)
            });
            const data = await resp.json();
            pageId = data.id;
          }

          if (pageId) {
            db.prepare('INSERT OR REPLACE INTO notion_page_mappings (user_id, brain_doc_id, notion_page_id) VALUES (?, ?, ?)')
              .run(userId, doc.id, pageId);
            synced++;
          }
        } catch (e) { errors++; }
      }

      res.json({ ok: true, synced, errors, total: docs.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Bidirectional Notion sync (pull + push)
  router.post('/pet/notion/sync-bidi', async (req, res) => {
    const userId = req.headers['x-user-id'] || 'default';
    try {
      const integ = db.prepare('SELECT * FROM notion_integrations WHERE user_id = ?').get(userId);
      if (!integ) return res.status(400).json({ error: 'Notion not connected' });

      // --- PULL: fetch pages from Notion database ---
      let pulled = 0, pullErrors = 0;
      try {
        const resp = await fetch(`https://api.notion.com/v1/databases/${integ.workspace_id}/query`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${integ.access_token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
          body: JSON.stringify({ page_size: 100 })
        });
        const data = await resp.json();
        
        for (const page of data.results || []) {
          try {
            const pageId = page.id;
            const props = page.properties;
            const title = props.Title?.title?.[0]?.plain_text || props.Name?.title?.[0]?.plain_text || 'Untitled';
            const content = props.Content?.rich_text?.[0]?.plain_text || '';
            const type = props.Type?.select?.name || 'text';
            const tags = props.Tags?.rich_text?.[0]?.plain_text || '';
            const pinned = props.Pinned?.checkbox || false;

            // Check if already mapped
            const existing = db.prepare('SELECT * FROM notion_page_mappings WHERE user_id = ? AND notion_page_id = ?').get(userId, pageId);
            if (existing) {
              // Update existing brain doc
              db.prepare('UPDATE brain_docs SET title = ?, content = ?, type = ?, tags = ?, pinned = ? WHERE id = ?')
                .run(title, content, type, tags, pinned ? 1 : 0, existing.brain_doc_id);
            } else {
              // Create new brain doc
              const r = db.prepare('INSERT INTO brain_docs (title, content, type, tags, pinned, owner_id, permission) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .run(title, content, type, tags, pinned ? 1 : 0, userId, 'private');
              db.prepare('INSERT INTO notion_page_mappings (user_id, brain_doc_id, notion_page_id) VALUES (?, ?, ?)')
                .run(userId, r.lastInsertRowid, pageId);
            }
            pulled++;
          } catch (e) { pullErrors++; }
        }
      } catch (e) { pullErrors++; }

      // --- PUSH: existing sync logic ---
      const docs = db.prepare('SELECT * FROM brain_docs WHERE owner_id = ? ORDER BY created_at DESC').all(userId);
      let pushed = 0, pushErrors = 0;

      for (const doc of docs) {
        try {
          const mapping = db.prepare('SELECT * FROM notion_page_mappings WHERE user_id = ? AND brain_doc_id = ?').get(userId, doc.id);

          const notionData = {
            parent: { database_id: integ.workspace_id },
            properties: {
              Title: { title: [{ text: { content: doc.title || 'Untitled' } }] },
              Content: { rich_text: [{ text: { content: doc.content.slice(0, 2000) } }] },
              Type: { select: { name: doc.type || 'text' } },
              Tags: { rich_text: [{ text: { content: doc.tags || '' } }] },
              Pinned: { checkbox: !!doc.pinned }
            }
          };

          let pageId;
          if (mapping) {
            await fetch(`https://api.notion.com/v1/pages/${mapping.notion_page_id}`, {
              method: 'PATCH',
              headers: { 'Authorization': `Bearer ${integ.access_token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
              body: JSON.stringify({ properties: notionData.properties })
            });
            pageId = mapping.notion_page_id;
          } else {
            const resp = await fetch('https://api.notion.com/v1/pages', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${integ.access_token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
              body: JSON.stringify(notionData)
            });
            const data = await resp.json();
            pageId = data.id;
          }

          if (pageId) {
            db.prepare('INSERT OR REPLACE INTO notion_page_mappings (user_id, brain_doc_id, notion_page_id) VALUES (?, ?, ?)')
              .run(userId, doc.id, pageId);
            pushed++;
          }
        } catch (e) { pushErrors++; }
      }

      res.json({ ok: true, pull: { pulled, errors: pullErrors }, push: { pushed, errors: pushErrors } });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // --- Obsidian Integration ---
  router.get('/pet/obsidian/vaults', (req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM obsidian_vaults WHERE user_id = ?').all(req.headers['x-user-id'] || 'default');
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/pet/obsidian/vaults', (req, res) => {
    const { vault_path, vault_name } = req.body;
    if (!vault_path) return res.status(400).json({ error: 'vault_path required' });
    try {
      const userId = req.headers['x-user-id'] || 'default';
      db.prepare('INSERT INTO obsidian_vaults (user_id, vault_path, vault_name) VALUES (?, ?, ?)')
        .run(userId, vault_path, vault_name || 'Vault');
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/pet/obsidian/sync', async (req, res) => {
    const userId = req.headers['x-user-id'] || 'default';
    try {
      const vaults = db.prepare('SELECT * FROM obsidian_vaults WHERE user_id = ? AND sync_enabled = 1').all(userId);
      if (vaults.length === 0) return res.status(400).json({ error: 'No vaults configured' });

      const docs = db.prepare('SELECT * FROM brain_docs ORDER BY created_at DESC').all();
      let synced = 0, errors = 0;

      for (const vault of vaults) {
        try {
          const fs = await import('fs');
          const path = await import('path');
          const vaultPath = vault.vault_path;
          if (!fs.existsSync(vaultPath)) { errors++; continue; }

          for (const doc of docs) {
            const safeTitle = (doc.title || 'untitled').replace(/[<>:"/\\|?*]/g, '_').slice(0, 200);
            const filePath = path.join(vaultPath, `${safeTitle}.md`);
            const frontmatter = `---
title: "${doc.title || 'Untitled'}"
type: ${doc.type || 'text'}
tags: [${doc.tags || ''}]
pinned: ${doc.pinned ? 'true' : 'false'}
created: ${doc.created_at}
---
`;
            const content = frontmatter + '\n' + doc.content;
            fs.writeFileSync(filePath, content, 'utf8');
            synced++;
          }
        } catch (e) { errors++; }
      }

      db.prepare('UPDATE obsidian_vaults SET last_synced = datetime(\'now\') WHERE user_id = ?').run(userId);
      res.json({ ok: true, synced, errors, total: docs.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // --- Obsidian Watcher ---
  router.post('/pet/obsidian/watch/start', (req, res) => {
    const userId = req.headers['x-user-id'] || 'default';
    const { vault_id } = req.body;
    try {
      const vault = db.prepare('SELECT * FROM obsidian_vaults WHERE id = ? AND user_id = ?').get(vault_id, userId);
      if (!vault) return res.status(404).json({ error: 'Vault not found' });
      req.app.get('obsidianWatcher').startWatching(userId, vault.vault_path);
      db.prepare('UPDATE obsidian_vaults SET auto_watch = 1 WHERE id = ?').run(vault_id);
      res.json({ ok: true, status: req.app.get('obsidianWatcher').getStatus(userId) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/pet/obsidian/watch/stop', (req, res) => {
    const userId = req.headers['x-user-id'] || 'default';
    try {
      req.app.get('obsidianWatcher').stopWatching(userId);
      db.prepare('UPDATE obsidian_vaults SET auto_watch = 0 WHERE user_id = ?').run(userId);
      res.json({ ok: true, status: req.app.get('obsidianWatcher').getStatus(userId) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/pet/obsidian/watch/status', (req, res) => {
    const userId = req.headers['x-user-id'] || 'default';
    res.json(req.app.get('obsidianWatcher').getStatus(userId));
  });

  // --- Reminders ---

  router.get('/pet/reminders', (req, res) => {
    try {
      const { done } = req.query;
      if (done === 'true') {
        res.json(db.prepare('SELECT * FROM reminders WHERE done = 1 ORDER BY due_at DESC').all());
      } else if (done === 'all') {
        res.json(db.prepare('SELECT * FROM reminders ORDER BY done, due_at ASC').all());
      } else {
        res.json(db.prepare('SELECT * FROM reminders WHERE done = 0 ORDER BY due_at ASC').all());
      }
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/pet/reminders', (req, res) => {
    const { message, due_at, recurrence = '' } = req.body;
    if (!message || !due_at) return res.status(400).json({ error: 'message and due_at are required' });
    try {
      const r = db.prepare('INSERT INTO reminders (message, due_at, recurrence) VALUES (?, ?, ?)').run(message, due_at, recurrence);
      res.json({ id: r.lastInsertRowid, ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.patch('/pet/reminders/:id', (req, res) => {
    try {
      const { done, message } = req.body;
      if (done !== undefined) db.prepare('UPDATE reminders SET done = ? WHERE id = ?').run(done ? 1 : 0, req.params.id);
      if (message !== undefined) db.prepare('UPDATE reminders SET message = ? WHERE id = ?').run(message, req.params.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/pet/reminders/:id', (req, res) => {
    try { db.prepare('DELETE FROM reminders WHERE id = ?').run(req.params.id); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/pet/reminders/due', (req, res) => {
    try {
      const due = db.prepare(`SELECT * FROM reminders WHERE done = 0 AND due_at <= datetime('now','localtime') ORDER BY due_at ASC`).all();
      res.json(due);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // --- Embeddings & semantic search ---

  async function getEmbedding(text) {
    if (process.env.OPENAI_API_KEY) {
      const r = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
      });
      const d = await r.json();
      return d.data?.[0]?.embedding || null;
    }
    if (process.env.OLLAMA_BASE_URL) {
      const r = await fetch(`${process.env.OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
      });
      const d = await r.json();
      return d.embedding || null;
    }
    return null;
  }

  function cosineSimilarity(a, b) {
    let dot = 0, nA = 0, nB = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; nA += a[i] * a[i]; nB += b[i] * b[i]; }
    return dot / (Math.sqrt(nA) * Math.sqrt(nB));
  }

  router.post('/pet/brain/embed', async (req, res) => {
    try {
      const { id } = req.body;
      const docs = id
        ? db.prepare('SELECT * FROM brain_docs WHERE id = ?').all(id)
        : db.prepare('SELECT * FROM brain_docs WHERE id NOT IN (SELECT doc_id FROM brain_embeddings)').all();
      if (docs.length === 0) return res.json({ ok: true, count: 0 });
      let count = 0;
      for (const doc of docs) {
        const text = `${doc.title}\n${doc.content}`.slice(0, 8000);
        const emb = await getEmbedding(text);
        if (emb) {
          db.prepare('INSERT OR REPLACE INTO brain_embeddings (doc_id, embedding) VALUES (?, ?)').run(doc.id, JSON.stringify(emb));
          count++;
        }
      }
      res.json({ ok: true, count });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/pet/brain/search', async (req, res) => {
    const { query, top_k = 5, threshold = 0.3 } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });
    try {
      // Try semantic search first
      const qEmb = await getEmbedding(query);
      if (qEmb) {
        const all = db.prepare(`SELECT bd.*, be.embedding FROM brain_docs bd JOIN brain_embeddings be ON be.doc_id = bd.id`).all();
        const scored = all.map(d => ({ ...d, score: cosineSimilarity(qEmb, JSON.parse(d.embedding)) }));
        const results = scored.filter(d => d.score > threshold).sort((a, b) => b.score - a.score).slice(0, top_k);
        return res.json({ results, mode: 'semantic' });
      }
      // Fallback to keyword search
      const results = db.prepare('SELECT *, 0 as score FROM brain_docs WHERE content LIKE ? OR title LIKE ? ORDER BY pinned DESC, created_at DESC LIMIT ?').all(`%${query}%`, `%${query}%`, top_k);
      res.json({ results, mode: 'keyword' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // --- Chat with brain context (pinned + semantic) ---

  router.post('/pet/chat', async (req, res) => {
    const { message, history = [] } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'message is required' });

    try {
      // Brain context: pinned docs + semantic search results
      const pinnedDocs = db.prepare('SELECT title, content FROM brain_docs WHERE pinned = 1 ORDER BY created_at DESC').all();
      let semanticDocs = [];
      try {
        const qEmb = await getEmbedding(message);
        if (qEmb) {
          const all = db.prepare(`SELECT bd.title, bd.content, be.embedding FROM brain_docs bd JOIN brain_embeddings be ON be.doc_id = bd.id WHERE bd.pinned = 0`).all();
          const scored = all.map(d => ({ ...d, score: cosineSimilarity(qEmb, JSON.parse(d.embedding)) }));
          semanticDocs = scored.filter(d => d.score > 0.25).sort((a, b) => b.score - a.score).slice(0, 3);
        }
      } catch(e) {}

      const contextParts = [];
      if (pinnedDocs.length) contextParts.push('📌 PINNED NOTES:\n' + pinnedDocs.map(d => `[${d.title}]: ${d.content}`).join('\n\n'));
      if (semanticDocs.length) contextParts.push('📎 RELATED NOTES:\n' + semanticDocs.map(d => `[${d.title}]: ${d.content}`).join('\n\n'));
      const brainContext = contextParts.join('\n\n');

      const chatHistory = history.map(m => ({ role: m.role, content: m.content }));
      chatHistory.push({ role: 'user', content: message });

      const fullMessages = [{ role: 'system', content: brainContext
        ? `${SOPHIA_SYSTEM_PROMPT}\n\nHere is context from your second brain you can reference:\n${brainContext}`
        : SOPHIA_SYSTEM_PROMPT }, ...chatHistory];

      const result = await callAI(fullMessages, false);
      const inputTokens = result.usage?.input_tokens || result.usage?.prompt_tokens || 0;
      const outputTokens = result.usage?.output_tokens || result.usage?.completion_tokens || 0;
      const costUsd = (inputTokens / 1000) * 0.00015 + (outputTokens / 1000) * 0.0006;

      db.prepare(`
        INSERT INTO usage_events (provider, model, input_tokens, output_tokens, cost_usd, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('wgw-pet', result.model || 'unknown', inputTokens, outputTokens, costUsd, JSON.stringify({ source: 'floating-pet' }));

      res.json({ reply: result.reply, model: result.model, usage: { input_tokens: inputTokens, output_tokens: outputTokens }, brain_docs_used: pinnedDocs.length + semanticDocs.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
