FROM node:20-slim
WORKDIR /app

# pnpm version matches "packageManager" in package.json
RUN npm install -g pnpm@10.26.1

COPY . .
RUN pnpm install --frozen-lockfile

# Build the frontend, then the API server (which serves the frontend)
RUN PORT=5173 BASE_PATH=/ pnpm --filter @workspace/sensei run build \
 && pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
