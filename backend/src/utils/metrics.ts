/**
 * Simple in-memory Prometheus-compatible metrics collector.
 *
 * Supports counters, gauges, and histograms — no external dependencies required.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Labels = Record<string, string>;

interface HistogramConfig {
  name: string;
  help: string;
  buckets: number[];
  labelNames: string[];
}

interface HistogramEntry {
  config: HistogramConfig;
  /** key = serialised labels, value = array of observed values per bucket + sum/count */
  observations: Map<
    string,
    { bucketCounts: number[]; sum: number; count: number }
  >;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function labelsToKey(labels: Labels): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
}

// ---------------------------------------------------------------------------
// MetricsCollector (singleton)
// ---------------------------------------------------------------------------

class MetricsCollector {
  private counters = new Map<string, { help: string; values: Map<string, number> }>();
  private gauges = new Map<string, { help: string; values: Map<string, number> }>();
  private histograms = new Map<string, HistogramEntry>();

  // ------- Counters -------

  registerCounter(name: string, help: string): void {
    if (!this.counters.has(name)) {
      this.counters.set(name, { help, values: new Map() });
    }
  }

  incCounter(name: string, labels: Labels = {}, value = 1): void {
    const counter = this.counters.get(name);
    if (!counter) return;
    const key = labelsToKey(labels);
    counter.values.set(key, (counter.values.get(key) ?? 0) + value);
  }

  // ------- Gauges -------

  registerGauge(name: string, help: string): void {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, { help, values: new Map() });
    }
  }

  setGauge(name: string, labels: Labels = {}, value: number): void {
    const gauge = this.gauges.get(name);
    if (!gauge) return;
    const key = labelsToKey(labels);
    gauge.values.set(key, value);
  }

  incGauge(name: string, labels: Labels = {}, value = 1): void {
    const gauge = this.gauges.get(name);
    if (!gauge) return;
    const key = labelsToKey(labels);
    gauge.values.set(key, (gauge.values.get(key) ?? 0) + value);
  }

  decGauge(name: string, labels: Labels = {}, value = 1): void {
    const gauge = this.gauges.get(name);
    if (!gauge) return;
    const key = labelsToKey(labels);
    gauge.values.set(key, (gauge.values.get(key) ?? 0) - value);
  }

  // ------- Histograms -------

  registerHistogram(
    name: string,
    help: string,
    buckets: number[],
    labelNames: string[] = []
  ): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, {
        config: { name, help, buckets: [...buckets].sort((a, b) => a - b), labelNames },
        observations: new Map(),
      });
    }
  }

  observeHistogram(name: string, labels: Labels, value: number): void {
    const histogram = this.histograms.get(name);
    if (!histogram) return;
    const key = labelsToKey(labels);
    let obs = histogram.observations.get(key);
    if (!obs) {
      obs = {
        bucketCounts: new Array(histogram.config.buckets.length).fill(0),
        sum: 0,
        count: 0,
      };
      histogram.observations.set(key, obs);
    }
    obs.sum += value;
    obs.count += 1;
    for (let i = 0; i < histogram.config.buckets.length; i++) {
      if (value <= histogram.config.buckets[i]!) {
        obs.bucketCounts[i]! += 1;
      }
    }
  }

  // ------- Serialisation (Prometheus text exposition format) -------

  serialize(): string {
    const lines: string[] = [];

    // Counters
    for (const [name, counter] of this.counters) {
      lines.push(`# HELP ${name} ${counter.help}`);
      lines.push(`# TYPE ${name} counter`);
      if (counter.values.size === 0) {
        lines.push(`${name} 0`);
      } else {
        for (const [key, val] of counter.values) {
          const lbls = key ? `{${key}}` : '';
          lines.push(`${name}${lbls} ${val}`);
        }
      }
      lines.push('');
    }

    // Gauges
    for (const [name, gauge] of this.gauges) {
      lines.push(`# HELP ${name} ${gauge.help}`);
      lines.push(`# TYPE ${name} gauge`);
      if (gauge.values.size === 0) {
        lines.push(`${name} 0`);
      } else {
        for (const [key, val] of gauge.values) {
          const lbls = key ? `{${key}}` : '';
          lines.push(`${name}${lbls} ${val}`);
        }
      }
      lines.push('');
    }

    // Histograms
    for (const [name, histogram] of this.histograms) {
      lines.push(`# HELP ${name} ${histogram.config.help}`);
      lines.push(`# TYPE ${name} histogram`);

      if (histogram.observations.size === 0) {
        // Emit empty histogram
        for (const bucket of histogram.config.buckets) {
          lines.push(`${name}_bucket{le="${bucket}"} 0`);
        }
        lines.push(`${name}_bucket{le="+Inf"} 0`);
        lines.push(`${name}_sum 0`);
        lines.push(`${name}_count 0`);
      } else {
        for (const [key, obs] of histogram.observations) {
          const baseLabels = key ? `${key},` : '';
          let cumulative = 0;
          for (let i = 0; i < histogram.config.buckets.length; i++) {
            cumulative += obs.bucketCounts[i]!;
            lines.push(
              `${name}_bucket{${baseLabels}le="${histogram.config.buckets[i]}"} ${cumulative}`
            );
          }
          cumulative += 0; // +Inf includes everything
          lines.push(`${name}_bucket{${baseLabels}le="+Inf"} ${obs.count}`);

          const sumLabels = key ? `{${key}}` : '';
          lines.push(`${name}_sum${sumLabels} ${obs.sum}`);
          lines.push(`${name}_count${sumLabels} ${obs.count}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

// ---------------------------------------------------------------------------
// Singleton instance + convenience registration
// ---------------------------------------------------------------------------

export const metrics = new MetricsCollector();

// Register all application metrics up-front
metrics.registerCounter(
  'ipintel_requests_total',
  'Total number of HTTP requests'
);
metrics.registerHistogram(
  'ipintel_request_duration_seconds',
  'HTTP request duration in seconds',
  [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
  ['method', 'path']
);
metrics.registerCounter(
  'ipintel_provider_requests_total',
  'Total number of provider lookup requests'
);
metrics.registerCounter(
  'ipintel_cache_hits_total',
  'Total number of cache hits'
);
metrics.registerCounter(
  'ipintel_cache_misses_total',
  'Total number of cache misses'
);
metrics.registerGauge(
  'ipintel_active_lookups',
  'Number of currently in-flight lookups'
);
