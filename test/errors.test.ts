import { expect } from 'chai';
import { RigidDB, type Attributes } from '../src/index.ts';
import { redisClient, redisOpts } from './helpers.ts';

let store: RigidDB;

const validCar: Attributes = { model: 'a', mileage: 1, convertible: true };

describe('Errors', function() {
    beforeEach(async function() {
        await redisClient.flushdb();
        store = new RigidDB('foo', 42, redisOpts);
        await store.setSchema({
            car: {
                definition: {
                    model: 'string',
                    mileage: 'int',
                    convertible: 'boolean'
                }
            }
        });
    });

    for (const [field, value] of [
        [ 'model', 5 ],
        [ 'mileage', '1' ],
        [ 'mileage', Number.NaN ],
        [ 'mileage', Infinity ],
        [ 'convertible', 'yes' ]
    ] as const) {
        it(`Wrong type is rejected: ${field} = ${String(value)}`, async function() {
            expect(await store.create('car', { ...validCar, [field]: value })).to.deep.equal({
                method: 'create',
                err: 'wrongType',
                val: false
            });
        });
    }

    for (const schema of [ null, [], 'cars' ]) {
        it(`Non-object schema is rejected: ${JSON.stringify(schema)}`, async function() {
            const fresh = new RigidDB('bar', 42, redisOpts);

            // @ts-expect-error: invalid input on purpose
            expect(await fresh.setSchema(schema)).to.deep.equal({
                method: 'setSchema',
                reason: 'Invalid schema.',
                val: false
            });
        });
    }

    it('Non-object indices definition is rejected', async function() {
        const fresh = new RigidDB('bar', 42, redisOpts);

        // @ts-expect-error: invalid input on purpose
        expect(await fresh.setSchema({ car: { definition: { model: 'string' }, indices: [] } })).to.deep.equal({
            method: 'setSchema',
            reason: 'Invalid indices definition.',
            val: false
        });
    });

    it('Index field that is not a string or an object is rejected', async function() {
        const fresh = new RigidDB('bar', 42, redisOpts);

        // @ts-expect-error: invalid input on purpose
        expect(await fresh.setSchema({ car: { definition: { model: 'string' }, indices: { first: { uniq: true, fields: [ 5 ] } } } }))
            .to.deep.equal({
                method: 'setSchema',
                reason: 'Invalid or missing index fields definition',
                val: false
            });
    });

    it('Redis error rejects the promise and the script is not run again', async function() {
        // Loads the script to the Redis script cache
        await store.create('car', validCar);

        // ZADD to the ids key fails with WRONGTYPE after INCR has already run
        await redisClient.set('foo-42:car:ids', 'not a sorted set');

        let error: unknown;

        try {
            await store.create('car', validCar);
        } catch (err) {
            error = err;
        }

        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.contain('WRONGTYPE');
        expect(await redisClient.get('foo-42:car:nextid')).to.equal('2');
    });

    it('debugPrint before the schema is set prints an empty table', async function() {
        const fresh = new RigidDB('bar', 42, redisOpts);
        const table = console.table;
        let printed: unknown;

        console.table = (data: unknown) => {
            printed = data;
        };

        try {
            await fresh.debugPrint('car');
        } finally {
            console.table = table;
        }

        expect(printed).to.deep.equal([]);
    });
});
