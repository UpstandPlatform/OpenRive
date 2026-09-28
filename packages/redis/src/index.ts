import { randomUUID } from 'node:crypto';
import { createClient, type RedisClientType } from 'redis';

const GET_AND_DELETE = `
local value = redis.call('GET', KEYS[1])
if value then redis.call('DEL', KEYS[1]) end
return value
`;

const INCREMENT_WITH_TTL = `
local value = redis.call('INCR', KEYS[1])
if value == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return value
`;

const RELEASE_LOCK = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

type RedisClient = RedisClientType;

export interface RedisLockHandle {
  /** The namespaced Redis key held by this lock. */
  readonly key: string;
  /** Releases the lock only when this handle still owns it. */
  release(): Promise<boolean>;
}

/**
 * The small Better Auth-compatible storage surface plus atomic primitives for
 * distributed rate limiting. Keeping it here avoids coupling the shared Redis
 * connection to the authentication package and leaves room for queues/locks.
 */
export interface RedisInfrastructure {
  get(key: string): Promise<string | null>;
  getAndDelete(key: string): Promise<string | null>;
  increment(key: string, ttlSeconds: number): Promise<number>;
  consume(key: string, rule: { window: number; max: number }): Promise<{ allowed: boolean; retryAfter: number | null }>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  ping(): Promise<void>;
  acquireLock(key: string, ttlMs: number): Promise<RedisLockHandle | null>;
  close(): Promise<void>;
}

export interface RedisInfrastructureOptions {
  url: string;
  /** A stable namespace prevents collisions with other OpenRive Redis users. */
  namespace?: string;
  /** Defaults to 10 seconds, which is enough to identify a stalled startup. */
  connectTimeoutMs?: number;
}

class RedisInfrastructureImpl implements RedisInfrastructure {
  private readonly prefix: string;
  private closed = false;

  constructor(
    private readonly client: RedisClient,
    namespace: string,
  ) {
    this.prefix = `openrive:${namespace}:`;
  }

  private key(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(this.key(key));
  }

  async getAndDelete(key: string): Promise<string | null> {
    const value = await this.client.eval(GET_AND_DELETE, {
      keys: [this.key(key)],
      arguments: [],
    });
    return typeof value === 'string' ? value : null;
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new RangeError('Redis counter TTL must be a positive integer');
    }
    const value = await this.client.eval(INCREMENT_WITH_TTL, {
      keys: [this.key(key)],
      arguments: [String(ttlSeconds)],
    });
    const count = Number(value);
    if (!Number.isSafeInteger(count)) throw new Error('Redis returned an invalid counter value');
    return count;
  }

  async consume(key: string, rule: { window: number; max: number }): Promise<{ allowed: boolean; retryAfter: number | null }> {
    const count = await this.increment(`rate-limit:${key}`, rule.window);
    const allowed = count <= rule.max;
    return { allowed, retryAfter: allowed ? null : rule.window };
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined) {
      if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
        throw new RangeError('Redis value TTL must be a positive integer');
      }
      await this.client.set(this.key(key), value, { EX: ttlSeconds });
      return;
    }
    await this.client.set(this.key(key), value);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.key(key));
  }

  async ping(): Promise<void> {
    await this.client.ping();
  }

  async acquireLock(key: string, ttlMs: number): Promise<RedisLockHandle | null> {
    if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
      throw new RangeError('Redis lock TTL must be a positive integer');
    }
    const redisKey = this.key(`lock:${key}`);
    const token = randomUUID();
    const acquired = await this.client.set(redisKey, token, { NX: true, PX: ttlMs });
    if (acquired !== 'OK') return null;

    let released = false;
    return {
      key: redisKey,
      release: async () => {
        if (released) return false;
        released = true;
        const result = await this.client.eval(RELEASE_LOCK, {
          keys: [redisKey],
          arguments: [token],
        });
        return Number(result) === 1;
      },
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.client.isOpen) await this.client.quit();
  }
}

/**
 * Connects once and fails startup when Redis is configured but unavailable.
 * Silently falling back to local memory would make rate limits incorrect across
 * replicas, so callers should only omit this integration when Redis is unused.
 */
export async function createRedisInfrastructure(options: RedisInfrastructureOptions): Promise<RedisInfrastructure> {
  const namespace = options.namespace?.trim() || 'default';
  const connectTimeoutMs = options.connectTimeoutMs ?? 10_000;
  if (!Number.isInteger(connectTimeoutMs) || connectTimeoutMs <= 0) {
    throw new RangeError('Redis connection timeout must be a positive integer');
  }
  const client = createClient({
    url: options.url,
    socket: { connectTimeout: connectTimeoutMs },
  });
  client.on('error', (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[redis] connection error', message);
  });
  await client.connect();
  return new RedisInfrastructureImpl(client, namespace);
}
