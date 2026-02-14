# IP Intelligence Correlator

Ever wondered what's behind an IP address? This platform gives you the full picture by querying 19+ threat intelligence providers simultaneously and intelligently combining their insights. Think of it as a background check for IP addresses - complete with geolocation, threat scoring, VPN detection, and even AI-powered analysis.

Built for both developers and security teams, it handles everything from single lookups to bulk processing while keeping your API costs low through smart caching.

## Features

- **Multi-Provider Aggregation**: Queries 19+ IP lookup and threat intelligence providers in parallel (AbuseIPDB, VirusTotal, Shodan, GreyNoise, AlienVault OTX, ProxyCheck.io, and more)
- **VPN/Proxy Detection**: Advanced VPN provider identification with support for ProtonVPN, NordVPN, ExpressVPN, and 10+ other major providers
- **AI-Powered Threat Analysis**: Local LLM integration via Ollama for intelligent threat assessment and risk scoring with MITRE ATT&CK mapping
- **Intelligent Caching**: 30-day Redis cache with automatic TTL refresh
- **Data Correlation**: Smart conflict resolution using trust-weighted voting across providers
- **Circuit Breakers**: Per-provider resilience with automatic recovery
- **Graceful Degradation**: Serves stale data and queues background refreshes under high load
- **Bulk Processing**: Process multiple IPs simultaneously with CSV export functionality
- **Dark Mode UI**: Clean, responsive interface built with Tailwind CSS
- **Production-Ready**: Docker Compose orchestration, structured logging, health checks
- **API Documentation**: Interactive OpenAPI docs with Scalar UI

## Architecture

```
+-------------+
|   Browser   |
+------+------+
       | HTTPS
+------v------------------------------------------+
|            Fastify Server (Node.js)              |
|  +--------------------------------------------+  |
|  |         IP Lookup Service                  |  |
|  |  +----------+  +------------+              |  |
|  |  |  Cache   |  |  Database  |              |  |
|  |  |  (Redis) |  |(PostgreSQL)|              |  |
|  |  +----+-----+  +-----+------+              |  |
|  |       +------+-------+                     |  |
|  |              |                             |  |
|  |     +--------v----------+                  |  |
|  |     | Provider Manager  |                  |  |
|  |     |  (p-limit queue)  |                  |  |
|  |     +--------+----------+                  |  |
|  |              |                             |  |
|  |     +--------+--------+--------+           |  |
|  |     |        |        |        |           |  |
|  |  +--v--+ +---v---+ +--v---+ +--v------+    |  |
|  |  |Abuse| |Virus  | |Shodan| |GreyNoise|   |  |
|  |  |IPDB | |Total  | |      | |         |   |  |
|  |  +-----+ +-------+ +------+ +---------+   |  |
|  |   (Circuit Breakers + Retry Logic)        |  |
|  +--------------------------------------------+  |
|                      |                           |
|  +-------------------v------------------------+  |
|  |              Ollama LLM                    |  |
|  |        (Local Threat Analysis)            |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
```

## Quick Start

### Prerequisites

- Docker 24+ and Docker Compose v2
- Node.js 20+ (for local development)
- npm 10+ (included with Node.js 20+)

### Option 1: Docker Compose (Recommended)

1. Clone and configure:
```bash
git clone <repository-url>
cd IPChecker
cp .env.example .env
# Edit .env and add API keys (optional but recommended)
```

2. Start services:
```bash
docker compose up -d
```

3. Run database migrations:
```bash
docker compose exec web sh -c "cd backend && npx prisma migrate deploy"
```

4. Access the application:
- Web UI: http://localhost:3000
- API Docs: http://localhost:3000/api/docs
- Health Check: http://localhost:3000/api/health

### Option 2: Local Development

1. Install dependencies:
```bash
npm install
```

2. Start infrastructure (Redis + PostgreSQL):
```bash
docker compose up redis db -d
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Run database migrations:
```bash
cd backend
npx prisma migrate dev
cd ..
```

5. Start development servers:
```bash
npm run dev
```

This starts:
- Backend (Fastify): http://localhost:3000
- Frontend (Vite): http://localhost:5173

## API Reference

### Lookup IP Address

```http
POST /api/v1/lookup
Content-Type: application/json

