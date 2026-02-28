FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/seller-web/package.json ./apps/seller-web/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/seller-web/node_modules ./apps/seller-web/node_modules
COPY . .
RUN cd packages/shared && pnpm build
RUN cd apps/seller-web && pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5100
COPY --from=build /app/apps/seller-web/.next/standalone ./
COPY --from=build /app/apps/seller-web/.next/static ./apps/seller-web/.next/static
COPY --from=build /app/apps/seller-web/public ./apps/seller-web/public
EXPOSE 5100
CMD ["node", "apps/seller-web/server.js"]
