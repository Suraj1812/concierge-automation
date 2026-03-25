FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV APP_PROCESS=server
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=base /app/dist ./dist
COPY .env.example ./.env.example
RUN mkdir -p storage/proposals logs
EXPOSE 4000
CMD ["sh", "-c", "case \"$APP_PROCESS\" in worker) exec node dist/src/worker.js ;; api|server|\"\") exec node dist/src/server.js ;; *) echo \"Unsupported APP_PROCESS: $APP_PROCESS\" >&2; exit 1 ;; esac"]
