# Deployment

This document is an honest account of what the deploy mechanism for this app
actually is, based only on evidence available in this repository and the
public GitHub API — not on access to the Railway dashboard, which this
investigation did not have.

## What's configured in-repo

`railway.toml` at the repo root defines two Railway services from the same
source (`.`):

- **`web`** — builds with `cd client && npm run build` (nixpacks builder),
  starts with `npm run server` (i.e. `node server/index.js`), health-checked
  at `/api/health`, restarts on failure (max 3 retries).
- **`yjs`** — same source, starts with `node server/yjs-server.js`
  (the standalone Yjs CRDT WebSocket server for Maria's multi-device sync),
  health-checked at `/health`.

That's the entire deploy configuration present in the repo. There is no
Dockerfile, no `nixpacks.toml`, no Procfile, and no `.github/workflows/`
directory — the `.github` directory doesn't exist at all right now.

## What used to be here, and isn't anymore

A GitHub Actions workflow that ran `railway up --ci` on every push to
`master` was added, patched, and then deleted, all within a few commits of
each other:

- `4622161` — added `.github/workflows/railway-deploy.yml`, running
  `railway up --ci` with `RAILWAY_TOKEN` from a repo secret.
- `95fa38c` — fixed how `RAILWAY_TOKEN` was passed to the CLI.
- `7c1ce42` — deleted the workflow file entirely.

Net effect: **no GitHub Actions deploy workflow exists in this repo today.**
Whatever caused it to be removed (rather than just fixed further) isn't
recorded in the commit messages, so the reasoning behind abandoning it is
not something this investigation can reconstruct from the repo alone.

## What's most likely actually happening

Given that `railway.toml` exists and defines two named services, but no
in-repo automation deploys them, the most plausible live mechanism is
**Railway's own GitHub integration** — a connection made entirely on
Railway's side (Project Settings → Service → Source, "Deploy from GitHub
repo") that watches the connected branch and auto-deploys on push, using
`railway.toml` for build/start commands. This is a standard Railway feature
and doesn't require any file in the repo — which is consistent with the
repo showing a `railway.toml` but no deploy automation of its own.

The alternative is that deploys happen via manual `railway up` from
someone's machine (using the Railway CLI, linked to the project with
`railway link`). Nothing in the repo distinguishes between these two
possibilities.

### Evidence checked, and its limits

Using the GitHub API against this repo (`gh api repos/humbertowgw-maker/friendlyfriends/...`):

- `/hooks` returns `[]` — no classic repo webhooks are registered.
- `/commits/<sha>/status` and `/commits/<sha>/check-runs` on the latest
  commits (including today's `2d4a542` crash fix) return zero statuses and
  zero check runs — nothing is currently posting deploy status back to
  GitHub for these commits.
- `/deployments` (GitHub's Deployments API) returns `[]`.

None of this is conclusive. Railway's GitHub App integration is typically
installed as a GitHub App, not a classic webhook, and doesn't necessarily
post commit statuses or use the Deployments API depending on how it's
configured — so an empty result on all three doesn't rule auto-deploy in or
out. It only rules out a classic-webhook or Actions-based mechanism, both of
which are independently confirmed absent from the repo already.

## What can't be confirmed from the repo alone

The following require checking the Railway dashboard directly, which this
investigation did not have access to:

- Whether the `web` and `yjs` services are actually connected to this GitHub
  repo, and if so, whether auto-deploy on push is enabled.
- Whether today's crash fix (`2d4a542`, removing the dead
  `workerNode`/`taskQueue` boot calls) has actually been deployed, or is
  still sitting on `master` waiting for a manual deploy trigger.
- The live URL(s) for either service, and their current health/uptime.
- Whether environment variables required at runtime (see `.env.example`) are
  set in Railway's dashboard — nothing about this is visible from git.
- Whether `railway up` has ever been run manually for this project.

**If you're reading this and have dashboard access:** check Project →
Service → Settings → Source on both `web` and `yjs` to see whether a GitHub
repo is connected and whether "Auto Deploy" is on. That single screen
answers the open question above more reliably than anything inferable from
this repo.

## How to deploy manually, if needed

```bash
npm install -g @railway/cli
railway login
railway link          # link this directory to the Railway project
railway up            # deploys using railway.toml
```

Run this separately for each service if the CLI doesn't infer both from one
`railway.toml` (it should, since both services are declared with
`source = "."`, but this hasn't been verified against a live deploy in this
investigation).
