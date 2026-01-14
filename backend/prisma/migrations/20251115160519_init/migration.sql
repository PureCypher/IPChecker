-- CreateTable
CREATE TABLE "ip_records" (
    "ip" TEXT NOT NULL,
    "asn" TEXT,
    "org" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "timezone" TEXT,
    "flags" JSONB NOT NULL,
    "threat" JSONB NOT NULL,
    "providers" JSONB NOT NULL,
    "conflicts" JSONB,
    "source" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ip_records_pkey" PRIMARY KEY ("ip")
);

-- CreateTable
CREATE TABLE "provider_stats" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "timeoutCount" INTEGER NOT NULL DEFAULT 0,
    "avgLatencyMs" INTEGER,
    "p95LatencyMs" INTEGER,
    "lastError" TEXT,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "provider_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_entries" (
    "key" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rate_limit_entries_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ip_records_expiresAt_idx" ON "ip_records"("expiresAt");

-- CreateIndex
CREATE INDEX "ip_records_updatedAt_idx" ON "ip_records"("updatedAt");

-- CreateIndex
CREATE INDEX "provider_stats_date_idx" ON "provider_stats"("date");

-- CreateIndex
CREATE UNIQUE INDEX "provider_stats_provider_date_key" ON "provider_stats"("provider", "date");

-- CreateIndex
CREATE INDEX "rate_limit_entries_resetAt_idx" ON "rate_limit_entries"("resetAt");
