# Teka RDC — Deployment Guide

## Prerequisites

- Docker 24+ and Docker Compose v2
- Domain: teka.cd (DNS A record pointing to server IP)
- Cloud PostgreSQL (e.g., Neon, Supabase, Railway, AlwaysData)
- SSL certificate (Let's Encrypt via certbot)
- At least 2GB RAM, 2 vCPU server (Ubuntu 22.04+ recommended)
- pnpm 9+ (for local development only; Docker images handle their own dependencies)

## Architecture Overview

Production runs 6 Docker containers behind NGINX:

| Container | Image | Internal Port | Role |
|-----------|-------|---------------|------|
| nginx | nginx:alpine | 80 / 443 | Reverse proxy, SSL, rate limiting, gzip, security headers |
| api | Custom (Node 20 Alpine) | 5050 | NestJS REST API |
| buyer-web | Custom (Node 20 Alpine) | 5000 | Next.js 15 consumer storefront |
| seller-web | Custom (Node 20 Alpine) | 5100 | Next.js 15 seller dashboard |
| admin-web | Custom (Node 20 Alpine) | 5200 | Next.js 15 admin panel |
| redis | redis:7-alpine | 6379 | Cache, OTP storage, rate limiting |

PostgreSQL is hosted externally (cloud-managed) and is **not** containerized.

## Quick Start

### 1. Clone and Configure

```bash
git clone https://github.com/your-org/teka-rdc.git
cd teka-rdc
cp .env.production.example .env.production
```

Edit `.env.production` with your actual values. See the [Environment Variables Reference](#environment-variables-reference) section below for all required variables.

### 2. Generate Secrets

```bash
# Generate JWT secrets (64-char hex strings)
openssl rand -hex 32   # Use for JWT_SECRET
openssl rand -hex 32   # Use for JWT_REFRESH_SECRET

# Generate Redis password
openssl rand -base64 24   # Use for REDIS_PASSWORD
```

### 3. SSL Setup (Let's Encrypt)

```bash
# Create certbot directories
mkdir -p certbot/conf certbot/www

# Get initial certificate (stop nginx first if running)
docker run -it --rm \
  -v ./certbot/conf:/etc/letsencrypt \
  -v ./certbot/www:/var/www/certbot \
  -p 80:80 \
  certbot/certbot certonly --standalone -d teka.cd -d www.teka.cd
```

The production NGINX config (`nginx/nginx.prod.conf`) expects certificates at:
- `/etc/letsencrypt/live/teka.cd/fullchain.pem`
- `/etc/letsencrypt/live/teka.cd/privkey.pem`

These paths are mapped via Docker volumes from `./certbot/conf`.

### 4. Build and Deploy

```bash
# Build all images
docker compose -f docker-compose.prod.yml build

# Run database migrations
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy

# Seed initial data (first deploy only — locations, categories, admin user)
docker compose -f docker-compose.prod.yml run --rm api npx prisma db seed

# Start all services
docker compose -f docker-compose.prod.yml up -d
```

### 5. Verify Deployment

```bash
# Check liveness (always returns 200 if process is running)
curl https://teka.cd/api/v1/health/live

# Check full health (database + Redis status)
curl https://teka.cd/api/v1/health

# Check readiness (returns 503 if dependencies are down)
curl https://teka.cd/api/v1/health/ready

# Check all containers are running
docker compose -f docker-compose.prod.yml ps
```

Expected health response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-28T12:00:00.000Z",
  "service": "teka-rdc-api",
  "checks": {
    "database": "ok",
    "redis": "ok"
  },
  "uptime": 123.456
}
```

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string with pooling params (e.g., `postgresql://user:pass@host:5432/teka_rdc?sslmode=require`) |
| `REDIS_PASSWORD` | Yes | Redis authentication password (used in redis-server --requirepass) |
| `REDIS_HOST` | No | Redis hostname (defaults to `redis` in Docker Compose) |
| `REDIS_PORT` | No | Redis port (defaults to `6379`) |
| `JWT_SECRET` | Yes | Access token signing secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | Yes | Refresh token signing secret (min 32 chars) |
| `JWT_EXPIRY` | No | Access token expiry (default: `15m`) |
| `JWT_REFRESH_EXPIRY` | No | Refresh token expiry (default: `7d`) |
| `OTP_EXPIRY_MINUTES` | No | OTP validity duration in minutes (default: `5`) |
| `CLOUDINARY_CLOUD_NAME` | Yes | Cloudinary cloud name for image hosting |
| `CLOUDINARY_API_KEY` | Yes | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Yes | Cloudinary API secret |
| `AT_API_KEY` | Yes | Africa's Talking API key for SMS/OTP |
| `AT_USERNAME` | Yes | Africa's Talking username |
| `AT_SENDER_ID` | No | SMS sender ID (default: `TekaRDC`) |
| `RESEND_API_KEY` | Yes | Resend.com API key for transactional emails |
| `EMAIL_FROM` | No | Sender email address (default: `noreply@teka.cd`) |
| `FLEXPAY_API_URL` | Yes | Flexpay Mobile Money API endpoint |
| `FLEXPAY_API_KEY` | Yes | Flexpay API key |
| `FLEXPAY_MERCHANT_ID` | Yes | Flexpay merchant identifier |
| `FLEXPAY_CALLBACK_URL` | Yes | Webhook callback URL (e.g., `https://teka.cd/api/v1/payments/webhook/flexpay`) |
| `CORS_ORIGINS` | Yes | Comma-separated allowed origins (e.g., `https://teka.cd,https://www.teka.cd`) |
| `PAYMENT_MOCK_MODE` | No | Set to `false` for production (default: `true` in development) |
| `NODE_ENV` | No | Set automatically to `production` in Docker |
| `API_PORT` | No | API server port (default: `5050`) |
| `API_URL` | No | Full API URL for inter-service communication |
| `DEFAULT_LOCALE` | No | Default language locale (default: `fr`) |
| `SUPPORTED_LOCALES` | No | Comma-separated locales (default: `fr,en`) |
| `DEFAULT_CURRENCY` | No | Default currency code (default: `CDF`) |

## Docker Compose Production Configuration

The `docker-compose.prod.yml` defines all services with:

- **Memory limits**: API (512MB), Redis (256MB), web apps (256MB each)
- **Health checks**: All services have Docker health checks configured
- **Restart policy**: `unless-stopped` for all services
- **Log rotation**: JSON file driver with 10MB max size, 3 files retained
- **Networks**: `frontend` (NGINX + all web apps + API) and `backend` (API + Redis)

Key differences from development (`docker-compose.yml`):
- No ports are exposed directly (only NGINX exposes 80 and 443)
- Redis requires authentication (`--requirepass`)
- SSL termination at NGINX
- Production NGINX config with security headers and HSTS

## NGINX Configuration

The production NGINX (`nginx/nginx.prod.conf`) provides:

### SSL/TLS
- TLSv1.2 and TLSv1.3 only
- Modern cipher suite
- SSL session caching (10m shared cache)
- HTTP to HTTPS redirect

### Security Headers
- `Strict-Transport-Security` (HSTS with 2-year max-age, preload)
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` (restricts sources for scripts, styles, images, fonts, connections)

### Rate Limiting
- **General API**: 30 requests/second per IP (burst 20)
- **Auth endpoints**: 5 requests/second per IP (burst 5)

### Routing
| Path | Upstream | Description |
|------|----------|-------------|
| `/api/v1/auth/*` | api:5050 | Auth endpoints (strict rate limit) |
| `/api/*` | api:5050 | All API endpoints |
| `/admin/*` | admin-web:5200 | Admin panel |
| `/seller/*` | seller-web:5100 | Seller dashboard |
| `/*` | buyer-web:5000 | Buyer storefront (catch-all) |

### Caching
- `/_next/static/*` files: 1-year cache, `immutable`
- Image files (jpg, png, webp, etc.): 1-day cache

### Compression
- gzip level 6
- Types: text/plain, text/css, application/json, application/javascript, text/xml, image/svg+xml

## Monitoring

### Health Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `GET /api/v1/health` | Full health check | 200 with database + Redis status |
| `GET /api/v1/health/ready` | Readiness probe | 200 if all deps OK, 503 if any down |
| `GET /api/v1/health/live` | Liveness probe | Always 200 (process alive) |

Health endpoints are exempt from rate limiting (via `@SkipThrottle()`).

### Viewing Logs

```bash
# Follow all service logs
docker compose -f docker-compose.prod.yml logs -f

# Follow specific service
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f nginx

# Recent logs (last 100 lines)
docker compose -f docker-compose.prod.yml logs --tail=100 api

# Filter by time
docker compose -f docker-compose.prod.yml logs --since="2026-02-28T00:00:00" api
```

### Container Status

```bash
# Status of all services
docker compose -f docker-compose.prod.yml ps

# Resource usage
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
```

## Backup Strategy

### Database

Cloud PostgreSQL providers (Neon, Supabase, Railway) offer automated daily backups. For additional manual backups:

```bash
# Manual backup (requires pg_dump installed locally or via Docker)
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d_%H%M%S).sql

# Compressed backup
pg_dump "$DATABASE_URL" | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Restore from backup
psql "$DATABASE_URL" < backup_20260228_120000.sql
```

### Redis

Redis data is persisted via `appendonly yes` mode. The Docker volume `redis_data` stores the append-only file.

```bash
# Backup Redis data volume
docker compose -f docker-compose.prod.yml stop redis
docker cp $(docker compose -f docker-compose.prod.yml ps -q redis):/data ./redis_backup_$(date +%Y%m%d)
docker compose -f docker-compose.prod.yml start redis
```

In practice, Redis data (OTPs, cache) is ephemeral and does not require regular backups. The cache rebuilds automatically.

### Media (Cloudinary)

Product images are stored on Cloudinary's CDN. Cloudinary provides its own backup and redundancy. No separate backup is needed for media assets.

## Updates and Rollback

### Standard Deploy Update

```bash
# Pull latest code
git pull origin main

# Rebuild all images
docker compose -f docker-compose.prod.yml build

# Run any new database migrations
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy

# Restart services with zero-downtime rolling update
docker compose -f docker-compose.prod.yml up -d
```

### Rollback

```bash
# Check recent commits to find a stable version
git log --oneline -10

# Revert to a specific commit
git checkout <previous-commit-hash>

# Rebuild and deploy the previous version
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

**Note**: Database migrations cannot be easily rolled back. If a migration caused issues, create a new migration to revert the schema changes.

### Updating a Single Service

```bash
# Rebuild and restart only the API
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d api

# Rebuild and restart only buyer-web
docker compose -f docker-compose.prod.yml build buyer-web
docker compose -f docker-compose.prod.yml up -d buyer-web
```

## SSL Certificate Renewal

### Manual Renewal

```bash
docker run --rm \
  -v ./certbot/conf:/etc/letsencrypt \
  -v ./certbot/www:/var/www/certbot \
  certbot/certbot renew

# Restart NGINX to pick up new certificates
docker compose -f docker-compose.prod.yml restart nginx
```

### Automatic Renewal (Crontab)

Add to the server's crontab (`crontab -e`):

```bash
# Renew SSL certificates on the 1st and 15th of each month at 3:00 AM
0 3 1,15 * * cd /path/to/teka-rdc && docker run --rm -v ./certbot/conf:/etc/letsencrypt -v ./certbot/www:/var/www/certbot certbot/certbot renew --quiet && docker compose -f docker-compose.prod.yml restart nginx >> /var/log/certbot-renew.log 2>&1
```

## Scaling Considerations

### Horizontal Scaling (API)

To run multiple API containers behind NGINX:

1. Update `docker-compose.prod.yml` to add replicas:
   ```yaml
   api:
     deploy:
       replicas: 3
   ```

2. NGINX upstream already handles load balancing by default (round-robin).

### Database Connection Pooling

- Use your cloud provider's built-in connection pooler (e.g., Neon's pooler, Supabase's PgBouncer)
- Set `DATABASE_URL` to the pooled connection string
- Recommended pool size: 20-50 connections depending on API replicas

### Redis

- For high availability, consider Redis Sentinel or Redis Cluster
- Upstash Redis is a good managed alternative for production
- Current memory limit: 256MB with `allkeys-lru` eviction policy

### CDN

- Cloudinary serves as the image CDN (product images, banners)
- Consider adding Cloudflare in front of NGINX for:
  - DDoS protection
  - Static asset caching at edge locations closer to DRC
  - Additional SSL layer
  - Analytics and security insights

### Mobile App Distribution

- Primary: Google Play Store (buyer-mobile and seller-mobile)
- Secondary: Direct APK download from teka.cd/download
- Future: iOS App Store

## Troubleshooting

### Container Won't Start

```bash
# Check logs for the failing container
docker compose -f docker-compose.prod.yml logs api

# Check if ports are in use
ss -tlnp | grep -E '80|443'

# Verify environment file is loaded
docker compose -f docker-compose.prod.yml config
```

### Database Connection Issues

```bash
# Test database connection from API container
docker compose -f docker-compose.prod.yml exec api sh -c 'npx prisma db execute --stdin <<< "SELECT 1"'

# Check if DATABASE_URL is correct
docker compose -f docker-compose.prod.yml exec api sh -c 'echo $DATABASE_URL'
```

### Redis Connection Issues

```bash
# Test Redis from inside the container
docker compose -f docker-compose.prod.yml exec redis redis-cli -a "$REDIS_PASSWORD" ping

# Check Redis memory usage
docker compose -f docker-compose.prod.yml exec redis redis-cli -a "$REDIS_PASSWORD" info memory
```

### SSL Certificate Issues

```bash
# Check certificate expiry
openssl s_client -connect teka.cd:443 -servername teka.cd 2>/dev/null | openssl x509 -noout -dates

# Check certificate files exist
ls -la certbot/conf/live/teka.cd/
```

### High Memory Usage

```bash
# Check per-container memory usage
docker stats --no-stream

# If API memory is high, check for memory leaks
docker compose -f docker-compose.prod.yml restart api
```

## Production Checklist

Before going live, verify:

- [ ] `.env.production` has all required variables set with real credentials
- [ ] `PAYMENT_MOCK_MODE` is set to `false`
- [ ] `NODE_ENV` is `production` (set automatically in Dockerfiles)
- [ ] SSL certificates are installed and HTTPS works
- [ ] Database migrations are applied (`prisma migrate deploy`)
- [ ] Seed data is loaded (locations, categories, initial admin user)
- [ ] Health endpoints return `ok` status
- [ ] CORS_ORIGINS matches production domains only
- [ ] DNS A records point to server IP for teka.cd and www.teka.cd
- [ ] Crontab entry for SSL renewal is configured
- [ ] Log rotation is configured (handled by Docker json-file driver)
- [ ] Backup strategy for database is in place
- [ ] Flexpay webhook callback URL is registered with Flexpay
- [ ] Africa's Talking sender ID is registered for DRC
- [ ] Cloudinary upload presets and limits are configured
