# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies (no lockfile required)
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
npm install --ignore-scripts

# Copy source and build
COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Only production deps in the final image
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
npm install --omit=dev --ignore-scripts && npm cache clean --force

# Copy built output + anything needed at runtime
COPY --from=builder /app ./

EXPOSE 3000
CMD ["npm", "start"]
