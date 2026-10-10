FROM oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.4
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY server server
COPY shared shared
COPY --from=build /app/dist dist
ENV DB_PATH=/data/expenses.db NODE_ENV=production
VOLUME /data
EXPOSE 3000
CMD ["bun", "server/index.ts"]
