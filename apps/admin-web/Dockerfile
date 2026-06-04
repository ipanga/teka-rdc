FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/admin-web/package.json ./apps/admin-web/
RUN pnpm install --frozen-lockfile

FROM base AS build
ARG NEXT_PUBLIC_API_URL="http://localhost:5050/api"
ARG NEXT_PUBLIC_BASE_PATH="/admin"
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
# Sentry — see apps/buyer-web/Dockerfile for the full rationale.
ARG NEXT_PUBLIC_SENTRY_DSN_ADMIN_WEB=""
ENV NEXT_PUBLIC_SENTRY_DSN_ADMIN_WEB=$NEXT_PUBLIC_SENTRY_DSN_ADMIN_WEB
# PostHog project key — baked into the browser bundle (NEXT_PUBLIC_* is
# compile-time only). Public phc_ key; sourced from a GitHub Secret by
# deploy.yml. Empty → posthog never initializes (no-op).
ARG NEXT_PUBLIC_POSTHOG_KEY_ADMIN_WEB=""
ENV NEXT_PUBLIC_POSTHOG_KEY_ADMIN_WEB=$NEXT_PUBLIC_POSTHOG_KEY_ADMIN_WEB
ARG SENTRY_RELEASE=""
ENV SENTRY_RELEASE=$SENTRY_RELEASE
ENV NEXT_PUBLIC_SENTRY_RELEASE=$SENTRY_RELEASE
# SENTRY_AUTH_TOKEN — see apps/buyer-web/Dockerfile for the rationale.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/admin-web/node_modules ./apps/admin-web/node_modules
COPY . .
RUN cd packages/shared && pnpm build
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    cd apps/admin-web && pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5200
ENV HOSTNAME=0.0.0.0
RUN apk add --no-cache curl
COPY --from=build /app/apps/admin-web/.next/standalone ./
COPY --from=build /app/apps/admin-web/.next/static ./apps/admin-web/.next/static
COPY --from=build /app/apps/admin-web/public ./apps/admin-web/public
EXPOSE 5200
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:5200/ | grep -qE '^(2|3)[0-9][0-9]$' || exit 1
CMD ["node", "apps/admin-web/server.js"]
