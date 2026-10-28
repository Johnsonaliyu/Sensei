# Sensei

Sensei is a WhatsApp business assistant with a web workspace for configuring an AI assistant, connecting a WhatsApp number, and reviewing customer conversations.

## Stack

- React, Vite, and TypeScript frontend
- Express API, served together with the frontend in production
- Supabase Auth and Postgres
- Groq as the primary AI provider, with NVIDIA as a fallback
- Baileys for WhatsApp Web connections

## Run locally

Requirements: Node.js 20 or newer and pnpm 10.

1. Copy `.env.example` to `.env` and fill in the Supabase URL, anon key, service-role key, and AI provider keys. Keep `.env` private.
2. In the Supabase SQL Editor, run `supabase/migrations/20261027_sensei.sql`.
3. Install dependencies with `pnpm install`.
4. Start the Replit preview using its configured workflows, or build and run production locally:

   ```sh
   pnpm install --frozen-lockfile
   pnpm run typecheck
   PORT=5173 BASE_PATH=/ pnpm --filter @workspace/sensei run build
   pnpm --filter @workspace/api-server run build
   NODE_ENV=production PORT=5000 pnpm --filter @workspace/api-server run start
   ```

   Open `http://localhost:5000`. The API health endpoint is `/api/healthz`.

## Deploy to Railway from GitHub

The repository includes `railway.json`. Create one Railway service from the GitHub repository root and let Railway use that configuration. It builds the web app and API, starts the API, serves the web app from the same domain, and checks `/api/healthz`.

Add these variables to the Railway service before the first deployment:

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Yes | Supabase project URL; used by the API and frontend build |
| `SUPABASE_ANON_KEY` | Yes | Public Supabase client key; included in the frontend build |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only Supabase access; never expose in frontend code |
| `GROQ_API_KEY` | Yes | Primary AI replies |
| `NVIDIA_API_KEY` | Yes for fallback | Alternate AI provider if Groq is unavailable |

Railway supplies `PORT`. The two model names can optionally be overridden with `GROQ_MODEL` and `NVIDIA_MODEL`.

The Replit Secrets do **not** copy automatically to Railway. Add each value in Railway's private service variables; do not put secret values in GitHub, `.env.example`, or chat.

Before using the deployed app:

1. Apply the SQL migration to the Supabase project.
2. In Supabase Auth settings, add the Railway domain as the site's URL and allowed redirect URL.
3. Wait for Railway's health check to pass, then test account creation/sign-in and the AI reply test in Sensei.

## GitHub repository hygiene

Use a **private** GitHub repository unless the project and its history have been reviewed for public release. `.env` files are ignored, and `.env.example` contains placeholders only. The imported `zipFile.zip` is currently tracked in Git; `.gitignore` alone cannot untrack an existing file. If you do not want to publish that archive, remove it from the next commit while retaining the local copy with:

```sh
git rm --cached zipFile.zip
git add .gitignore
git commit -m "Exclude imported source archive"
```

This removes the archive from the new commit, but not from earlier Git history. Do not push the repository if its history contains credentials; rotate any exposed credentials and clean the history first.
