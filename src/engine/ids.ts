/**
 * Stable numeric entity IDs, monotonic per simulation run. Never reused —
 * saves, telemetry, and the co-op hedge all key on these.
 */
export class IdGenerator {
  private next = 1;

  allocate(): number {
    return this.next++;
  }
}
