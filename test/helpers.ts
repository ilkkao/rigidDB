import { Redis } from 'ioredis';
import type { RedisConnectionOptions, Result } from '../src/index.ts';

// Tests flush this database, don't point them to a Redis that holds data you care about.
export const redisOpts = {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: Number(process.env['REDIS_PORT'] ?? 6379),
    db: 15
} satisfies RedisConnectionOptions;

export const redisClient = new Redis(redisOpts);

export function unwrap<T>(result: Result<T>): T {
    if ('err' in result) {
        throw new Error(`${result.method} failed: ${result.err}`);
    }

    return result.val;
}
