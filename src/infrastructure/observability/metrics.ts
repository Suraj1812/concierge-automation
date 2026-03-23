type MetricKey = string;

type CounterValue = {
  name: string;
  labels: Record<string, string>;
  value: number;
};

type HistogramValue = {
  name: string;
  labels: Record<string, string>;
  count: number;
  sum: number;
  max: number;
};

const normalizeLabels = (labels?: Record<string, string | number | boolean | undefined>): Record<string, string> => {
  const entries = Object.entries(labels ?? {})
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, String(value)]);

  return Object.fromEntries(entries);
};

const buildMetricKey = (name: string, labels?: Record<string, string | number | boolean | undefined>): MetricKey => {
  const normalized = normalizeLabels(labels);
  return `${name}:${JSON.stringify(normalized)}`;
};

const labelsToPrometheus = (labels: Record<string, string>): string => {
  const entries = Object.entries(labels);
  if (entries.length === 0) {
    return "";
  }

  const serialized = entries.map(([key, value]) => `${key}="${value.replace(/"/g, '\\"')}"`).join(",");
  return `{${serialized}}`;
};

export class MetricsRegistry {
  private readonly counters = new Map<MetricKey, CounterValue>();
  private readonly histograms = new Map<MetricKey, HistogramValue>();

  increment(name: string, labels?: Record<string, string | number | boolean | undefined>, value = 1): void {
    const metricKey = buildMetricKey(name, labels);
    const normalizedLabels = normalizeLabels(labels);
    const current = this.counters.get(metricKey);

    this.counters.set(metricKey, {
      name,
      labels: normalizedLabels,
      value: (current?.value ?? 0) + value
    });
  }

  observe(name: string, value: number, labels?: Record<string, string | number | boolean | undefined>): void {
    const metricKey = buildMetricKey(name, labels);
    const normalizedLabels = normalizeLabels(labels);
    const current = this.histograms.get(metricKey);

    this.histograms.set(metricKey, {
      name,
      labels: normalizedLabels,
      count: (current?.count ?? 0) + 1,
      sum: (current?.sum ?? 0) + value,
      max: Math.max(current?.max ?? 0, value)
    });
  }

  snapshot() {
    return {
      counters: Array.from(this.counters.values()),
      histograms: Array.from(this.histograms.values())
    };
  }

  toPrometheus(): string {
    const lines: string[] = [];

    const countersByName = new Map<string, CounterValue[]>();
    for (const counter of this.counters.values()) {
      const bucket = countersByName.get(counter.name) ?? [];
      bucket.push(counter);
      countersByName.set(counter.name, bucket);
    }

    const histogramsByName = new Map<string, HistogramValue[]>();
    for (const histogram of this.histograms.values()) {
      const bucket = histogramsByName.get(histogram.name) ?? [];
      bucket.push(histogram);
      histogramsByName.set(histogram.name, bucket);
    }

    for (const [name, values] of countersByName) {
      lines.push(`# TYPE ${name} counter`);
      for (const metric of values) {
        lines.push(`${name}${labelsToPrometheus(metric.labels)} ${metric.value}`);
      }
    }

    for (const [name, values] of histogramsByName) {
      lines.push(`# TYPE ${name}_count counter`);
      lines.push(`# TYPE ${name}_sum counter`);
      lines.push(`# TYPE ${name}_max gauge`);
      for (const metric of values) {
        const labels = labelsToPrometheus(metric.labels);
        lines.push(`${name}_count${labels} ${metric.count}`);
        lines.push(`${name}_sum${labels} ${metric.sum}`);
        lines.push(`${name}_max${labels} ${metric.max}`);
      }
    }

    return `${lines.join("\n")}\n`;
  }
}

export const metrics = new MetricsRegistry();
