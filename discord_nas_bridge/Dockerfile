FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY app/package.json app/package-lock.json ./
RUN npm ci

COPY app/tsconfig.json ./
COPY app/src ./src
RUN npm run build

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV NODE_OPTIONS="--dns-result-order=ipv4first"
WORKDIR /app

COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

RUN chmod -R a+rX /app

CMD ["node", "dist/src/index.js"]
