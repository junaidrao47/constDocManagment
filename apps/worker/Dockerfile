# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# base — shared runtime setup
# tini forwards SIGTERM to node so in-flight jobs can drain on shutdown.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

# ---------------------------------------------------------------------------
# deps — full dependency install, shared by the build and development stages
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package*.json ./
RUN npm install

# ---------------------------------------------------------------------------
# development — hot reload via ts-node-dev
# compose.yml mounts ./apps/worker/src over /app/src.
# ---------------------------------------------------------------------------
FROM deps AS development
ENV NODE_ENV=development
COPY . .
CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------------------
# builder — compile TypeScript to dist/
# ---------------------------------------------------------------------------
FROM deps AS builder
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# production — runtime deps and compiled output only, running as non-root
# ---------------------------------------------------------------------------
FROM base AS production
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/templates ./dist/templates

RUN chown -R node:node /app
USER node

CMD ["node", "dist/worker.js"]
