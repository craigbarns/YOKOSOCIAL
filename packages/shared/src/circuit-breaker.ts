type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private nextAttempt = 0;
  private lastError: Error | undefined = undefined;

  constructor(
    private name: string,
    private threshold = 5,
    private timeout = 60000
  ) {}

  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      nextAttempt: this.nextAttempt,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() < this.nextAttempt) {
        throw new CircuitOpenError(
          `Circuit breaker "${this.name}" is OPEN. Retry after ${new Date(this.nextAttempt).toISOString()}`
        );
      }
      this.state = "HALF_OPEN";
      console.log(`[CircuitBreaker:${this.name}] HALF_OPEN — testing...`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err as Error);
      throw err;
    }
  }

  private onSuccess() {
    this.failures = 0;
    if (this.state === "HALF_OPEN") {
      console.log(`[CircuitBreaker:${this.name}] CLOSED — service recovered`);
    }
    this.state = "CLOSED";
    this.lastError = undefined;
  }

  private onFailure(err: Error) {
    this.failures++;
    this.lastError = err;
    console.error(
      `[CircuitBreaker:${this.name}] failure ${this.failures}/${this.threshold}: ${err.message}`
    );

    if (this.failures >= this.threshold) {
      this.state = "OPEN";
      this.nextAttempt = Date.now() + this.timeout;
      console.error(
        `[CircuitBreaker:${this.name}] OPEN until ${new Date(this.nextAttempt).toISOString()}`
      );
    }
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
  }
}

// Instances globales
export const openaiBreaker = new CircuitBreaker("openai", 5, 60000);
export const postizBreaker = new CircuitBreaker("postiz", 5, 30000);
export const yokosushiBreaker = new CircuitBreaker("yokosushi-import", 3, 120000);
