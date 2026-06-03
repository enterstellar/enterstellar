/**
 * @module @enterstellar-ai/cache/__tests__/lru-cache
 * @description Tests for `LRUCache` — internal doubly-linked list + Map LRU.
 * Verifies O(1) get/set/delete, LRU eviction order, promote-on-access,
 * eviction callback, and edge cases.
 */

import { describe, it, expect, vi } from 'vitest';

import { LRUCache } from '../src/lru-cache.js';

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('LRUCache — constructor', () => {
    it('creates an empty cache with the given capacity', () => {
        const cache = new LRUCache<string>(10);
        expect(cache.size).toBe(0);
    });

    it('accepts an optional eviction callback', () => {
        const onEvict = vi.fn();
        const cache = new LRUCache<string>(2, onEvict);
        expect(cache.size).toBe(0);
        expect(onEvict).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// set() + get()
// ---------------------------------------------------------------------------

describe('LRUCache — set() and get()', () => {
    it('stores and retrieves a value by key', () => {
        const cache = new LRUCache<number>(10);
        cache.set('a', 1);
        expect(cache.get('a')).toBe(1);
    });

    it('returns undefined for a non-existent key', () => {
        const cache = new LRUCache<number>(10);
        expect(cache.get('missing')).toBeUndefined();
    });

    it('updates the value for an existing key', () => {
        const cache = new LRUCache<string>(10);
        cache.set('key', 'old');
        cache.set('key', 'new');
        expect(cache.get('key')).toBe('new');
        expect(cache.size).toBe(1); // No duplicate entry
    });

    it('handles multiple entries', () => {
        const cache = new LRUCache<number>(10);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);
        expect(cache.get('a')).toBe(1);
        expect(cache.get('b')).toBe(2);
        expect(cache.get('c')).toBe(3);
        expect(cache.size).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// LRU Eviction
// ---------------------------------------------------------------------------

describe('LRUCache — LRU eviction', () => {
    it('evicts the least-recently-used entry when at capacity', () => {
        const cache = new LRUCache<number>(3);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        // Cache is full (capacity 3). Adding 'd' should evict 'a' (LRU).
        cache.set('d', 4);

        expect(cache.has('a')).toBe(false); // Evicted
        expect(cache.get('b')).toBe(2);
        expect(cache.get('c')).toBe(3);
        expect(cache.get('d')).toBe(4);
        expect(cache.size).toBe(3);
    });

    it('promotes accessed entries (get) so they survive eviction', () => {
        const cache = new LRUCache<number>(3);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        // Access 'a' — promotes it to most-recently-used
        cache.get('a');

        // Adding 'd' should now evict 'b' (the new LRU), NOT 'a'
        cache.set('d', 4);

        expect(cache.has('a')).toBe(true);  // Survived (was promoted)
        expect(cache.has('b')).toBe(false); // Evicted
        expect(cache.has('c')).toBe(true);
        expect(cache.has('d')).toBe(true);
    });

    it('promotes updated entries (set with existing key)', () => {
        const cache = new LRUCache<number>(3);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        // Update 'a' — promotes it
        cache.set('a', 100);

        // Adding 'd' should evict 'b' (LRU), not 'a'
        cache.set('d', 4);

        expect(cache.get('a')).toBe(100);
        expect(cache.has('b')).toBe(false); // Evicted
    });

    it('calls the eviction callback with evicted key and value', () => {
        const onEvict = vi.fn();
        const cache = new LRUCache<number>(2, onEvict);

        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3); // Evicts 'a'

        expect(onEvict).toHaveBeenCalledOnce();
        expect(onEvict).toHaveBeenCalledWith('a', 1);
    });

    it('evicts multiple entries in order when many are added', () => {
        const evicted: string[] = [];
        const cache = new LRUCache<number>(2, (key: string) => {
            evicted.push(key);
        });

        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3); // Evicts 'a'
        cache.set('d', 4); // Evicts 'b'

        expect(evicted).toEqual(['a', 'b']);
    });

    it('handles capacity of 1 correctly', () => {
        const onEvict = vi.fn();
        const cache = new LRUCache<string>(1, onEvict);

        cache.set('a', 'alpha');
        expect(cache.size).toBe(1);

        cache.set('b', 'beta'); // Evicts 'a'
        expect(cache.size).toBe(1);
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBe('beta');
        expect(onEvict).toHaveBeenCalledWith('a', 'alpha');
    });
});

// ---------------------------------------------------------------------------
// delete()
// ---------------------------------------------------------------------------

describe('LRUCache — delete()', () => {
    it('removes an existing entry and returns true', () => {
        const cache = new LRUCache<number>(10);
        cache.set('a', 1);

        expect(cache.delete('a')).toBe(true);
        expect(cache.has('a')).toBe(false);
        expect(cache.size).toBe(0);
    });

    it('returns false for a non-existent key', () => {
        const cache = new LRUCache<number>(10);
        expect(cache.delete('missing')).toBe(false);
    });

    it('correctly re-links neighbours after deleting a middle node', () => {
        const cache = new LRUCache<number>(10);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        cache.delete('b');

        expect(cache.keys()).toEqual(['c', 'a']); // Most recent first
        expect(cache.size).toBe(2);
    });

    it('correctly handles deleting head', () => {
        const cache = new LRUCache<number>(10);
        cache.set('a', 1);
        cache.set('b', 2);

        cache.delete('b'); // 'b' is head (most recent)

        expect(cache.keys()).toEqual(['a']);
        expect(cache.get('a')).toBe(1);
    });

    it('correctly handles deleting tail', () => {
        const cache = new LRUCache<number>(10);
        cache.set('a', 1);
        cache.set('b', 2);

        cache.delete('a'); // 'a' is tail (least recent)

        expect(cache.keys()).toEqual(['b']);
        expect(cache.get('b')).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// has()
// ---------------------------------------------------------------------------

describe('LRUCache — has()', () => {
    it('returns true for an existing key', () => {
        const cache = new LRUCache<number>(10);
        cache.set('key', 42);
        expect(cache.has('key')).toBe(true);
    });

    it('returns false for a non-existent key', () => {
        const cache = new LRUCache<number>(10);
        expect(cache.has('missing')).toBe(false);
    });

    it('does NOT promote on has() (peek semantics)', () => {
        const cache = new LRUCache<number>(3);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        // has() should NOT promote 'a'
        cache.has('a');

        // Adding 'd' should still evict 'a' (it wasn't promoted)
        cache.set('d', 4);
        expect(cache.has('a')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// clear()
// ---------------------------------------------------------------------------

describe('LRUCache — clear()', () => {
    it('removes all entries', () => {
        const cache = new LRUCache<number>(10);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        cache.clear();

        expect(cache.size).toBe(0);
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBeUndefined();
        expect(cache.get('c')).toBeUndefined();
    });

    it('allows new entries after clear', () => {
        const cache = new LRUCache<number>(10);
        cache.set('a', 1);
        cache.clear();
        cache.set('b', 2);

        expect(cache.size).toBe(1);
        expect(cache.get('b')).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// forEach()
// ---------------------------------------------------------------------------

describe('LRUCache — forEach()', () => {
    it('iterates entries in access order (most recent first)', () => {
        const cache = new LRUCache<number>(10);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        const entries: Array<[string, number]> = [];
        cache.forEach((key, value) => {
            entries.push([key, value]);
        });

        // Most recently set is first
        expect(entries).toEqual([
            ['c', 3],
            ['b', 2],
            ['a', 1],
        ]);
    });

    it('does nothing on an empty cache', () => {
        const cache = new LRUCache<number>(10);
        const callback = vi.fn();
        cache.forEach(callback);
        expect(callback).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// keys()
// ---------------------------------------------------------------------------

describe('LRUCache — keys()', () => {
    it('returns keys in access order (most recent first)', () => {
        const cache = new LRUCache<number>(10);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        expect(cache.keys()).toEqual(['c', 'b', 'a']);
    });

    it('reflects promotion order after get()', () => {
        const cache = new LRUCache<number>(10);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        cache.get('a'); // Promote 'a' to head

        expect(cache.keys()).toEqual(['a', 'c', 'b']);
    });

    it('returns empty array for empty cache', () => {
        const cache = new LRUCache<number>(10);
        expect(cache.keys()).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('LRUCache — edge cases', () => {
    it('handles single entry correctly', () => {
        const cache = new LRUCache<string>(1);
        cache.set('only', 'value');

        expect(cache.get('only')).toBe('value');
        expect(cache.size).toBe(1);

        cache.delete('only');
        expect(cache.size).toBe(0);
        expect(cache.get('only')).toBeUndefined();
    });

    it('handles rapid set/get cycles without corruption', () => {
        const cache = new LRUCache<number>(5);

        // Rapid insertion
        for (let i = 0; i < 100; i++) {
            cache.set(`key-${String(i)}`, i);
        }

        // Only last 5 should remain
        expect(cache.size).toBe(5);
        for (let i = 95; i < 100; i++) {
            expect(cache.get(`key-${String(i)}`)).toBe(i);
        }
    });

    it('handles empty string key', () => {
        const cache = new LRUCache<string>(10);
        cache.set('', 'empty-key');
        expect(cache.get('')).toBe('empty-key');
    });
});
