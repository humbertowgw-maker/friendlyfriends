# friendlyfriends

> **Project status:** First public version. This is an early-stage project and should be treated as a development preview, not a finished production product.

A self-hosted Node/React app that does two very different jobs in one codebase:

1. **AI provider cost & rate-limit dashboard** — tracks usage across OpenAI, Anthropic, Gemini, OpenRouter, and local models (Ollama/LM Studio), scores which model to route a task to based on real usage history, predicts spend, and fires alerts.
2. **A zero-budget animated-episode pipeline** for a real cast of pets — Achilles (blind service dog), Athena (his diabetic sister), Henry (deaf white cat), Falcor (cross-eyed white cat), Peter (parakeet), and Walter (his lovebird cage-mate) — turning short scripts into character art, TTS dialogue, and assembled MP4 episodes using only free tools (Pollinations.ai, Edge TTS, FFmpeg).

Bolted on top of both is "Maria," a floating desktop-pet chat assistant with real-time multi-user sync.

The `package.json` name was `ai-rate-gauge` until it was renamed to `friendlyfriends` — that old slug is the oldest evidence in the repo of the app's original scope before the episode pipeline and Maria were layered in. One leftover remains: `server/db/database.js` still points at `data/rate-gauge.db` — left as-is since the file is gitignored and renaming it would orphan any existing data on a running deployment rather than migrate it.

## Stack

