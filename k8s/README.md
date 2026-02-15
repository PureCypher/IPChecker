# Kubernetes Deployment

Deploy IPChecker to an existing Kubernetes cluster with dedicated PostgreSQL and Redis instances.

## Prerequisites

- `kubectl` configured for your cluster
- Access to the private registry at `192.168.1.76:5001`
- An existing Cloudflare Tunnel for ingress

## Deploy

### 1. Build and push the container image

```bash
docker build -t 192.168.1.76:5001/ipchecker:latest .
docker push 192.168.1.76:5001/ipchecker:latest
```

### 2. Configure secrets

Edit `k8s/secrets.yaml` with your real credentials. All values must be base64-encoded:

```bash
# Generate a strong admin key
openssl rand -base64 32

# Base64-encode a value
echo -n 'your-password-here' | base64
```

At minimum, update:
- `POSTGRES_PASSWORD` — password for the PostgreSQL instance
- `REDIS_PASSWORD` — password for the Redis instance
- `ADMIN_API_KEY` — admin endpoint auth key (minimum 32 characters)
- `DATABASE_URL` — must contain the same password as `POSTGRES_PASSWORD`: `postgresql://postgres:<password>@ipchecker-postgres.ipchecker.svc.cluster.local:5432/ipintel`
- `REDIS_URL` — must contain the same password as `REDIS_PASSWORD`: `redis://:<password>@ipchecker-redis.ipchecker.svc.cluster.local:6379`

Add any provider API keys you have (all optional — providers auto-disable when keys are empty).

### 3. Apply manifests

```bash
kubectl apply -f k8s/
```

This creates the `ipchecker` namespace and deploys PostgreSQL, Redis, and the app. Prisma migrations run automatically on startup.

### 4. Verify

```bash
# Check pods are running
kubectl -n ipchecker get pods

# Watch startup logs
kubectl -n ipchecker logs -f deploy/ipchecker

# Test health endpoint
kubectl -n ipchecker exec deploy/ipchecker -- wget -qO- http://localhost:3000/api/health
```

### 5. Configure Cloudflare Tunnel

Add a route in your existing `cloudflared` config or the Cloudflare Zero Trust dashboard:

| Hostname | Service |
|---|---|
| `ipchecker.yourdomain.com` | `http://ipchecker.ipchecker.svc.cluster.local` |

No Ingress or IngressRoute is needed — Cloudflare Tunnel routes directly to the ClusterIP service.

## Updating

```bash
docker build -t 192.168.1.76:5001/ipchecker:latest .
docker push 192.168.1.76:5001/ipchecker:latest
kubectl -n ipchecker rollout restart deploy/ipchecker
```

## Teardown

```bash
kubectl delete namespace ipchecker
```

This removes all resources (deployments, services, secrets, PVCs) in the namespace.
