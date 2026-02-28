FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/admin-web/package.json ./apps/admin-web/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/admin-web/node_modules ./apps/admin-web/node_modules
COPY . .
RUN cd packages/shared && pnpm build
RUN cd apps/admin-web && pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5200
COPY --from=build /app/apps/admin-web/.next/standalone ./
COPY --from=build /app/apps/admin-web/.next/static ./apps/admin-web/.next/static
COPY --from=build /app/apps/admin-web/public ./apps/admin-web/public
EXPOSE 5200
CMD ["node", "apps/admin-web/server.js"]
