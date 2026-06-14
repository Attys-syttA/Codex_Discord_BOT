FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY app/package.json app/package-lock.json ./
RUN npm ci

COPY app/tsconfig.json ./
COPY app/src ./src
RUN npm run build

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

RUN chmod -R a+rX /app

USER node

CMD ["node", "dist/index.js"]
