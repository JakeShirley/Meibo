# syntax=docker/dockerfile:1.7

# ---------- Stage 1: install deps & build the client ----------
FROM node:20-alpine AS build
WORKDIR /app

# Install all deps (including dev) for the build
COPY package.json package-lock.json* ./
RUN npm ci

# Copy sources and build the Vite client (also type-checks via tsc)
COPY . .
RUN npm run build

# ---------- Stage 2: runtime image ----------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    SERVER_PORT=3001

# Install only production deps + tsx (used to run the TS server directly)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm install --no-save tsx@^4.21.0

# Copy server sources, built client, and shared configs
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/tsconfig.server.json ./tsconfig.server.json

# Drop privileges
USER node

EXPOSE 3001
CMD ["npx", "tsx", "server/index.ts"]
