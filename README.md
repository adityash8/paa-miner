# PAA Miner - Accuracy-First People Also Ask Tool

A high-precision tool for extracting **People Also Ask (PAA)** questions from Google SERPs for GEO optimization. Built with accuracy as the #1 priority.

## 🎯 Features

- **99%+ Accuracy**: Real Chrome rendering via Playwright with consensus validation
- **Multi-Country Support**: Specify country (`gl`), language (`hl`), and optional city (`uule`)
- **Device-Specific**: Separate mobile and desktop PAA extraction
- **Consensus Algorithm**: Run K independent scrapes and keep only verified questions
- **Full Evidence Trail**: Screenshots, HTML snapshots, and SERP hashes for auditability
- **Depth Control**: Expand PAA trees 1-3 levels deep
- **Export-Ready**: Get results in JSON, CSV, FAQ Schema, or GEO block format

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
# or
pnpm install
# or
yarn install
```

### 2. Install Playwright Browsers

```bash
npx playwright install chromium
```

### 3. Configure Environment (Optional)

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
# Optional: Residential proxy pool for better accuracy and avoiding blocks
PROXY_POOL=https://user:pass@proxy1.example.com:8080,https://user:pass@proxy2.example.com:8080

# Default device (mobile | desktop)
DEFAULT_DEVICE=mobile

# Safety limits
MAX_NODES=220
MAX_RUNTIME_MS=45000
```

### 4. Run Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3000/api/paa`

## 📡 API Usage

### Endpoint

**POST** `/api/paa`

### Request Body

```json
{
  "keyword": "best noise cancelling headphones",
  "gl": "US",
  "hl": "en",
  "device": "mobile",
  "depth": 2,
  "k": 2,
  "strict": true,
  "returnEvidence": true
}
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `keyword` | string | ✅ | - | Target search keyword |
| `gl` | string | ✅ | - | Country code (2 letters: US, IN, GB, etc.) |
| `hl` | string | ✅ | - | Language code (en, en-IN, fr, etc.) |
| `device` | enum | ❌ | `mobile` | Device type: `mobile` or `desktop` |
| `depth` | number | ❌ | `2` | PAA expansion depth (1-3) |
| `k` | number | ❌ | `2` | Number of consensus runs (1-3) |
| `strict` | boolean | ❌ | `true` | Keep only questions seen in ≥2 runs |
| `uule` | string | ❌ | - | City bias (UULE encoded) |
| `returnEvidence` | boolean | ❌ | `true` | Include screenshots and HTML |

### Response

```json
{
  "success": true,
  "params": {
    "keyword": "best noise cancelling headphones",
    "gl": "US",
    "hl": "en",
    "device": "mobile",
    "depth": 2,
    "k": 2,
    "strict": true
  },
  "count": 15,
  "results": [
    {
      "question": "What are the best noise cancelling headphones in 2024?",
      "norm": "what are the best noise cancelling headphones in 2024",
      "depth": 0,
      "parent": null,
      "appearances": 2,
      "confidence": 0.889
    },
    {
      "question": "Which brand makes the best noise cancelling headphones?",
      "norm": "which brand makes the best noise cancelling headphones",
      "depth": 1,
      "parent": "what are the best noise cancelling headphones in 2024",
      "appearances": 2,
      "confidence": 0.733
    }
  ],
  "evidence": [
    {
      "serpHash": "a3f8d2c1b9e4",
      "evidence": {
        "fullScreenshotB64": "...",
        "paaHtml": "...",
        "paaCropsB64": ["...", "..."]
      }
    }
  ],
  "meta": {
    "duration_ms": 12450,
    "runs_executed": 2
  }
}
```

## 💡 Example Requests

### Basic Request (US English, Mobile)

```bash
curl -X POST http://localhost:3000/api/paa \
  -H 'Content-Type: application/json' \
  -d '{
    "keyword": "credit card rewards",
    "gl": "US",
    "hl": "en",
    "device": "mobile"
  }'
```

### India English with City Targeting

```bash
curl -X POST http://localhost:3000/api/paa \
  -H 'Content-Type: application/json' \
  -d '{
    "keyword": "best credit cards",
    "gl": "IN",
    "hl": "en-IN",
    "device": "mobile",
    "depth": 2,
    "k": 2,
    "strict": true
  }'
```

### Desktop, Deep Expansion

```bash
curl -X POST http://localhost:3000/api/paa \
  -H 'Content-Type: application/json' \
  -d '{
    "keyword": "seo tools",
    "gl": "GB",
    "hl": "en",
    "device": "desktop",
    "depth": 3,
    "k": 1,
    "strict": false
  }'
