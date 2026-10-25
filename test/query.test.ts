import { expect } from 'chai';
import { RigidDB, defineSchema } from '../src/index.ts';
import { expectError, redisClient, redisOpts } from './helpers.ts';

const schema = defineSchema({
    car: {
        fields: {
            model: 'string',
            mileage: 'int',
            bought: 'date',
            serviced: 'timestamp'
        },
        indexes: {
            byModel: { unique: false, fields: [ 'model' ] },
            byMileage: { unique: false, range: true, fields: [ 'mileage' ] },
            byBought: { unique: false, range: true, fields: [ 'bought' ] },
            byServiced: { unique: false, range: true, fields: [ 'serviced' ] }
        }
    }
});

const day = (n: number) => new Date(Date.UTC(2026, 0, n));
const scores = () => redisClient.zrange('foo-42:car:r:mileage', 0, '-1', 'WITHSCORES');

let store: RigidDB<typeof schema>;

async function createCars(): Promise<void> {
    for (const [model, mileage, n] of [ [ 'a', 100, 1 ], [ 'b', 200, 2 ], [ 'a', 300, 3 ], [ 'c', 400, 4 ] ] as const) {
        await store.create('car', { model, mileage, bought: day(n), serviced: day(n) });
    }
}

describe('Queries', function() {
    beforeEach(async function() {
        await redisClient.flushdb();
        store = new RigidDB<typeof schema>('foo', 42, redisOpts);
        await store.setSchema(schema);
        await createCars();
    });

    describe('Range index', function() {
        it('Is kept in a sorted set by create, update, and delete', async function() {
            expect(await scores()).to.deep.equal([ '1', '100', '2', '200', '3', '300', '4', '400' ]);

            await store.update('car', 1, { mileage: 500 });
            await store.update('car', 2, { model: 'x' });
            await store.update('car', 3, { mileage: null });
            await store.delete('car', 4);

            expect(await scores()).to.deep.equal([ '2', '200', '1', '500' ]);
        });

        it('Finds by range bounds', async function() {
            expect(await store.find('car', { mileage: { gte: 200, lte: 300 } })).to.deep.equal([ 2, 3 ]);
            expect(await store.find('car', { mileage: { gt: 200, lt: 400 } })).to.deep.equal([ 3 ]);
            expect(await store.find('car', { mileage: { gt: 250 } })).to.deep.equal([ 3, 4 ]);
            expect(await store.find('car', { mileage: { lte: 100 } })).to.deep.equal([ 1 ]);
            expect(await store.find('car', { mileage: {} })).to.deep.equal([ 1, 2, 3, 4 ]);
        });

        it('Finds an exact value', async function() {
            expect(await store.find('car', { mileage: 300 })).to.deep.equal([ 3 ]);
        });

        it('Finds by date and timestamp bounds', async function() {
            expect(await store.find('car', { bought: { gt: day(2) } })).to.deep.equal([ 3, 4 ]);
            expect(await store.find('car', { serviced: { lt: day(3) } })).to.deep.equal([ 1, 2 ]);
        });

        it('Sorts by the field value and pages', async function() {
            expect(await store.find('car', { mileage: {} }, { order: 'desc' })).to.deep.equal([ 4, 3, 2, 1 ]);
            expect(await store.find('car', { mileage: {} }, { order: 'desc', offset: 1, limit: 2 })).to.deep.equal([ 3, 2 ]);
            expect(await store.find('car', { mileage: {} }, { limit: 0 })).to.deep.equal([]);
        });

        it("Doesn't contain records with a null value", async function() {
            await store.create('car', { model: 'd', mileage: null, bought: null, serviced: null });

            expect(await store.find('car', { mileage: {} })).to.deep.equal([ 1, 2, 3, 4 ]);
            await expectError(store.find('car', { mileage: null }), { method: 'find', err: 'invalidQuery' });
        });

        it('Rejects invalid bounds', async function() {
            for (const query of [ { gt: 1, gte: 1 }, { lt: 1, lte: 1 }, { from: 1 } ]) {
                await expectError(store.find('car', { mileage: query }), { method: 'find', err: 'invalidQuery' });
            }

            for (const query of [ { gt: '1' }, { lt: '1' }, '1', { gte: Number.NaN } ]) {
                // @ts-expect-error: invalid input on purpose
                await expectError(store.find('car', { mileage: query }), { method: 'find', err: 'wrongType' });
            }

            // @ts-expect-error: invalid input on purpose
            await expectError(store.find('car', { bought: { lt: 5 } }), { method: 'find', err: 'wrongType' });
        });

        it('Range on a field without a range index is an unknown index', async function() {
            // @ts-expect-error: byModel isn't a range index
            await expectError(store.find('car', { model: { gt: 'a' } }), { method: 'find', err: 'unknownIndex' });
        });
    });

    describe('Exact index', function() {
        it('Sorts by id and pages', async function() {
            expect(await store.find('car', { model: 'a' })).to.deep.equal([ 1, 3 ]);
            expect(await store.find('car', { model: 'a' }, { order: 'desc' })).to.deep.equal([ 3, 1 ]);
            expect(await store.find('car', { model: 'a' }, { offset: 1 })).to.deep.equal([ 3 ]);
            expect(await store.find('car', { model: 'a' }, { limit: 1 })).to.deep.equal([ 1 ]);
        });
    });

    for (const options of [ { offset: -1 }, { limit: 1.5 }, { order: 'up' } ]) {
        it(`Invalid options are rejected: ${JSON.stringify(options)}`, async function() {
            // @ts-expect-error: invalid input on purpose
            await expectError(store.find('car', { model: 'a' }, options), { method: 'find', err: 'invalidQuery' });
            // @ts-expect-error: invalid input on purpose
            await expectError(store.find('car', { mileage: {} }, options), { method: 'find', err: 'invalidQuery' });
            // @ts-expect-error: invalid input on purpose
            await expectError(store.list('car', options), { method: 'list', err: 'invalidQuery' });
        });
    }

    it('list() sorts by id and pages', async function() {
        expect(await store.list('car')).to.deep.equal([ 1, 2, 3, 4 ]);
        expect(await store.list('car', { order: 'desc', limit: 2 })).to.deep.equal([ 4, 3 ]);
        expect(await store.list('car', { offset: 3 })).to.deep.equal([ 4 ]);
    });

    it('findRecords() resolves to the records', async function() {
        expect(await store.findRecords('car', { model: 'a' }, { limit: 1 })).to.deep.equal([
            { id: 1, record: { model: 'a', mileage: 100, bought: day(1), serviced: day(1) } }
        ]);
        expect(await store.findRecords('car', { mileage: { gt: 300 } })).to.deep.equal([
            { id: 4, record: { model: 'c', mileage: 400, bought: day(4), serviced: day(4) } }
        ]);
        await expectError(store.findRecords('car', { model: 5 as unknown as string }), { method: 'findRecords', err: 'wrongType' });
    });

    it('getMany() resolves to the records, null for missing ids', async function() {
        expect(await store.getMany('car', [ 2, 42, '1' ])).to.deep.equal([
            { model: 'b', mileage: 200, bought: day(2), serviced: day(2) },
            null,
            { model: 'a', mileage: 100, bought: day(1), serviced: day(1) }
        ]);
        expect(await store.getMany('car', [])).to.deep.equal([]);
    });

    for (const [index, reason] of [
        [ { unique: true, range: true, fields: [ 'mileage' ] }, "A range index must have one int, date, or timestamp field and can't be unique: 'r'" ],
        [ { unique: false, range: true, fields: [ 'mileage', 'bought' ] }, "A range index must have one int, date, or timestamp field and can't be unique: 'r'" ],
        [ { unique: false, range: true, fields: [ 'model' ] }, "A range index must have one int, date, or timestamp field and can't be unique: 'r'" ],
        [ { unique: false, range: 'yes', fields: [ 'mileage' ] }, 'Invalid index range definition' ]
    ] as const) {
        it(`Invalid range index is rejected: ${JSON.stringify(index)}`, async function() {
            const fresh = new RigidDB('bar', 42, redisOpts);

            // @ts-expect-error: invalid input on purpose
            await expectError(fresh.setSchema({ car: { fields: schema.car.fields, indexes: { r: index } } }), {
                method: 'setSchema',
                err: 'invalidSchema',
                reason
            });
        });
    }
});
