# Sensei

Sensei is a WhatsApp business assistant with a web workspace for configuring an AI assistant and managing customer conversations.

## Run & Operate

- `pnpm --filter @workspace/sensei run dev` — run the web preview
- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `PORT=5173 BASE_PATH=/ pnpm run build` — typecheck + build workspace artifacts
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Run `supabase/migrations/20261027_sensei.sql` in the Supabase SQL Editor to initialize the schema.
- Required secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`; `NVIDIA_API_KEY` enables the AI fallback.
- Railway build/start settings are in `railway.json`; production serves the web app and API from one service.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/sensei` — React/Vite web app
- `artifacts/api-server` — Express API and WhatsApp integration
- `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` — API contract and generated client
- `supabase/migrations` — database schema and access policies

## Architecture decisions

- Supabase Auth is the identity provider; the API verifies user access tokens.
- WhatsApp session state is encrypted and persisted in Supabase.
- Groq is the primary AI provider; NVIDIA is the optional fallback.

## Product

Businesses can configure an assistant, pair a WhatsApp number, and review customer conversations.

## User preferences

## Gotchas

- Vite needs `PORT` and `BASE_PATH` at build time; set `PORT=5173 BASE_PATH=/` for standalone production builds.
- Apply the Supabase migration before signing in or using the dashboard.
- Never publish `.env` or expose the Supabase service-role key to the frontend.

## Pointers

- `README.md` contains local setup and GitHub-to-Railway deployment steps.
- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
