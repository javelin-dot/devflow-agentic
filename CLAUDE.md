# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

DevFlow is an **agent-first requirement lifecycle management platform**. Requirements move through stages (`backlog → analyzing → development → uat → prerelease → released`) entirely driven by agents via the HTTP API. No human is required in the execution path — humans steer, agents execute.

**If you are acting as an agent executing a requirement**, read `AGENTS.md` first — it is the authoritative agent entry point with harness navigation and the three must-never / must-do rules.

## Monorepo Structure

npm workspaces: `client` (React SPA), `server` (Hono API), `shared` (TypeScript types).

- `harness/` — Agent execution contracts (architecture, spec format, domain model, API protocol, stage gates, test contract, playbook). **Authority source for agent behavior.**
- `specs/` — Milestone YAML specs (M0–M5). Validate with `node harness/tools/validate-spec.mjs`.
- `doc/` — Product docs; `PRD-SPEC-v2.md` is the single source of truth for product design.
- `server/src/routes/` — 17+ Hono route modules; `server/src/db/` — SQLite schema + bootstrap migration.
- `client/src/views/` — Page-level React components; `client/src/api/` — TanStack Query hooks.
- `shared/src/index.ts` — All shared types (Stage enum, Requirement, Project, ChatSession, etc.).

## Common Commands

```bash
# Install (OS-aware Node via fnm: Win→20, macOS/Linux→22)
npm run setup:node
npm run install:dev

# Development (frontend http://localhost:5173, backend http://localhost:4000)
npm run dev

# Build all workspaces (shared → server → client)
npm run build

# Backend only / frontend only
npm run dev --workspace=server
npm run dev --workspace=client

# Type check
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit

# Validate a milestone spec
node harness/tools/validate-spec.mjs specs/M1-core-flow.yaml

# Direct DB access
sqlite3 server/data/devflow.db
```

## Architecture Notes

**Backend**: Hono framework with better-sqlite3 (WAL mode). DB schema runs `bootstrap()` on startup — no separate migration command. All agent-initiated side effects must be logged via `POST /api/events` with `actor=agent`.

**Frontend**: React 18 + Vite + TanStack Query + Zustand. API base is `http://localhost:4000/api`.

**Stage gates** (`harness/05-stage-gates.md`) are the **sole authority** on when a stage transition is legal. The backend enforces them; never advance stage without running all `verify_commands` first.

**Runtime feature detection**: Don't hardcode feature availability. Use `GET /api/runtime/state` for `.features` flags and `GET /api/agent/availability` for CLI availability. v1.1 draft endpoints (`/quality-gate/check`, `/subtasks/:id/verify`, `/runs/*`) are not implemented until the feature flag appears.

## Key Harness Documents

| Need | File |
|---|---|
| End-to-end execution flow | `harness/07-execution-playbook.md` |
| RequirementSpec format + validation | `harness/02-requirement-spec.md` |
| Full API contract | `harness/04-agent-protocol.md` |
| Stage transition rules (authority) | `harness/05-stage-gates.md` |
| Test result format | `harness/06-test-contract.md` |
| Design principles + human-in-loop positions | `harness/PRINCIPLES.md` |
