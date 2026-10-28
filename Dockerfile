FROM node:20-slim
WORKDIR /app

RUN npm install -g pnpm@10.26.1

COPY . .
RUN pnpm install --frozen-lockfile

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN PORT=5173 BASE_PATH=/ pnpm --filter @workspace/sensei run build \
 && pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
