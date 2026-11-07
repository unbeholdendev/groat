ARG BUN_IMAGE=oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d
FROM ${BUN_IMAGE} AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

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
ENV DB_PATH=/data/expenses.db NODE_ENV=production
VOLUME /data
EXPOSE 3000
CMD ["bun", "server/index.ts"]
