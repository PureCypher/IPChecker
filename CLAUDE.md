# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IP Intelligence Correlator — a multi-provider IP lookup platform that queries 26 threat intelligence providers in parallel, correlates results using trust-weighted voting, and optionally runs LLM-powered threat analysis. Built with Fastify + React + TypeScript as an npm workspaces monorepo.

## Commands

### Development
```bash
./start-local.sh              # One-shot: creates .env, starts Redis/Postgres, runs migrations, starts dev servers
npm run dev                    # Start backend (Fastify on :3000) + frontend (Vite on :5173) concurrently
docker compose up redis db -d  # Start only infrastructure for local dev
```

### Build
```bash
npm run build                  # Builds shared → backend → frontend (order matters)
npm run prisma:generate        # Generate Prisma client after schema changes
npm run prisma:migrate         # Run prisma migrate dev (creates migration)
```

### Test
```bash
npm run test                   # Run all tests (backend + frontend)
npm run test:unit              # Unit tests only
npm run test:integration       # Backend integration tests
npm --workspace=backend run test:watch  # Watch mode for backend tests
npm --workspace=frontend run test:watch # Watch mode for frontend tests
cd frontend && npx playwright test      # E2E tests
```

Backend tests use vitest with `vitest.config.ts` (all), `vitest.config.unit.ts`, and `vitest.config.integration.ts`. Frontend tests use vitest with jsdom + React Testing Library.

### Lint & Type Check
```bash
npm run lint                   # ESLint across both workspaces
npm run type-check             # TypeScript --noEmit across both workspaces
```

### Docker
```bash
docker compose up -d                          # Full stack (web + redis + db)
docker compose --profile ollama up -d         # Include local Ollama LLM
docker compose exec web sh -c "cd backend && npx prisma migrate deploy"  # Run migrations in container
```

## Architecture

### Monorepo Structure (npm workspaces)

- **`shared/`** — Zod schemas and TypeScript types (`@ipintel/shared`). Both backend and frontend import from here. Must be built first.
- **`backend/`** — Fastify server (`@ipintel/backend`). ESM modules, path aliases resolved via `tsc-alias` with `.tscpaths.json`.
- **`frontend/`** — React 18 SPA (`@ipintel/frontend`). Vite + Tailwind CSS. Dark-mode-only UI.

### Backend Request Flow

1. **Route** (`backend/src/routes/lookup.ts`) validates input with Zod
2. **IpLookupService** (`backend/src/services/ip-lookup.ts`) orchestrates the pipeline:
   - Validates/normalizes IP via `ip-validation.ts`
   - Checks Redis cache → PostgreSQL fallback → live provider query
   - Uses request coalescing (deduplicates concurrent lookups for same IP)
3. **ProviderManager** (`backend/src/providers/provider-manager.ts`) fans out to all enabled providers with `p-limit` concurrency control
4. **BaseProvider** (`backend/src/providers/base-provider.ts`) wraps each provider with circuit breaker + retry logic
5. **CorrelationService** (`backend/src/services/correlation.ts`) merges results using trust-weighted voting, resolves conflicts
6. **LLMAnalysisService** (`backend/src/services/llm-analysis.ts`) optionally adds AI threat assessment (Ollama or OpenAI-compatible API)
7. Result is cached in Redis (30-day TTL) and persisted to PostgreSQL

### Provider System

All 26 providers extend `BaseProvider` and implement `performLookup()`. The provider registry (`backend/src/providers/registry.ts`) maps config names to classes. To add a new provider:
1. Create `backend/src/providers/your-provider.ts` extending `BaseProvider`
2. Add to `registry.ts`
3. Add config entry in `ProviderManager.getProviderConfigs()`

Trust ranks (1-10) are configurable via env vars and drive conflict resolution in the correlation service. VPN detection uses a layered approach: ProxyCheck.io `operator.name` (highest trust) → ASN matching (`vpn-provider-mapping.ts`) → org name pattern matching.

### Frontend Architecture

React SPA with tabs: IP Lookup (streaming), Bulk Lookup, Compare, Dashboard. Key patterns:
- `useStreamingLookup` hook consumes SSE from `/api/v1/lookup/stream` for real-time provider progress
- `@tanstack/react-query` for data fetching (health, stats)
- Leaflet maps for geolocation visualization
- `ApiClient` singleton in `frontend/src/lib/api.ts`

### Database

PostgreSQL with Prisma ORM. Schema at `backend/prisma/schema.prisma`. Key models: `IpRecord` (IP as primary key, JSON fields for flags/threat/providers), `ProviderStat`, `ApiKey`, `RateLimitEntry`.

### Caching

Two-tier: Redis (primary, 30-day TTL with background refresh at 25 days) → PostgreSQL (fallback). Cache keys are normalized IPs.

### Configuration

All config flows through `backend/src/config/env.ts`. Provider API keys are optional — providers auto-disable when keys are missing. LLM supports two modes: `LLM_PROVIDER=ollama` (local) or `LLM_PROVIDER=openai` (cloud-compatible: Groq, Together AI, OpenRouter, etc.).

## Key Conventions

- Backend is ESM (`"type": "module"`) — all imports use `.js` extensions
- Shared types use Zod schemas as source of truth, with inferred TypeScript types
- Provider trust ranks are env-configurable and cached at module load time in `correlation.ts`
- API versioning: routes are prefixed `/api/v1/`; health endpoints at `/api/health`
- Admin endpoints require `X-Admin-Key` header; lookup endpoints optionally require `X-API-Key` (controlled by `REQUIRE_API_KEY` env var)
- Prettier config: single quotes, semicolons, trailing commas `es5`, 100 char print width
