import { expect } from 'chai';
import { RigidDB, RigidDBError, type FieldValues } from '../src/index.ts';
import { redisClient, redisOpts, expectError, shouldNotResolve } from './helpers.ts';

let store: RigidDB;

const validCar: FieldValues = { model: 'a', mileage: 1, convertible: true };

describe('Errors', function() {
    beforeEach(async function() {
        await redisClient.flushdb();
        store = new RigidDB('foo', 42, redisOpts);
        await store.setSchema({
            car: {
                fields: {
                    model: 'string',
                    mileage: 'int',
                    convertible: 'boolean'
                }
            }
        });
    });

    it('Failures are thrown as RigidDBError', async function() {
        const error = await store.get('car', 42).then(shouldNotResolve, (err: unknown) => err);

        expect(error).to.be.instanceOf(RigidDBError);
        expect(error).to.be.instanceOf(Error);
        expect(error).to.include({ name: 'RigidDBError', code: 'notFound', method: 'get', message: 'get() failed: notFound' });
    });

    it('notUnique error lists the violated indexes', async function() {
        const fresh = new RigidDB('bar', 42, redisOpts);

        await fresh.setSchema({ car: { fields: { model: 'string' }, indexes: { byModel: { unique: true, fields: [ 'model' ] } } } });
        await fresh.create('car', { model: 'a' });

        const error = await fresh.create('car', { model: 'a' }).then(shouldNotResolve, (err: unknown) => err);

        expect(error).to.include({ code: 'notUnique', message: 'create() failed: notUnique (byModel)' });
        expect((error as RigidDBError).indexes).to.deep.equal([ 'byModel' ]);
    });

    it('invalidSchema error has the reason', async function() {
        const error = await new RigidDB('bar', 42, redisOpts).setSchema({}).then(shouldNotResolve, (err: unknown) => err);

        expect(error).to.include({
            code: 'invalidSchema',
            reason: 'At least one collection must be defined.',
            message: 'setSchema() failed: invalidSchema (At least one collection must be defined.)'
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
            await expectError(store.create('car', { ...validCar, [field]: value }), {
                method: 'create',
                err: 'wrongType'
            });
        });
    }

    for (const schema of [ null, [], 'cars' ]) {
        it(`Non-object schema is rejected: ${JSON.stringify(schema)}`, async function() {
            const fresh = new RigidDB('bar', 42, redisOpts);

            // @ts-expect-error: invalid input on purpose
            await expectError(fresh.setSchema(schema), {
                method: 'setSchema',
                err: 'invalidSchema',
                reason: 'Invalid schema.'
            });
        });
    }

    it('Non-object indexes definition is rejected', async function() {
        const fresh = new RigidDB('bar', 42, redisOpts);

        // @ts-expect-error: invalid input on purpose
        await expectError(fresh.setSchema({ car: { fields: { model: 'string' }, indexes: [] } }), {
            method: 'setSchema',
            err: 'invalidSchema',
            reason: 'Invalid indexes definition.'
        });
    });

    it('Index field that is not a string or an object is rejected', async function() {
        const fresh = new RigidDB('bar', 42, redisOpts);

        // @ts-expect-error: invalid input on purpose
        await expectError(fresh.setSchema({ car: { fields: { model: 'string' }, indexes: { first: { unique: true, fields: [ 5 ] } } } }), {
            method: 'setSchema',
            err: 'invalidSchema',
            reason: 'Invalid or missing index fields definition'
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
