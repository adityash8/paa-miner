# PAA Miner - Deployment Guide

## Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers
npx playwright install chromium

# 3. Copy environment file
cp .env.local.example .env.local

# 4. Start development server
npm run dev
```

Visit `http://localhost:3000`

## Deployment Options

### Option 1: Vercel (Recommended for UI)

**Note**: Playwright may have issues in Vercel's serverless environment. Best for UI-only deployment with external API.

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables in Vercel dashboard:
# - PROXY_POOL (optional, recommended)
# - MAX_NODES=220
# - MAX_RUNTIME_MS=45000
# - DEFAULT_DEVICE=mobile
```

**Vercel Limitations**:
- Playwright may not work reliably in serverless
- Consider using Option 2 or 3 for the API

### Option 2: VPS/VM (Recommended for Production)

Best for full control and reliable Playwright execution.

**Fly.io Example**:

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Initialize
fly launch

# Deploy
fly deploy
```

**Railway Example**:

```bash
# Install Railway CLI
npm i -g railway

# Initialize
railway init

# Deploy
railway up
```

**Render Example**:

Create `render.yaml`:

```yaml
services:
  - type: web
    name: paa-miner
    env: node
    region: oregon
    plan: starter
    buildCommand: npm install && npx playwright install chromium && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_VERSION
        value: 18
      - key: PROXY_POOL
        sync: false
      - key: MAX_NODES
        value: 220
      - key: MAX_RUNTIME_MS
        value: 45000
```

### Option 3: Docker

```dockerfile
# Dockerfile
FROM node:18-slim

# Install Playwright dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx playwright install chromium
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t paa-miner .
docker run -p 3000:3000 -e PROXY_POOL="your-proxy" paa-miner
```

## Environment Variables

Create `.env.local` (or add to your hosting platform):

```env
# Optional: Residential proxy pool (HIGHLY RECOMMENDED)
# Format: https://user:pass@host:port,https://user:pass@host2:port
PROXY_POOL=

# Default device type
DEFAULT_DEVICE=mobile

# Safety limits
MAX_NODES=220
MAX_RUNTIME_MS=45000
```

## Proxy Setup (Recommended)

For best accuracy and to avoid Google blocks, use residential proxies:

### Recommended Providers

1. **Bright Data** (formerly Luminati)
   - Geo-targeting by country
   - Residential IPs
   - https://brightdata.com

2. **Oxylabs**
   - Good for SERP scraping
   - https://oxylabs.io

3. **Smartproxy**
   - Affordable option
   - https://smartproxy.com

### Proxy Format

```env
PROXY_POOL=https://username:password@gate.provider.com:7000
```

For multiple proxies:

```env
PROXY_POOL=https://user:pass@proxy1.com:8080,https://user:pass@proxy2.com:8080
```

## Performance Tuning

### For High Volume

1. **Reduce `k` (consensus runs)**:
   ```
   k: 1  # Faster but slightly less accurate
   ```

2. **Lower depth**:
   ```
   depth: 1  # Only top-level PAAs
   ```

3. **Disable evidence**:
   ```
   returnEvidence: false  # Skip screenshots
   ```

4. **Cache results**:
   - Implement Redis or similar
   - Cache by (keyword, gl, hl, device)
   - TTL: 24 hours

### For Maximum Accuracy

1. **Use strict mode**:
   ```
   strict: true
   k: 2 or 3
   ```

2. **Enable residential proxies**

3. **Match geo/language precisely**:
   ```
   US → en
   IN → en-IN
   GB → en-GB
   ```

## Monitoring

### Health Check

```bash
curl http://your-domain.com/api/paa
```

Response:
```json
{
  "service": "PAA Miner",
  "status": "healthy",
  "version": "1.0.0"
}
```

### Test Request

```bash
curl -X POST http://your-domain.com/api/paa \
  -H 'Content-Type: application/json' \
  -d '{
    "keyword": "test",
    "gl": "US",
    "hl": "en",
    "device": "mobile",
    "k": 1,
    "returnEvidence": false
  }'
```

## Troubleshooting

### Playwright not working

**Error**: `browserType.launch: Executable doesn't exist`

**Solution**:
```bash
npx playwright install chromium
```

### "Unusual traffic" from Google

**Solutions**:
1. Add residential proxies
2. Reduce request frequency
3. Use different countries/devices
4. Check if proxy is working

### Slow requests

**Causes**:
- High `depth` (3)
- High `k` (consensus runs)
- No proxy (slower IPs)
- Keyword with many PAAs

**Solutions**:
- Reduce depth to 1-2
- Use k=1 for speed
- Add proxy pool
- Cache results

### Memory issues

**Error**: JavaScript heap out of memory

**Solution**:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm start
```

Or adjust in your hosting platform settings.

## Cost Estimation

### Vercel (with external Playwright service)

- Free tier: Limited
- Pro: $20/month + overage
- **Not recommended for Playwright**

### VPS Options

1. **Fly.io**: $1.94/month (shared CPU)
2. **Railway**: $5/month (Starter)
3. **Render**: $7/month (Starter)
4. **DigitalOcean**: $4/month (Basic Droplet)

### Proxy Costs

- **Bright Data**: ~$500/month (mid-tier)
- **Oxylabs**: ~$300/month
- **Smartproxy**: ~$75/month (40GB)

### Recommended Setup

**Starter** (Testing):
- VPS: Fly.io ($2/mo)
- No proxy (use sparingly)
- **Total: ~$2/month**

**Production** (Reliable):
- VPS: Render Starter ($7/mo)
- Proxy: Smartproxy ($75/mo)
- **Total: ~$82/month**

## Security

1. **Rate limiting**: Implement on API routes
2. **API keys**: Add auth for production
3. **CORS**: Configure for your domains only
4. **Env vars**: Never commit `.env.local`

## Backup & Recovery

### Export Results

All results are JSON. Save to:
- Database (Supabase, Postgres)
- File storage (S3, R2)
- Backup service

### Cache Strategy

```typescript
// Pseudo-code
const cacheKey = `paa:${keyword}:${gl}:${hl}:${device}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const fresh = await runConsensus(params);
await redis.set(cacheKey, JSON.stringify(fresh), 'EX', 86400); // 24h
return fresh;
```

## Support & Maintenance

- Check logs regularly
- Monitor success rate
- Update Playwright monthly
- Rotate proxies if blocked
- Keep Node.js updated

---

For issues, see `README.md` troubleshooting section.
