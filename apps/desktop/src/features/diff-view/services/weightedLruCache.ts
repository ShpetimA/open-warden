type WeightedEntry<Value> = {
  readonly value: Value;
  readonly weight: number;
};

/** Limits retained values by both entry count and caller-defined weight. */
export class WeightedLruCache<Key, Value> {
  readonly #maxEntries: number;
  readonly #maxWeight: number;
  readonly #entries = new Map<Key, WeightedEntry<Value>>();
  #weight = 0;

  /** Creates a cache with positive, finite count and weight budgets. */
  constructor(options: { readonly maxEntries: number; readonly maxWeight: number }) {
    if (!Number.isFinite(options.maxEntries) || options.maxEntries < 1) {
      throw new RangeError("maxEntries must be a positive finite number.");
    }
    if (!Number.isFinite(options.maxWeight) || options.maxWeight < 1) {
      throw new RangeError("maxWeight must be a positive finite number.");
    }

    this.#maxEntries = Math.floor(options.maxEntries);
    this.#maxWeight = Math.floor(options.maxWeight);
  }

  /** Returns the number of retained entries. */
  get size(): number {
    return this.#entries.size;
  }

  /** Returns the total caller-defined weight of retained entries. */
  get weight(): number {
    return this.#weight;
  }

  /** Reports whether a key is retained without changing its recency. */
  has(key: Key): boolean {
    return this.#entries.has(key);
  }

  /** Returns and marks a retained value as most recently used. */
  get(key: Key): Value | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;

    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  /** Returns a retained value without changing its recency. */
  peek(key: Key): Value | undefined {
    return this.#entries.get(key)?.value;
  }

  /** Retains a value and evicts least-recently-used entries to satisfy both budgets. */
  set(key: Key, value: Value, weight: number): void {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError("weight must be a non-negative finite number.");
    }

    const normalizedWeight = Math.ceil(weight);
    this.delete(key);

    if (normalizedWeight > this.#maxWeight) {
      return;
    }

    this.#entries.set(key, { value, weight: normalizedWeight });
    this.#weight += normalizedWeight;
    this.#evictToBudget();
  }

  /** Removes a retained value and returns whether it existed. */
  delete(key: Key): boolean {
    const entry = this.#entries.get(key);
    if (!entry) return false;

    this.#entries.delete(key);
    this.#weight -= entry.weight;
    return true;
  }

  /** Removes all retained values. */
  clear(): void {
    this.#entries.clear();
    this.#weight = 0;
  }

  #evictToBudget(): void {
    while (this.#entries.size > this.#maxEntries || this.#weight > this.#maxWeight) {
      const oldest = this.#entries.keys().next();
      if (oldest.done) return;
      this.delete(oldest.value);
    }
  }
}
