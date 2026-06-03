FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/seller-web/package.json ./apps/seller-web/
RUN pnpm install --frozen-lockfile

FROM base AS build
ARG NEXT_PUBLIC_API_URL="http://localhost:5050/api"
ARG NEXT_PUBLIC_BASE_PATH="/seller"
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
# Sentry — see apps/buyer-web/Dockerfile for the full rationale.
ARG NEXT_PUBLIC_SENTRY_DSN_SELLER_WEB=""
ENV NEXT_PUBLIC_SENTRY_DSN_SELLER_WEB=$NEXT_PUBLIC_SENTRY_DSN_SELLER_WEB
# Microsoft Clarity project id — baked into the browser bundle (NEXT_PUBLIC_*
# is compile-time only). Public by design; sourced from a GitHub Secret by
# deploy.yml. Empty → Clarity never loads (also gated on NODE_ENV=production).
ARG NEXT_PUBLIC_CLARITY_PROJECT_ID_SELLER_WEB=""
ENV NEXT_PUBLIC_CLARITY_PROJECT_ID_SELLER_WEB=$NEXT_PUBLIC_CLARITY_PROJECT_ID_SELLER_WEB
ARG SENTRY_RELEASE=""
ENV SENTRY_RELEASE=$SENTRY_RELEASE
ENV NEXT_PUBLIC_SENTRY_RELEASE=$SENTRY_RELEASE
# SENTRY_AUTH_TOKEN — see apps/buyer-web/Dockerfile for the rationale.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/seller-web/node_modules ./apps/seller-web/node_modules
COPY . .
RUN cd packages/shared && pnpm build
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    cd apps/seller-web && pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5100
ENV HOSTNAME=0.0.0.0
RUN apk add --no-cache curl
COPY --from=build /app/apps/seller-web/.next/standalone ./
COPY --from=build /app/apps/seller-web/.next/static ./apps/seller-web/.next/static
COPY --from=build /app/apps/seller-web/public ./apps/seller-web/public
EXPOSE 5100
# Root path may redirect to a login/dashboard; treat any 2xx/3xx as alive.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:5100/ | grep -qE '^(2|3)[0-9][0-9]$' || exit 1
CMD ["node", "apps/seller-web/server.js"]
