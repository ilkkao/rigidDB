import { expect } from 'chai';
import { RigidDB, defineSchema } from '../src/index.ts';
import { errorDetails, expectError, redisClient, redisOpts } from './helpers.ts';

const schema = defineSchema({
    car: {
        fields: { model: 'string', color: 'string', mileage: 'int' },
        indexes: {
            byModel: { unique: true, fields: [ 'model' ] },
            byColor: { unique: false, fields: [ 'color' ] },
            byMileage: { unique: false, range: true, fields: [ 'mileage' ] }
        }
    }
});

let store: RigidDB<typeof schema>;

// All keys of the database and their contents
async function snapshot(): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};

    for (const key of (await redisClient.keys('*')).toSorted()) {
        const type = await redisClient.type(key);

        result[key] = type === 'hash' ? await redisClient.hgetall(key) :
            type === 'set' ? (await redisClient.smembers(key)).toSorted() :
                type === 'zset' ? await redisClient.zrange(key, 0, '-1', 'WITHSCORES') :
                    await redisClient.get(key);
    }

    return result;
}

describe('Transaction rollback', function() {
    beforeEach(async function() {
        await redisClient.flushdb();
        store = new RigidDB<typeof schema>('foo', 42, redisOpts);
        await store.setSchema(schema);
        await store.create('car', { model: 'a', color: 'red', mileage: 100 });
        await store.create('car', { model: 'b', color: 'red', mileage: 200 });
        await store.create('car', { model: 'c', color: 'blue', mileage: 300 });
    });

    it('A failing create rolls back the creates before it', async function() {
        const before = await snapshot();

        await expectError(store.transaction(tr => {
            tr.create('car', { model: 'd', color: 'red', mileage: 400 });
            tr.create('car', { model: 'a', color: 'green', mileage: 500 });
        }), { method: 'create', err: 'notUnique', indexes: [ 'byModel' ] });

        expect(await snapshot()).to.deep.equal(before);
    });

    it('A failing operation rolls back updates and deletes', async function() {
        const before = await snapshot();

        await expectError(store.transaction(tr => {
            tr.update('car', 1, { model: 'x', color: 'blue', mileage: null });
            tr.delete('car', 2);
            tr.delete('car', 3);
            tr.create('car', { model: 'y', color: 'blue', mileage: 1 });
            tr.update('car', 42, { color: 'green' });
        }), { method: 'update', err: 'notFound' });

        expect(await snapshot()).to.deep.equal(before);
    });

    it('get() and exists() of a missing record roll back', async function() {
        const before = await snapshot();

        await expectError(store.transaction(tr => {
            tr.delete('car', 1);
            tr.get('car', 42);
        }), { method: 'get', err: 'notFound' });
        await expectError(store.transaction(tr => {
            tr.update('car', 2, { color: 'green' });
            tr.exists('car', 42);
        }), { method: 'exists', err: 'notFound' });

        expect(await snapshot()).to.deep.equal(before);
    });

    it('An error from Redis rolls back', async function() {
        // The second green car would move the color index entry to this key, which isn't a set
        await store.create('car', { model: 'g', color: 'green', mileage: 1 });
        await redisClient.set('foo-42:car:i:color:green', 'not a set');

        const before = await snapshot();
        const error = await store.transaction(tr => {
            tr.update('car', 1, { model: 'x' });
            tr.create('car', { model: 'h', color: 'green', mileage: 2 });
        }).then(() => null, (err: unknown) => err as Error);

        expect(error?.message).to.contain('WRONGTYPE');
        expect(await snapshot()).to.deep.equal(before);
    });
});

describe('Transaction record references', function() {
    beforeEach(async function() {
        await redisClient.flushdb();
        store = new RigidDB<typeof schema>('foo', 42, redisOpts);
        await store.setSchema(schema);
    });

    it('A created record can be used by later operations', async function() {
        const results = await store.transaction(tr => {
            const first = tr.create('car', { model: 'a', color: 'red', mileage: 1 });
            const second = tr.create('car', { model: 'b', color: 'red', mileage: 2 });

            tr.update('car', first, { color: 'blue' });
            tr.exists('car', second);
            tr.get('car', first);
            tr.delete('car', second);
        });

        expect(results).to.deep.equal([ 1, 2, 1, true, { model: 'a', color: 'blue', mileage: 1 }, undefined ]);
        expect(await store.list('car')).to.deep.equal([ 1 ]);
    });

    it("A reference can't be used in another transaction", async function() {
        let ref: unknown;

        await store.transaction(tr => {
            ref = tr.create('car', { model: 'a', color: 'red', mileage: 1 });
        });

        const error = await store.transaction(tr => {
            tr.delete('car', ref as never);
        }).then(() => null, (err: unknown) => err as Error);

        expect(error?.message).to.equal('A RecordRef can only be used in the transaction that created it.');
        expect(() => errorDetails(error)).to.throw('A RecordRef');
    });
});
