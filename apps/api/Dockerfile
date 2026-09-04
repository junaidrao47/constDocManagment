# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# base — shared runtime setup
# tini is installed so PID 1 forwards SIGTERM and reaps children; without it,
# `docker compose down` would kill the process before graceful shutdown runs.
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
# compose.yml mounts ./apps/api/src over /app/src, so edits on the host restart
# the process in place. Runs from source; nothing is compiled in this stage.
# ---------------------------------------------------------------------------
FROM deps AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
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

# Created before dropping privileges so a fresh named volume mounted here
# inherits node:node ownership rather than root's.
RUN mkdir -p /app/storage && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "dist/server.js"]
