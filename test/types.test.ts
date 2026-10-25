import { expect } from 'chai';
import { RigidDB, defineSchema } from '../src/index.ts';
import { expectError, redisClient, redisOpts } from './helpers.ts';

const schema = defineSchema({
    car: {
        fields: {
            model: { type: 'string', allowNull: false },
            mileage: 'int',
            convertible: 'boolean',
            bought: 'date'
        },
        indexes: {
            byModel: { unique: true, fields: [ 'model' ] },
            byDetails: { unique: false, fields: [ { name: 'mileage' }, 'convertible' ] }
        }
    },
    owner: {
        fields: { name: 'string' }
    }
});

let store: RigidDB<typeof schema>;

// These tests also check types: tsc fails if a @ts-expect-error line has no type error.
describe('Typed schema', function() {
    beforeEach(async function() {
        await redisClient.flushdb();
        store = new RigidDB<typeof schema>('foo', 42, redisOpts);
        await store.setSchema(schema);
    });

    it('Values are typed by the schema', async function() {
        const id = await store.create('car', { model: 'sedan', mileage: 10, convertible: true, bought: null });
        const car = await store.get('car', id);

        const model: string = car.model;
        const mileage: number | null = car.mileage;
        const bought: Date | null = car.bought;

        expect({ model, mileage, bought }).to.deep.equal({ model: 'sedan', mileage: 10, bought: null });
        expect(await store.update('car', id, { mileage: 20 })).to.equal(1);
        expect((await store.getSchema()).schema).to.deep.equal(schema);
    });

    it('find() takes the fields of one index', async function() {
        const id = await store.create('car', { model: 'sedan', mileage: 10, convertible: true, bought: null });

        expect(await store.find('car', { model: 'sedan' })).to.deep.equal([ id ]);
        expect(await store.find('car', { mileage: 10, convertible: true })).to.deep.equal([ id ]);

        // @ts-expect-error: no index has both model and mileage
        await expectError(store.find('car', { model: 'sedan', mileage: 10 }), { method: 'find', err: 'unknownIndex' });
    });

    it('Invalid calls are type errors', async function() {
        // @ts-expect-error: unknown collection
        await expectError(store.count('bike'), { method: 'count', err: 'unknownCollection' });

        // @ts-expect-error: model is a string
        await expectError(store.create('car', { model: 5, mileage: 1, convertible: true, bought: null }), { method: 'create', err: 'wrongType' });

        // @ts-expect-error: model doesn't allow null
        await expectError(store.update('car', 1, { model: null }), { method: 'update', err: 'nullNotAllowed' });

        // @ts-expect-error: bought is missing
        await expectError(store.create('car', { model: 'sedan', mileage: 1, convertible: true }), { method: 'create', err: 'missingFields' });
    });

    it('Transaction operations are typed', async function() {
        await store.transaction(tr => {
            tr.create('owner', { name: 'Ann' });
            // @ts-expect-error: owner has no field age
            tr.update('owner', 1, { age: 3 });
        });

        expect(await store.get('owner', 1)).to.deep.equal({ name: 'Ann' });
    });
});
