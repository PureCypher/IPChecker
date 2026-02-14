# ═════════════════════════════════════════════════════
# Stage 2: Builder
# ═════════════════════════════════════════════════════
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install deps natively on Alpine
# (avoids platform mismatch for native binaries like esbuild)
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY shared/package.json ./shared/
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN cd backend && npm run prisma:generate

# Build all packages (shared -> backend -> frontend)
RUN npm run build

# Prune dev dependencies
RUN npm ci --omit=dev

# ═════════════════════════════════════════════════════
# Stage 3: Runner
# ═════════════════════════════════════════════════════
FROM node:20-alpine AS runner
WORKDIR /app

# Install OpenSSL compatibility for Prisma
RUN apk add --no-cache openssl libssl3 libcrypto3

# Security: non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs appuser

# Copy built artifacts
COPY --from=builder --chown=appuser:nodejs /app/backend/dist ./backend/dist
COPY --from=builder --chown=appuser:nodejs /app/frontend/dist ./frontend/dist
COPY --from=builder --chown=appuser:nodejs /app/shared/dist ./shared/dist
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/backend/package.json ./backend/
COPY --from=builder --chown=appuser:nodejs /app/shared/package.json ./shared/
COPY --from=builder --chown=appuser:nodejs /app/package.json ./

# Copy Prisma schema and generated client
COPY --from=builder --chown=appuser:nodejs /app/backend/prisma ./backend/prisma

USER appuser
EXPOSE 3000

ENV NODE_ENV=production \
    PORT=3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["sh", "-c", "cd backend && npx prisma generate && npx prisma migrate deploy && cd .. && node backend/dist/backend/src/server.js"]
