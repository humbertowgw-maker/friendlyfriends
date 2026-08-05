# friendlyfriends

A self-hosted Node/React app that does two very different jobs in one codebase:

1. **AI provider cost & rate-limit dashboard** — tracks usage across OpenAI, Anthropic, Gemini, OpenRouter, and local models (Ollama/LM Studio), scores which model to route a task to based on real usage history, predicts spend, and fires alerts.
2. **A zero-budget animated-episode pipeline** for a real cast of pets — Achilles (blind service dog), Athena (his diabetic sister), Henry (deaf white cat), Falcor (cross-eyed white cat), Peter (parakeet), and Walter (his lovebird cage-mate) — turning short scripts into character art, TTS dialogue, and assembled MP4 episodes using only free tools (Pollinations.ai, Edge TTS, FFmpeg).

Bolted on top of both is "Sophia," a floating desktop-pet chat assistant with real-time multi-user sync.

The `package.json` name was `ai-rate-gauge` until it was renamed to `friendlyfriends` — that old slug is the oldest evidence in the repo of the app's original scope before the episode pipeline and Sophia were layered in. One leftover remains: `server/db/database.js` still points at `data/rate-gauge.db` — left as-is since the file is gitignored and renaming it would orphan any existing data on a running deployment rather than migrate it.

## Stack

- **Server**: Node.js (ESM) + Express, `sql.js` (SQLite compiled to WASM, no native bindings), Server-Sent Events for live updates, a `y-websocket` server for CRDT sync.
- **Client**: React + Vite, no UI framework — hand-rolled styles.
- **Media pipeline**: Pollinations.ai (free image gen, no key), Edge TTS (free, no key — Microsoft's edge-tts CLI), FFmpeg (Ken Burns effect + concat), with an adapter pattern that also supports local Stable Diffusion (Automatic1111/ComfyUI) and HuggingFace's free tier, tried in priority order with fallback.
- **Deploy**: Railway (`railway.toml`), two services — the Express/API app and a standalone `yjs` WebSocket server.

## Architecture notes / real decisions

- **Generator adapters with a fallback chain, not a single provider.** `server/generators/` implements a common interface (`base-generator.js`) with Pollinations, local SD/ComfyUI, and HuggingFace behind it. `GeneratorManager` health-checks each and falls back automatically — the whole episode pipeline still runs with zero API keys configured, which is the actual point: this was built to cost nothing to operate.
- **Inventory-first asset resolution.** Before generating a new character pose/expression, `PipelineHook` looks up whether the asset already exists and reuses it, only calling out to a generator on a genuine gap. Generation is the expensive/slow path; the system defaults to not doing it.
- **The pipeline was validated end-to-end before it was called "done."** `test-pipeline.mjs` and `test-episode-build.mjs` are committed integration scripts, not throwaway snippets — the commit messages record real measured output from actual runs (`b727172`: "FFmpeg Ken Burns video (1280x720, 9.2s): OK"; `8fc7ffe`: "Final concatenated MP4: 21s, 1280x720"). That's evidence the pipeline was run and its output inspected, not just written and assumed to work.
- **A shipped feature (`fleet/`) was cut when it broke production.** Commit `b970d77` ("Fix broken production build and inventory tab") removes all references to `FleetManager`/`WorkerNode`/`TaskQueue`/`fleet-routes` from `server/index.js` and a "fleet" tab from the client — those source files were never actually committed, so the app referenced modules that didn't exist in the repo and failed to build in production. The fix was to rip the half-shipped feature out rather than patch around it.
- **The Railway CI workflow was added, "fixed," then deleted three commits later.** `4622161` added a GitHub Action to `railway up` on push; `95fa38c` fixed how the `RAILWAY_TOKEN` was passed to the CLI; `7c1ce42` then deleted the workflow file entirely. Net effect: no GitHub Actions deploy exists in the repo today. Whatever deploy path is actually in use (Railway's own git-connected auto-deploy, or manual `railway up`) isn't captured in this repo — this is a gap, not a documented decision.
- **SmartRouter's recommendation isn't a stub.** It queries `usage_events` for real cost-per-token/latency/usage-count over a trailing 30-day window and scores providers with a weighted formula that changes by task type (cost-sensitive vs. speed vs. quality). It returns "no recommendation yet" honestly when there isn't enough usage history, rather than faking a result.

## What's real vs. not

**Working, with evidence in the commit history:**
- Character/episode pipeline (image → TTS → Ken Burns video → concatenated MP4), validated by committed integration test runs.
- Inventory system (characters, poses, expressions, batch generation, gap tracking) with a real SQLite schema behind it.
- Cost/rate dashboard components (RateGauge, CostChart, SmartRouter, Predictions, AlertPanel) reading from real usage-event queries, not mock data.
- Sophia: floating chat pet with persistent history, Yjs CRDT multi-device sync, Notion OAuth + bidirectional sync, Obsidian file-watching, PWA/offline support — a large amount of surface area (`FloatingPet.jsx` alone is ~1,350 lines) added across two dense commits (`4624396`, `7f3574e`).

**Gaps, stated plainly:**
- No automated test suite or CI. `test-pipeline.mjs` / `test-episode-build.mjs` are manual integration scripts run by hand, not wired into anything that runs on push.
- No GitHub Actions workflow currently exists — it was tried and removed (see above). How/whether this actually redeploys today isn't documented in-repo.
- The `fleet/` distributed-worker feature was scoped, referenced in `server/index.js`, and then cut before its source files were ever committed — evidence of a feature that didn't make it past the idea stage in this codebase.
- `package.json`'s name/description have been updated to `friendlyfriends`, but the SQLite data file is still named `rate-gauge.db` internally (see above) — a deliberate non-fix pending a real data migration plan.