{
  "ip": "8.8.8.8",
  "forceRefresh": false,
  "includeLLMAnalysis": true
}
```

Response (200 OK):
```json
{
  "ip": "8.8.8.8",
  "asn": "AS15169",
  "org": "Google LLC",
  "location": {
    "country": "US",
    "region": "California",
    "city": "Mountain View",
    "coordinates": { "lat": 37.386, "lon": -122.084 },
    "timezone": "America/Los_Angeles",
    "accuracy": "city"
  },
  "flags": {
    "isProxy": false,
    "isVpn": false,
    "isTor": false,
    "isHosting": true,
    "isMobile": false,
    "vpnProvider": null,
    "confidence": 100
  },
  "threat": {
    "abuseScore": 0,
    "riskLevel": "low"
  },
  "llmAnalysis": {
    "summary": "SAFE: Google LLC in Mountain View, California, US. Safe to allow.",
    "riskAssessment": "LIKELY BENIGN: GreyNoise RIOT (known benign service)",
    "recommendations": ["No action required - legitimate infrastructure"],
    "threatIndicators": ["Hosting/Datacenter"],
    "confidence": 90
  },
  "metadata": {
    "providers": [...],
    "source": "cache",
    "ttlSeconds": 2592000,
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

Error (400 Bad Request):
```json
{
  "error": "Invalid IP address format",
  "code": "INVALID_FORMAT",
  "suggestion": "Try a valid IPv4 (e.g., 8.8.8.8) or IPv6 address",
  "timestamp": "2024-01-15T10:30:00Z",
  "requestId": "req_abc123"
}
```

### Bulk Lookup

```http
POST /api/v1/lookup/bulk
Content-Type: application/json

{
  "ips": ["8.8.8.8", "1.1.1.1"],
  "forceRefresh": false,
  "includeLLMAnalysis": false
}
```

Response (200 OK):
```json
{
  "results": [
    { "ip": "8.8.8.8", "success": true, "data": {...} },
    { "ip": "1.1.1.1", "success": true, "data": {...} }
  ],
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0,
    "processingTimeMs": 1234
  }
}
```

### System Health

```http
GET /api/health
```

Response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400,
  "services": {
    "redis": { "status": "up", "latencyMs": 2 },
    "postgres": { "status": "up", "latencyMs": 5 },
    "providers": { "available": 15, "healthy": 14 },
    "llm": { "available": true, "model": "qwen3:0.6b" }
  }
}
```

### Provider Health

```http
GET /api/v1/providers
```

Response:
```json
{
  "providers": [
    {
      "name": "abuseipdb.com",
      "enabled": true,
      "healthy": true,
      "trustRank": 9,
      "stats": {
        "successRate": 0.98,
        "avgLatencyMs": 234
      }
    }
  ]
}
```

For full API documentation, visit: http://localhost:3000/api/docs

## VPN/Proxy Detection

Detecting VPNs and proxies is tricky - no single provider gets it right 100% of the time. That's why we built a multi-layered detection system that combines insights from specialized providers, ASN databases, and pattern matching to give you accurate results.

### How Detection Works

We use three complementary methods to identify VPNs, proxies, and Tor exit nodes:

1. **Specialized Detection Providers**:
   - **ProxyCheck.io**: Advanced VPN/proxy detection with operator identification (highest trust)
   - **IPQualityScore**: Comprehensive fraud and VPN detection
   - **VPNapi.io**: Dedicated VPN detection service
   - **IPHub.info**: Datacenter and proxy detection

2. **ASN-Based Identification**: Maps ASNs and organizations to known VPN providers:
   - ProtonVPN (AS51167, AS212238, AS62371, AS206067)
   - NordVPN (AS202425, AS57878, AS210083)
   - ExpressVPN (AS396356, AS397444)
   - Surfshark (AS202306, AS208323)
   - CyberGhost (AS205157)
   - Private Internet Access (AS46562, AS54290)
   - Mullvad (AS208843)
   - Windscribe (AS59711, AS396998)
   - IPVanish (AS35470, AS49981)
   - Hide.me (AS199883)
   - TorGuard (AS395324)

3. **Trust-Weighted Correlation**:
   - ProxyCheck.io with `operator.name` gets highest trust (rank 10)
   - Multiple providers vote on VPN detection
   - Conflicts resolved using trust ranks

### Getting the Right VPN Provider Name

Here's where things get interesting. When someone uses a VPN, there are actually two networks involved: the ISP (like "Tele2 Sverige AB") and the actual VPN service (like "ProtonVPN"). We want to show you the VPN service name, not the ISP.

**How we do it:**

First, we check ProxyCheck.io's `operator.name` field - this contains the actual VPN service name. This is our most reliable source and gets the highest trust ranking.

If that's not available, we have backup methods:
- Match the IP's ASN against our database of known VPN providers
- Look for VPN-related keywords in organization names from other providers
- Let multiple providers vote, with more trusted sources carrying more weight

**A recent fix:** We discovered the system was showing ISP names instead of VPN providers. The issue? ProxyCheck.io returns both the ISP (in the `provider` field) and the VPN service (in `operator.name`), and we were reading the wrong one. Now fixed - you'll see "ProtonVPN" instead of "Tele2 Sverige AB".

### Example Detection Result

```json
{
  "ip": "95.153.31.121",
  "flags": {
    "isVpn": true,
    "isProxy": true,
    "isTor": false,
    "vpnProvider": "ProtonVPN",
    "confidence": 95
  },
  "threat": {
    "abuseScore": 100,
    "riskLevel": "high"
  }
}
```

### Need to Detect a Different VPN?

The system knows about 11 major VPN providers out of the box, but you might need to detect others. It's easy to add custom providers - just edit [backend/src/services/vpn-provider-mapping.ts](backend/src/services/vpn-provider-mapping.ts) and add your VPN's ASN numbers and organization names:

```typescript
const VPN_MAPPINGS: VPNMapping[] = [
  {
    asns: ['AS12345', 'AS67890'],
    orgs: ['YourVPN Provider', 'YourVPN Inc'],
    provider: 'YourVPN',
  },
  // ... existing mappings
];
```

After adding your mapping, rebuild the project and you're good to go!

## Configuration

### Environment Variables

Key configuration options (see `.env.example` for full list):

```bash
# Core Geolocation Providers
IPINFO_TOKEN=your_token_here          # ipinfo.io (50k req/month free)
IPDATA_KEY=your_key_here              # ipdata.co (1.5k req/day free)
IPGEOLOCATION_KEY=your_key_here       # ipgeolocation.io (30k req/month free)

# Threat Intelligence Providers
ABUSEIPDB_KEY=your_key_here           # abuseipdb.com (1k req/day free)
VIRUSTOTAL_KEY=your_key_here          # virustotal.com (4 req/min free)
SHODAN_KEY=your_key_here              # shodan.io (paid API)
GREYNOISE_KEY=your_key_here           # greynoise.io (community API)
ALIENVAULT_OTX_KEY=your_key_here      # otx.alienvault.com (free)
CROWDSEC_KEY=your_key_here            # crowdsec.net (free tier available)
IPQUALITYSCORE_KEY=your_key_here      # ipqualityscore.com (5k req/month free)

# VPN/Proxy Detection Providers
PROXYCHECK_KEY=your_key_here          # proxycheck.io (1k req/day free, 100/day with VPN detection)
VPNAPI_KEY=your_key_here              # vpnapi.io (1k req/day free)
IPHUB_KEY=your_key_here               # iphub.info (1k req/day free)

# LLM Configuration
OLLAMA_URL=http://ollama:11434        # Ollama API endpoint
OLLAMA_MODEL=qwen3:0.6b               # Model to use for analysis
LLM_ENABLED=true                      # Enable/disable AI analysis

# Performance Tuning
PROVIDER_CONCURRENCY=4                # Max parallel provider requests
CACHE_TTL_SECONDS=2592000             # 30 days
RATE_LIMIT_PER_MINUTE=60              # Per-IP rate limit

# Admin Access
ADMIN_API_KEY=your_secure_key_here    # Protect admin endpoints
```

### Getting API Keys

Good news - most providers are generous with their free tiers! You can get started without paying anything, though having API keys definitely improves accuracy. Here's where to sign up:

#### Geolocation Providers

1. **ip-api.com**: No key needed! Just use it (45 requests/min limit)
2. **ipinfo.io**: [Sign up here](https://ipinfo.io/signup) - 50,000 lookups/month free
3. **ipdata.co**: [Sign up here](https://ipdata.co/sign-up.html) - 1,500 lookups/day free
4. **ipgeolocation.io**: [Sign up here](https://ipgeolocation.io/signup.html) - 30,000 lookups/month free

#### Threat Intelligence Providers

5. **AbuseIPDB**: [Sign up here](https://www.abuseipdb.com/register) - 1,000 checks/day free
6. **VirusTotal**: [Sign up here](https://www.virustotal.com/gui/join-us) - 4 requests/min free
7. **Shodan**: [Sign up here](https://account.shodan.io/register) - Paid only ($59/month), but worth it for serious threat intel
8. **GreyNoise**: [Sign up here](https://www.greynoise.io/plans/community) - Community API is completely free
9. **AlienVault OTX**: [Sign up here](https://otx.alienvault.com/) - Free with registration
10. **CrowdSec**: [Sign up here](https://www.crowdsec.net/) - Free tier available
11. **IPQualityScore**: [Sign up here](https://www.ipqualityscore.com/create-account) - 5,000 lookups/month free
12. **Abuse.ch**: No key needed - they're awesome like that (rate limited though)
13. **Spamhaus**: No key needed - free DNSBL access

#### VPN/Proxy Detection Providers

14. **ProxyCheck.io**: [Sign up here](https://proxycheck.io/api/) - 1,000 lookups/day free (100/day with VPN provider detection)
15. **VPNapi.io**: [Sign up here](https://vpnapi.io/) - 1,000 lookups/day free
16. **IPHub.info**: [Sign up here](https://iphub.info/apiKey/newFree) - 1,000 lookups/day free

## Why We Built It This Way

Here are the key architectural decisions and the reasoning behind them:

### Cache Everything, Query Rarely

**Why?** IP geolocation doesn't change often, and constantly hitting API endpoints gets expensive fast. We cache results for 30 days and automatically refresh the TTL when it drops below 25 days.

**Trade-off:** Your data might be slightly stale, but honestly? For most use cases, 30-day-old geolocation data is perfectly fine.

### When Providers Disagree, Trust the Experts

Different providers have different accuracy levels. When they disagree (which happens more often than you'd think), we don't just pick randomly - we use trust rankings:

- **Threat Intel rankings:** AbuseIPDB/VirusTotal/Spamhaus (9/10) > GreyNoise/IPInfo/CrowdSec (8/10) > IPData (7/10) > IP-API (6/10)
- **VPN Detection rankings:** ProxyCheck.io with operator.name (10/10) > IPQualityScore/VPNapi (9/10) > IPHub (8/10)

Think of it like a weighted voting system where more reliable sources get more votes.

### Layer Your VPN Detection

No single API is perfect at detecting VPNs. We start with specialized detection providers like ProxyCheck.io, fall back to ASN-based detection if needed, and finally do pattern matching on organization names. Result? Over 95% accuracy with graceful degradation when some methods fail.

### Keep Providers Isolated (Circuit Breakers)

One slow or failing provider shouldn't tank your entire lookup. Each provider gets its own circuit breaker - after 5 consecutive failures, we give it a 60-second timeout. The other 18 providers keep working normally.

### Run Your AI Locally

We use Ollama to run threat analysis with a local LLM. Why local? Privacy. Your IP lookups stay on your infrastructure. The AI generates MITRE ATT&CK mappings, risk scores, and security recommendations without sending data to external AI services.

**Trade-off:** You need some extra compute resources, but it's worth it for the privacy benefit.

### No Real-Time Streaming

We could add WebSockets and stream updates in real-time, but honestly? Most use cases don't need it. The added complexity isn't worth it. If you need fresh data, just hit the API with `forceRefresh: true`.

## Project Structure

```
IPChecker/
├── backend/              # Node.js/TypeScript backend
│   ├── src/
│   │   ├── config/       # Environment & logger config
│   │   ├── providers/    # IP lookup provider implementations
│   │   ├── routes/       # Fastify route handlers
│   │   ├── services/     # Business logic (cache, DB, correlation, LLM)
│   │   ├── types/        # TypeScript interfaces
│   │   ├── utils/        # Helpers (validation, retry, etc.)
│   │   └── server.ts     # Main server entry point
│   └── prisma/           # Database schema & migrations
├── frontend/             # React/TypeScript frontend
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── hooks/        # React Query hooks
│   │   ├── lib/          # API client
│   │   ├── styles/       # Tailwind CSS
│   │   └── App.tsx       # Main app component
│   └── index.html
├── shared/               # Shared TypeScript types
│   └── src/types.ts
├── docker-compose.yml    # Service orchestration
├── Dockerfile            # Multi-stage build
└── .env.example          # Configuration template
```

## Security

- **Rate Limiting**: 60 requests per minute per IP (configurable)
- **Input Validation**: Strict IP format checks, blocks private/reserved IPs
- **Security Headers**: HSTS, CSP, X-Frame-Options, and other standard protections
- **Admin Endpoints**: Protected by `X-Admin-Key` header
- **No PII Logging**: IP addresses redacted in logs (configurable)
- **Local LLM**: Threat analysis runs locally, no data sent to external AI services

## Testing

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests
```bash
npm run test:integration
```

### E2E Tests (Playwright)
```bash
cd frontend
npm run test:e2e
```

## Common Issues (And How to Fix Them)

### "All providers failed or timed out" (503 errors)

This usually means either your API keys are missing/wrong, or the providers can't be reached.

**Quick fixes:**
1. Double-check your `.env` file - are your API keys actually there?
2. Test if you can reach providers: `docker compose exec web ping ip-api.com`
3. Check if circuit breakers tripped: `GET /api/v1/providers`
4. If circuit breakers are stuck, reset them: `POST /api/v1/admin/reset-circuits`

### Redis won't connect

Seeing "Redis connection error" in your logs? Redis probably crashed or didn't start.

**Try this:**
1. Is Redis even running? `docker compose ps redis`
2. Check what Redis is complaining about: `docker compose logs redis`
3. When in doubt, restart it: `docker compose restart redis`

### Prisma migration errors on startup

If you're seeing Prisma errors, the database schema and your code are probably out of sync.

**Fix it:**
1. Run migrations manually:
   ```bash
   cd backend
   npx prisma migrate deploy
   ```
2. Regenerate the Prisma client if the schema changed:
   ```bash
   npx prisma generate
   ```

### Getting a blank page?

Nothing loading at http://localhost:3000? The frontend probably isn't built.

**Here's what to do:**
1. Check if the build exists: `ls frontend/dist`
2. If not, build it: `cd frontend && npm run build`
3. **Development tip:** In dev mode, the frontend runs on port 5173, backend on 3000. Don't mix them up!

### AI analysis not showing up

No threat analysis in your results? Ollama might not be running, or the model isn't downloaded.

**Troubleshoot it:**
1. Check if Ollama is up: `docker compose ps ollama`
2. List downloaded models: `docker compose exec ollama ollama list`
3. Missing the model? Pull it: `docker compose exec ollama ollama pull qwen3:0.6b`
4. Still broken? Check the logs: `docker compose logs ollama`

**Pro tip:** The first time Ollama pulls a model, it takes a few minutes. Grab a coffee.

## Performance Metrics

Based on production benchmarks:

- Cache Hit Latency (p95): < 50ms
- Cache Miss (multiple providers): < 3s
- Database Query: < 10ms
- Redis Operation: < 3ms
- LLM Analysis: < 5s (depends on model size)

## Future Enhancements

- [ ] Background job processing with BullMQ (async lookups)
- [ ] Load detection and backpressure handling
- [ ] Historical data tracking (time-series)
- [ ] Prometheus metrics export
- [ ] Admin dashboard UI
- [ ] Webhook notifications for high-risk IPs
- [ ] Integration with SIEM platforms
- [ ] Real-time WebSocket updates for ongoing lookups

## What's New?

### January 2026 Updates

#### We Fixed VPN Provider Detection (Finally!)

Remember how the system was showing "Tele2 Sverige AB" when you were clearly using ProtonVPN? Yeah, that was annoying. Here's what happened:

When you use a VPN, your traffic goes through two networks: your ISP (like "Tele2 Sverige AB") and the VPN service (like "ProtonVPN"). ProxyCheck.io gives us both pieces of info - the ISP in the `provider` field and the actual VPN name in `operator.name`. We were reading the wrong field. Oops.

**What we changed:**
- Updated the ProxyCheck.io integration to look at `operator.name` first
- Gave ProxyCheck.io the highest trust ranking (10/10) when it provides the VPN operator name
- Now you'll see "ProtonVPN" instead of confusing ISP names

Check out the fixes in [proxycheck.ts](backend/src/providers/proxycheck.ts) and [correlation.ts](backend/src/services/correlation.ts) if you're curious about the implementation.

#### More Threat Intel, Better Analysis

We've expanded to 19+ threat intelligence providers and added some seriously useful features:
- **MITRE ATT&CK mapping**: See which attack techniques match the IP's behavior
- **Vulnerability tracking**: Extract CVEs from services exposed on the IP
- **Malware family identification**: Know which malware families have been associated with the IP
- **Temporal trends**: See if attacks are increasing, stable, or declining over time

#### Bulk Processing Is Here

Need to check a whole list of IPs? Now you can:
- Send multiple IPs in one request via `/api/v1/lookup/bulk`
- Export results to CSV for your spreadsheets
- Process hundreds of IPs without making individual API calls

#### UI Got Some Love

The frontend is way more useful now:
- **Interactive maps** with Leaflet - see exactly where IPs are located
- **Collapsible provider results** - no more scrolling through walls of JSON
- **Better threat visualization** - the threat gauge actually makes sense now
- **AI analysis panel** - the LLM's insights are front and center
- **Conflict reports** - when providers disagree, we show you why and how we resolved it

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome. Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## Support

- Documentation: http://localhost:3000/api/docs
- Issues: [GitHub Issues](https://github.com/yourusername/ipchecker/issues)

---

Built with Node.js 20, React 18, TypeScript 5, Fastify 4, Prisma 5, Redis 7, PostgreSQL 15, Tailwind CSS 3, and Ollama

Deployment: Docker, Docker Compose, Kubernetes-ready
