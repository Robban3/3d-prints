FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci
COPY client client
COPY server/src server/src
COPY server/tsconfig*.json server/
RUN npm run build && npm prune --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=4000 CLIENT_DIST=/app/client/dist CATALOG_SEED=/app/seed/catalog.json
WORKDIR /app
COPY --chown=node:node --from=build /app/node_modules node_modules
COPY --chown=node:node --from=build /app/server/dist server/dist
COPY --chown=node:node --from=build /app/server/package.json server/package.json
COPY --chown=node:node --from=build /app/client/dist client/dist
COPY --chown=node:node server/seed seed
RUN mkdir -p /app/server/data /app/server/uploads && chown node:node /app/server/data /app/server/uploads
USER node
WORKDIR /app/server
EXPOSE 4000
CMD ["node", "dist/index.js"]
