FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/buyer-web/package.json ./apps/buyer-web/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/buyer-web/node_modules ./apps/buyer-web/node_modules
COPY . .
RUN cd packages/shared && pnpm build
RUN cd apps/buyer-web && pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000
COPY --from=build /app/apps/buyer-web/.next/standalone ./
COPY --from=build /app/apps/buyer-web/.next/static ./apps/buyer-web/.next/static
COPY --from=build /app/apps/buyer-web/public ./apps/buyer-web/public
EXPOSE 5000
CMD ["node", "apps/buyer-web/server.js"]
