import { expect } from 'chai';
import { Redis } from 'ioredis';
import { RigidDBError, type RedisConnectionOptions } from '../src/index.ts';

// Tests flush this database, don't point them to a Redis that holds data you care about.
export const redisOpts = {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: Number(process.env['REDIS_PORT'] ?? 6379),
    db: 15
} satisfies RedisConnectionOptions;

export const redisClient = new Redis(redisOpts);

// The properties of a RigidDBError that tests compare
export function errorDetails(error: unknown): Record<string, unknown> {
    if (!(error instanceof RigidDBError)) {
        throw error;
    }

    return {
        method: error.method,
        err: error.code,
        ...(error.indexes && { indexes: error.indexes }),
        ...(error.reason && { reason: error.reason })
    };
}

// Fulfillment handler for promise chains that expect a RigidDBError
export function shouldNotResolve(value: unknown): never {
    throw new Error(`Expected a RigidDBError, got ${JSON.stringify(value)}`);
}

export async function expectError(promise: Promise<unknown>, expected: Record<string, unknown>): Promise<void> {
    expect(errorDetails(await promise.then(shouldNotResolve, (error: unknown) => error))).to.deep.equal(expected);
}
