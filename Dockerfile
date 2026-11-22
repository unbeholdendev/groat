ARG BUN_IMAGE=oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d
FROM ${BUN_IMAGE} AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM ${BUN_IMAGE} AS site-build
WORKDIR /app/site
COPY site/package.json site/bun.lock ./
RUN bun install --frozen-lockfile
COPY shared /app/shared
COPY site ./
ARG UMAMI_WEBSITE_ID
RUN bun --bun run build

# The landing page, built only with --target site.
FROM caddy:2.11.8-alpine@sha256:f6228111e5fafa1a5238258d0858e103f10599b8d1659a146e7726681a002bb9 AS site
COPY site/Caddyfile /etc/caddy/Caddyfile
COPY --from=site-build /app/site/dist /srv
EXPOSE 8080

FROM ${BUN_IMAGE}
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title=Groat \
      org.opencontainers.image.licenses=Apache-2.0 \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$REVISION
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY LICENSE ./
COPY server server
COPY shared shared
COPY --from=build /app/dist dist
ENV DB_PATH=/data/expenses.db NODE_ENV=production GROAT_VERSION=$VERSION
VOLUME /data
EXPOSE 3000
CMD ["bun", "server/index.ts"]
