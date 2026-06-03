/**
 * @module @enterstellar-ai/cache/lru-cache
 * @description Internal LRU (Least Recently Used) cache data structure.
 *
 * Implements a doubly-linked list + `Map` for O(1) get, set, delete, and
 * eviction operations. This is an internal module — NOT exported from the
 * `@enterstellar-ai/cache` barrel.
 *
 * **Why custom:** The LRU is ~100 lines. Avoids an external dependency
 * (`lru-cache` npm), keeps the package zero-dep (excluding peer deps), and
 * gives full control over the eviction callback (needed for stats tracking
 * and DevTools integration).
 *
 * **L15 compliance:** Zero framework imports. Pure TypeScript.
 *
 * @internal
 */

// ---------------------------------------------------------------------------
// Linked List Node
// ---------------------------------------------------------------------------

/**
 * A node in the doubly-linked list.
 * Each node holds a key-value pair and pointers to its neighbours.
 *
 * @internal
 */
type LRUNode<T> = {
    /** Cache key for reverse-lookup during eviction. */
    readonly key: string;
    /** The cached value. */
    value: T;
    /** Pointer to the more-recently-used node (towards head). */
    prev: LRUNode<T> | undefined;
    /** Pointer to the less-recently-used node (towards tail). */
    next: LRUNode<T> | undefined;
};

// ---------------------------------------------------------------------------
// Eviction Callback
// ---------------------------------------------------------------------------

/**
 * Callback invoked when an entry is evicted from the LRU.
 * Receives the evicted key and value.
 *
 * @internal
 */
export type OnEvictCallback<T> = (key: string, value: T) => void;

// ---------------------------------------------------------------------------
// LRU Cache Class
// ---------------------------------------------------------------------------

/**
 * A generic LRU cache with O(1) get, set, and delete operations.
 *
 * **Data structure:** Doubly-linked list (access order) + `Map` (key lookup).
 * - Head = most recently used
 * - Tail = least recently used (eviction candidate)
 *
 * @typeParam T - The type of values stored in the cache.
 *
 * @internal
 */
export class LRUCache<T> {
    /** Maximum number of entries before LRU eviction. */
    private readonly capacity: number;

    /** Key → Node lookup map for O(1) access. */
    private readonly map: Map<string, LRUNode<T>>;

    /** Most recently used node. */
    private head: LRUNode<T> | undefined;

    /** Least recently used node (eviction candidate). */
    private tail: LRUNode<T> | undefined;

    /** Optional callback invoked on eviction. */
    private readonly onEvict: OnEvictCallback<T> | undefined;

    /**
     * Creates a new LRU cache.
     *
     * @param capacity - Maximum number of entries. Must be ≥ 1.
     * @param onEvict - Optional callback invoked when an entry is evicted.
     */
    constructor(capacity: number, onEvict?: OnEvictCallback<T>) {
        this.capacity = capacity;
        this.map = new Map<string, LRUNode<T>>();
        this.head = undefined;
        this.tail = undefined;
        this.onEvict = onEvict;
    }

    /**
     * Retrieves the value for a key and promotes it to most-recently-used.
     *
     * @param key - The cache key.
     * @returns The cached value, or `undefined` if not found.
     */
    get(key: string): T | undefined {
        const node = this.map.get(key);
        if (node === undefined) {
            return undefined;
        }
        // Promote to head (most recently used)
        this.moveToHead(node);
        return node.value;
    }

    /**
     * Stores or updates a key-value pair. Promotes to most-recently-used.
     *
     * If the key already exists, its value is updated in-place.
     * If the cache is at capacity, the least-recently-used entry is evicted.
     *
     * @param key - The cache key.
     * @param value - The value to store.
     */
    set(key: string, value: T): void {
        const existing = this.map.get(key);

        if (existing !== undefined) {
            // Update existing entry and promote
            existing.value = value;
            this.moveToHead(existing);
            return;
        }

        // Create new node
        const node: LRUNode<T> = {
            key,
            value,
            prev: undefined,
            next: undefined,
        };

        // Add to map and promote to head
        this.map.set(key, node);
        this.addToHead(node);

        // Evict tail if over capacity
        if (this.map.size > this.capacity) {
            this.evictTail();
        }
    }

    /**
     * Deletes an entry by key.
     *
     * @param key - The cache key to delete.
     * @returns `true` if the entry was found and deleted, `false` otherwise.
     */
    delete(key: string): boolean {
        const node = this.map.get(key);
        if (node === undefined) {
            return false;
        }
        this.removeNode(node);
        this.map.delete(key);
        return true;
    }

    /**
     * Checks whether a key exists in the cache.
     * Does NOT promote the entry (peek semantics).
     *
     * @param key - The cache key to check.
     * @returns `true` if the key exists.
     */
    has(key: string): boolean {
        return this.map.has(key);
    }

    /**
     * Clears all entries from the cache.
     * Does NOT invoke the eviction callback for cleared entries.
     */
    clear(): void {
        this.map.clear();
        this.head = undefined;
        this.tail = undefined;
    }

    /**
     * Returns the current number of entries in the cache.
     */
    get size(): number {
        return this.map.size;
    }

    /**
     * Iterates over all entries in access order (most recent first).
     * The callback receives the key and value for each entry.
     *
     * @param callback - Function called for each entry.
     */
    forEach(callback: (key: string, value: T) => void): void {
        let current = this.head;
        while (current !== undefined) {
            callback(current.key, current.value);
            current = current.next;
        }
    }

    /**
     * Returns all keys in access order (most recent first).
     *
     * @returns Array of cache keys.
     */
    keys(): string[] {
        const result: string[] = [];
        let current = this.head;
        while (current !== undefined) {
            result.push(current.key);
            current = current.next;
        }
        return result;
    }

    // -----------------------------------------------------------------------
    // Private: Linked List Operations
    // -----------------------------------------------------------------------

    /**
     * Adds a node to the head of the linked list (most recently used position).
     */
    private addToHead(node: LRUNode<T>): void {
        node.prev = undefined;
        node.next = this.head;

        if (this.head !== undefined) {
            this.head.prev = node;
        }

        this.head = node;

        this.tail ??= node;
    }

    /**
     * Removes a node from its current position in the linked list.
     */
    private removeNode(node: LRUNode<T>): void {
        if (node.prev !== undefined) {
            node.prev.next = node.next;
        } else {
            // Node is head
            this.head = node.next;
        }

        if (node.next !== undefined) {
            node.next.prev = node.prev;
        } else {
            // Node is tail
            this.tail = node.prev;
        }

        node.prev = undefined;
        node.next = undefined;
    }

    /**
     * Moves an existing node to the head (most recently used position).
     */
    private moveToHead(node: LRUNode<T>): void {
        if (node === this.head) {
            return; // Already at head
        }
        this.removeNode(node);
        this.addToHead(node);
    }

    /**
     * Evicts the tail node (least recently used) and invokes the callback.
     */
    private evictTail(): void {
        if (this.tail === undefined) {
            return;
        }

        const evicted = this.tail;
        this.removeNode(evicted);
        this.map.delete(evicted.key);

        if (this.onEvict !== undefined) {
            this.onEvict(evicted.key, evicted.value);
        }
    }
}
