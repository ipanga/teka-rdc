FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/buyer-web/package.json ./apps/buyer-web/
RUN pnpm install --frozen-lockfile

FROM base AS build
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
ARG NEXT_PUBLIC_API_URL="http://localhost:5050/api"
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
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
# Next.js standalone defaults to binding localhost, which inside a container
# is unreachable from the docker bridge (nginx → buyer-web:5000 gets ECONNREFUSED
# → 502). Force the server to listen on all interfaces.
ENV HOSTNAME=0.0.0.0
# curl keeps the image small while giving docker + compose a healthcheck target.
RUN apk add --no-cache curl
COPY --from=build /app/apps/buyer-web/.next/standalone ./
COPY --from=build /app/apps/buyer-web/.next/static ./apps/buyer-web/.next/static
COPY --from=build /app/apps/buyer-web/public ./apps/buyer-web/public
EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:5000/ > /dev/null || exit 1
CMD ["node", "apps/buyer-web/server.js"]
