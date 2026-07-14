# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY config ./config
RUN npm run build && npm prune --omit=dev

FROM docker:cli AS docker-cli

FROM node:24-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV MANAGED_BOTS_CONFIG=/app/data/managed-bots.json
ENV USER_PERMISSIONS_CONFIG=/app/data/user-permissions.json

COPY --from=docker-cli /usr/local/bin/docker /usr/bin/docker
COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY config ./config

USER node
CMD ["node", "dist/index.js"]
