FROM node:20-slim
WORKDIR /app

RUN npm install -g pnpm@10.26.1

COPY . .
RUN pnpm install --frozen-lockfile

ENV SUPABASE_URL=https://qoflyadqhwwlbsmlzvfb.supabase.co
ENV SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvZmx5YWRxaHd3bGJzbWx6dmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MDU4MjksImV4cCI6MjA4OTQ4MTgyOX0.YOarNcMghtubJOFjrY9Cy9ZRI53t-DzzM741ujAXEHg

RUN PORT=5173 BASE_PATH=/ pnpm --filter @workspace/sensei run build \
 && pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