- **Server**: Node.js (ESM) + Express, `sql.js` (SQLite compiled to WASM, no native bindings), Server-Sent Events for live updates, a `y-websocket` server for CRDT sync.
- **Client**: React + Vite, no UI framework — hand-rolled styles.
- **Media pipeline**: Pollinations.ai (free image gen, no key), Edge TTS (free, no key — Microsoft's edge-tts CLI), FFmpeg (Ken Burns effect + concat), with an adapter pattern that also supports local Stable Diffusion (Automatic1111/ComfyUI) and HuggingFace's free tier, tried in priority order with fallback.
- **Deploy**: Railway (`railway.toml`), two services — the Express/API app and a standalone `yjs` WebSocket server. See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for what's actually confirmed about how deploys happen today vs. what requires checking the Railway dashboard directly.
- **Tests**: Vitest (`npm test`). Unit coverage on the generator fallback chain, inventory-first asset resolution, and SmartRouter's provider-scoring logic — see the "Testing" section below.

## Architecture notes / real decisions

- **Generator adapters with a fallback chain, not a single provider.** `server/generators/` implements a common interface (`base-generator.js`) with Pollinations, local SD/ComfyUI, and HuggingFace behind it. `GeneratorManager` health-checks each and falls back automatically — the whole episode pipeline still runs with zero API keys configured, which is the actual point: this was built to cost nothing to operate.
- **Inventory-first asset resolution.** Before generating a new character pose/expression, `PipelineHook` looks up whether the asset already exists and reuses it, only calling out to a generator on a genuine gap. Generation is the expensive/slow path; the system defaults to not doing it.
- **The pipeline was validated end-to-end before it was called "done."** `test-pipeline.mjs` and `test-episode-build.mjs` are committed integration scripts, not throwaway snippets — the commit messages record real measured output from actual runs (`b727172`: "FFmpeg Ken Burns video (1280x720, 9.2s): OK"; `8fc7ffe`: "Final concatenated MP4: 21s, 1280x720"). That's evidence the pipeline was run and its output inspected, not just written and assumed to work.
- **A shipped feature (`fleet/`) was cut when it broke production — twice.** Commit `b970d77` ("Fix broken production build and inventory tab") removes references to `FleetManager`/`WorkerNode`/`TaskQueue`/`fleet-routes` from `server/index.js` and a "fleet" tab from the client — those source files were never actually committed, so the app referenced modules that didn't exist in the repo and failed to build in production. That cleanup missed two call sites (`workerNode.start()`, `taskQueue.startPolling()`) still invoked on server boot; commit `2d4a542` removed those too, after they'd been crashing every server start (including Railway's) since `b970d77` landed. The fix was to rip the half-shipped feature all the way out rather than patch around it.
- **The Railway CI workflow was added, "fixed," then deleted three commits later.** `4622161` added a GitHub Action to `railway up` on push; `95fa38c` fixed how the `RAILWAY_TOKEN` was passed to the CLI; `7c1ce42` then deleted the workflow file entirely. Net effect: no GitHub Actions deploy exists in the repo today. See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for what's actually verifiable about the real deploy path (most likely Railway's own git-connected auto-deploy, configured on Railway's side and invisible to this repo) versus what can only be confirmed by checking the Railway dashboard directly.
- **SmartRouter's recommendation isn't a stub.** It queries `usage_events` for real cost-per-token/latency/usage-count over a trailing 30-day window and scores providers with a weighted formula that changes by task type (cost-sensitive vs. speed vs. quality). It returns "no recommendation yet" honestly when there isn't enough usage history, rather than faking a result.

## Testing

`npm test` runs the Vitest suite (`npm run test:watch` for watch mode). Coverage is unit-level, targeting the logic identified as highest-risk/highest-value rather than converting the existing manual integration scripts into E2E tests:

- `server/generators/index.test.js` — `GeneratorManager`'s fallback chain: priority ordering independent of registration order, falling through failed/disabled/unconfigured adapters in priority order, and honest failure when nothing is configured.
- `server/inventory/pipeline-hook.test.js` — inventory-first asset resolution: reuses existing assets without ever invoking the generator, generates only on a genuine miss, doesn't cross-match across characters/asset types, and correctly auto-resolves matching pending gaps.
- `server/smart-router.test.js` — `SmartRouter`'s provider-scoring: correct pick per task type (cost-sensitive/speed/quality/default), honest "no recommendation yet" with no usage data, no divide-by-zero on free/zero-latency providers, and correctly ordered alternatives.

`test-pipeline.mjs` and `test-episode-build.mjs` remain as-is — they're real, hand-run integration scripts against live external services (Pollinations, FFmpeg) with measured output recorded in their commit messages, not something a mocked unit suite should replace.

## What's real vs. not

**Working, with evidence in the commit history:**
- Character/episode pipeline (image → TTS → Ken Burns video → concatenated MP4), validated by committed integration test runs.
- Inventory system (characters, poses, expressions, batch generation, gap tracking) with a real SQLite schema behind it.
- Cost/rate dashboard components (RateGauge, CostChart, SmartRouter, Predictions, AlertPanel) reading from real usage-event queries, not mock data.
- Maria: floating chat pet with persistent history, Yjs CRDT multi-device sync, Notion OAuth + bidirectional sync, Obsidian file-watching, PWA/offline support — a large amount of surface area (`FloatingPet.jsx` alone is ~1,350 lines) added across two dense commits (`4624396`, `7f3574e`).
- A Vitest unit suite covering the generator fallback chain, inventory-first resolution, and SmartRouter scoring (see "Testing" above).

**Gaps, stated plainly:**
- No CI runs the test suite on push — `npm test` exists and passes locally, but nothing in the repo triggers it automatically. `test-pipeline.mjs` / `test-episode-build.mjs` remain manual integration scripts run by hand.
- No GitHub Actions workflow currently exists — it was tried and removed (see above). See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for what is and isn't confirmable about the real deploy path from the repo alone.
- The `fleet/` distributed-worker feature was scoped, referenced in `server/index.js`, and then cut before its source files were ever committed — evidence of a feature that didn't make it past the idea stage in this codebase. It took two separate commits (`b970d77`, `2d4a542`) to fully remove.
- `package.json`'s name/description have been updated to `friendlyfriends`, but the SQLite data file is still named `rate-gauge.db` internally (see above) — a deliberate non-fix pending a real data migration plan.
