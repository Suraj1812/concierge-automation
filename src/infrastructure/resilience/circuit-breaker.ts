type CircuitBreakerState = "closed" | "open" | "half_open";

export class CircuitBreaker {
  private state: CircuitBreakerState = "closed";
  private failureCount = 0;
  private openedAt = 0;

  constructor(
    private readonly failureThreshold = 5,
    private readonly resetTimeoutMs = 30_000
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const now = Date.now();

    if (this.state === "open" && now - this.openedAt < this.resetTimeoutMs) {
      throw new Error("Circuit breaker is open");
    }

    if (this.state === "open") {
      this.state = "half_open";
    }

    try {
      const result = await operation();
      this.failureCount = 0;
      this.state = "closed";
      return result;
    } catch (error) {
      this.failureCount += 1;
      if (this.failureCount >= this.failureThreshold) {
        this.state = "open";
        this.openedAt = Date.now();
      }
      throw error;
    }
  }
}
