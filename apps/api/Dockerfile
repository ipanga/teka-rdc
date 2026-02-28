FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN cd packages/shared && pnpm build
RUN cd apps/api && npx prisma generate && pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/node_modules ./root_modules
COPY --from=build /app/apps/api/prisma ./prisma
ENV NODE_ENV=production
ENV API_PORT=5050
EXPOSE 5050
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD wget --spider -q http://localhost:5050/api/v1/health/live || exit 1
USER node
CMD ["node", "dist/main.js"]
