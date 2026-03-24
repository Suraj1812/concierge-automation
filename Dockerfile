FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=base /app/dist ./dist
COPY .env.example ./.env.example
RUN mkdir -p storage/proposals logs
EXPOSE 4000
CMD ["node", "dist/src/server.js"]
