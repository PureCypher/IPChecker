#!/bin/bash

echo "Starting IP Intelligence Correlator (Local Development)"
echo "========================================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env file with generated credentials..."
    DEV_PG_PASS=$(openssl rand -base64 24 2>/dev/null || echo "dev-postgres-$(date +%s)")
    DEV_REDIS_PASS=$(openssl rand -base64 24 2>/dev/null || echo "dev-redis-$(date +%s)")
    cat > .env << EOF
NODE_ENV=development
PORT=3000

# Generated credentials for local development
POSTGRES_PASSWORD=${DEV_PG_PASS}
REDIS_PASSWORD=${DEV_REDIS_PASS}
DATABASE_URL=postgresql://postgres:${DEV_PG_PASS}@localhost:5432/ipintel
REDIS_URL=redis://:${DEV_REDIS_PASS}@localhost:6379
ADMIN_API_KEY=dev-admin-key-12345

# Optional: Add your API keys here
IPINFO_TOKEN=
IPDATA_KEY=

# Performance
PROVIDER_CONCURRENCY=4
CACHE_TTL_SECONDS=2592000
RATE_LIMIT_PER_MINUTE=60

# Logging
LOG_LEVEL=info
LOG_PRETTY=true
EOF
    echo "Done: Created .env file with generated credentials"
else
    echo "OK: .env file already exists"
fi

# Start infrastructure
echo ""
echo "Starting Redis and PostgreSQL..."
docker compose up redis db -d

# Wait for services to be healthy
echo "Waiting for services to be ready..."
sleep 5

# Check if Prisma client is generated
if [ ! -d "node_modules/@prisma/client" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Generate Prisma client
echo "Generating Prisma client..."
cd backend
npx prisma generate
cd ..

# Run migrations
echo "Running database migrations..."
cd backend
npx prisma migrate deploy 2>/dev/null || npx prisma migrate dev --name init
cd ..

echo ""
echo "Setup complete!"
echo ""
echo "Access points:"
echo "   Frontend:  http://localhost:5173"
echo "   Backend:   http://localhost:3000"
echo "   API Docs:  http://localhost:3000/api/docs"
echo "   Health:    http://localhost:3000/api/health"
echo ""
echo "Starting development servers..."
echo ""

# Start dev servers
npm run dev