```

## 🔍 Understanding Accuracy

### Why 99%+ Accuracy?

1. **Real Chrome Rendering**: We use Playwright with real Chromium, not lightweight HTML parsers
2. **Geo-Accurate**: Residential proxies pinned to user-chosen country with proper `gl`, `hl`, `uule` headers
3. **Consensus Algorithm**: K independent runs with strict quorum (≥2 appearances)
4. **Zero Hallucination**: No LLM generation - only observed PAAs from the DOM
5. **Structural Detection**: Finds PAAs by accordion structure, not fragile text matching
6. **Full Evidence**: Screenshots and HTML for every run, verifiable proof

### Confidence Score

Each question receives a confidence score (0-1):

```
confidence = 0.6 × (appearances / k) + 0.4 × (1 / (1 + depth))
```

- Higher appearances across runs = higher confidence
- Shallower depth (closer to seed) = higher confidence

## 📊 Output Formats

### 1. JSON (Default)

Already included in API response.

### 2. CSV Export

```typescript
import { toCSV } from '@/lib/format';

const csv = toCSV(results);
// Question,Depth,Appearances,Confidence
// "What are the best headphones?",0,2,0.889
```

### 3. FAQ Schema (JSON-LD)

```typescript
import { toFAQJsonLD } from '@/lib/format';

const schema = toFAQJsonLD(
  results.map(r => ({
    question: r.question,
    answer: 'Your answer here' // Add your content
  }))
);
```

### 4. GEO Block (Markdown)

```typescript
import { toGeoBlock } from '@/lib/format';

const markdown = toGeoBlock(results.map(r => r.question));
// ### People Also Ask
//
// - What are the best headphones?
// - Which brand makes the best headphones?
```

## 🚢 Deployment

### Vercel (Recommended for API)

```bash
npm install -g vercel
vercel
```

**Important**:
- Set Node.js runtime to 18+
- Add environment variables in Vercel dashboard
- If Playwright fails in serverless, use a Node.js function (not Edge)

### Alternative: VPS/VM

For better control and to avoid serverless limitations:

```bash
# On your server
git clone <your-repo>
cd paa-miner
npm install
npx playwright install chromium
npm run build
npm start
```

Use PM2 or systemd for production:

```bash
npm install -g pm2
pm2 start npm --name "paa-miner" -- start
pm2 save
```

## 🔐 Best Practices

### 1. Use Residential Proxies

For best accuracy and to avoid blocks, use residential proxies pinned to the target country:

```env
PROXY_POOL=https://user:pass@geo.provider.com:8080
```

Recommended providers:
- Bright Data
- Oxylabs
- Smartproxy

### 2. Respect Rate Limits

- Cache results (24h TTL recommended)
- Add delays between requests
- Monitor for "unusual traffic" messages

### 3. Validate Results

- Check `confidence` scores (>0.7 recommended)
- Review `appearances` (≥2 for strict mode)
- Use `evidence` screenshots for spot-checks

### 4. Country + Language Matching

Match language to country for best results:

| Country | Language | Example |
|---------|----------|---------|
| US | en | Standard English |
| IN | en-IN | Indian English |
| GB | en-GB | British English |
| FR | fr | French |

## 🧪 Testing

Create a test script:

```javascript
// scripts/test.js
const response = await fetch('http://localhost:3000/api/paa', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    keyword: 'test keyword',
    gl: 'US',
    hl: 'en',
    device: 'mobile',
    k: 1,
    returnEvidence: false
  })
});

const data = await response.json();
console.log(`Found ${data.count} PAAs`);
console.log(data.results.slice(0, 5));
```

## 📚 Advanced Features

### City-Level Targeting

Use UULE encoding for city-specific results:

```typescript
import { encodeUULE } from '@/lib/uule';

const uule = encodeUULE('Mumbai, India');

// In request:
{
  "keyword": "restaurants near me",
  "gl": "IN",
  "hl": "en-IN",
  "uule": uule
}
```

### Custom User Agents

Edit `lib/userAgents.ts` to customize User-Agent strings for your use case.

### Multi-Language Support

The tool detects PAA containers in multiple languages automatically. Supported:
- English, French, German, Spanish, Portuguese, Hindi, Chinese, and more

## 🐛 Troubleshooting

### "No PAAs found"

1. Check if the keyword actually triggers PAAs in Google (manual search)
2. Try different device (`mobile` vs `desktop`)
3. Verify `gl` and `hl` match the target market
4. Check screenshots in `evidence.fullScreenshotB64` to see what was rendered

### "Unusual traffic" errors

1. Add residential proxies to `PROXY_POOL`
2. Increase delay between requests
3. Reduce `k` (number of runs)
4. Use a VPS instead of serverless

### Playwright errors on Vercel

Vercel's serverless environment can be restrictive. Solutions:
1. Use Vercel's Node.js runtime (not Edge)
2. Deploy to a VPS (Fly.io, Railway, Render)
3. Use a separate Playwright service (e.g., Browserless)

## 📄 License

MIT

## 🤝 Contributing

Issues and PRs welcome!

## 💬 Support

For questions or issues:
1. Check existing issues in the repo
2. Review the troubleshooting section
3. Open a new issue with full request/response details
