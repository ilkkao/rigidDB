import { expect } from 'chai';
import { RigidDB, type Schema } from '../src/index.ts';
import { expectError, redisClient, redisOpts } from './helpers.ts';

const v1 = {
    car: {
        fields: { model: 'string', color: 'string', mileage: 'int', bought: 'date' },
        indexes: {
            byColor: { unique: false, fields: [ 'color' ] }
        }
    },
    owner: {
        fields: { name: 'string' },
        indexes: { byName: { unique: false, fields: [ 'name' ] } }
    }
} satisfies Schema;

const day = (n: number) => new Date(Date.UTC(2026, 0, n, 12, 30, 15, 250));

let store: RigidDB;

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

function withCar(car: Schema[string]): Schema {
    return { ...v1, car };
}

describe('alterSchema', function() {
    beforeEach(async function() {
        await redisClient.flushdb();
        store = new RigidDB('foo', 42, redisOpts);
        await store.setSchema(v1);
        await store.create('car', { model: 'a', color: 'red', mileage: 100, bought: day(1) });
        await store.create('car', { model: 'b', color: 'red', mileage: null, bought: day(2) });
        await store.create('car', { model: 'c', color: 'blue', mileage: 300, bought: null });
        await store.create('owner', { name: 'Ann' });
    });

    it('Adds fields with null or a default value', async function() {
        await store.alterSchema(withCar({
            fields: { ...v1.car.fields, seats: 'int', fuel: { type: 'string', allowNull: false } },
            indexes: { ...v1.car.indexes, byFuel: { unique: false, fields: [ 'fuel' ] } }
        }), { defaults: { car: { fuel: 'petrol' } } });

        expect(await store.get('car', 1)).to.deep.equal({ model: 'a', color: 'red', mileage: 100, bought: day(1), seats: null, fuel: 'petrol' });
        expect(await store.find('car', { fuel: 'petrol' })).to.deep.equal([ 1, 2, 3 ]);
        expect(await store.create('car', { model: 'd', color: 'red', mileage: 1, bought: null, seats: 4, fuel: 'diesel' })).to.equal(4);
    });

    it('Removes fields and the indexes on them', async function() {
        await store.alterSchema(withCar({ fields: { model: 'string', mileage: 'int', bought: 'date' } }));

        expect(await store.get('car', 1)).to.deep.equal({ model: 'a', mileage: 100, bought: day(1) });
        expect(await redisClient.keys('foo-42:car:i:*')).to.deep.equal([]);
        await expectError(store.find('car', { color: 'red' }), { method: 'find', err: 'unknownIndex' });
    });

    it('Adds and changes indexes', async function() {
        await store.alterSchema(withCar({
            fields: v1.car.fields,
            indexes: {
                byColor: { unique: false, fields: [ { name: 'color', caseInsensitive: true } ] },
                byModel: { unique: true, fields: [ 'model' ] }
            }
        }));

        expect(await store.find('car', { color: 'RED' })).to.deep.equal([ 1, 2 ]);
        expect(await store.find('car', { model: 'c' })).to.deep.equal([ 3 ]);
        await expectError(store.create('car', { model: 'c', color: 'x', mileage: 1, bought: null }), {
            method: 'create',
            err: 'notUnique',
            indexes: [ 'byModel' ]
        });
    });

    it('Builds range indexes with the same scores as new records get', async function() {
        await store.alterSchema(withCar({
            fields: v1.car.fields,
            indexes: {
                ...v1.car.indexes,
                byMileage: { unique: false, range: true, fields: [ 'mileage' ] },
                byBought: { unique: false, range: true, fields: [ 'bought' ] }
            }
        }));

        expect(await redisClient.zrange('foo-42:car:r:mileage', 0, '-1', 'WITHSCORES')).to.deep.equal([ '1', '100', '3', '300' ]);
        expect(await redisClient.zrange('foo-42:car:r:bought', 0, '-1', 'WITHSCORES'))
            .to.deep.equal([ '1', String(day(1).getTime()), '2', String(day(2).getTime()) ]);
        expect(await store.find('car', { bought: { gt: day(1) } })).to.deep.equal([ 2 ]);
    });

    it('A duplicate value for a new unique index fails and changes nothing', async function() {
        const before = await snapshot();

        await expectError(store.alterSchema(withCar({
            fields: v1.car.fields,
            indexes: { byColor: { unique: true, fields: [ 'color' ] } }
        })), { method: 'alterSchema', err: 'notUnique', indexes: [ 'byColor' ] });

        expect(await snapshot()).to.deep.equal(before);
        expect((await store.getSchema()).schema).to.deep.equal(v1);
    });

    it('Disallowing null replaces nulls with the default, or fails without one', async function() {
        const v2 = withCar({ fields: { ...v1.car.fields, mileage: { type: 'int', allowNull: false } }, indexes: v1.car.indexes });
        const before = await snapshot();

        await expectError(store.alterSchema(v2), { method: 'alterSchema', err: 'nullNotAllowed' });
        expect(await snapshot()).to.deep.equal(before);

        await store.alterSchema(v2, { defaults: { car: { mileage: 0 } } });
        expect((await store.get('car', 2))['mileage']).to.equal(0);
        expect((await store.get('car', 3))['mileage']).to.equal(300);
    });

    it('Adds and removes collections', async function() {
        await store.alterSchema({ car: v1.car, bike: { fields: { brand: 'string' } } });

        expect(await redisClient.keys('foo-42:owner*')).to.deep.equal([]);
        await expectError(store.get('owner', 1), { method: 'get', err: 'unknownCollection' });
        expect(await store.create('bike', { brand: 'x' })).to.equal(1);
        expect(await store.count('car')).to.equal(3);
    });

    it('Stores the schema when nothing needs migrating', async function() {
        const v2 = { ...v1, owner: { ...v1.owner, fields: { name: { type: 'string' as const, allowNull: true } } } };

        await store.alterSchema(v2);

        expect((await store.getSchema()).schema).to.deep.equal(v2);
        expect(await redisClient.get('foo-42:_schema_version')).to.equal('1');
    });

    it('Rejects changes it can\'t migrate', async function() {
        await expectError(store.alterSchema(withCar({ fields: { ...v1.car.fields, mileage: 'string' }, indexes: v1.car.indexes })), {
            method: 'alterSchema',
            err: 'invalidSchema',
            reason: "Changing the type of field 'mileage' in 'car' is not supported."
        });

        await expectError(store.alterSchema(withCar({ fields: { ...v1.car.fields, seats: { type: 'int', allowNull: false } } })), {
            method: 'alterSchema',
            err: 'invalidSchema',
            reason: "Field 'seats' added to 'car' needs a default value."
        });

        await expectError(store.alterSchema(withCar({ fields: { ...v1.car.fields, seats: 'int' } }), { defaults: { car: { seats: 'four' } } }), {
            method: 'alterSchema',
            err: 'wrongType'
        });

        await expectError(store.alterSchema({}), {
            method: 'alterSchema',
            err: 'invalidSchema',
            reason: 'At least one collection must be defined.'
        });
    });

    it('Dates in the format of rigiddb 0.11 fail a new range index', async function() {
        await redisClient.hset('foo-42:car:1', 'bought', day(1).toString());

        await expectError(store.alterSchema(withCar({
            fields: v1.car.fields,
            indexes: { byBought: { unique: false, range: true, fields: [ 'bought' ] } }
        })), { method: 'alterSchema', err: 'wrongType' });
    });

    it('Requires a schema', async function() {
        await expectError(new RigidDB('bar', 42, redisOpts).alterSchema(v1), { method: 'alterSchema', err: 'schemaMissing' });
    });

    it('Another instance picks up the new schema', async function() {
        const other = new RigidDB('foo', 42, redisOpts);

        expect(await other.get('car', 1)).to.deep.equal({ model: 'a', color: 'red', mileage: 100, bought: day(1) });

        await store.alterSchema(withCar({ fields: { ...v1.car.fields, seats: 'int' }, indexes: v1.car.indexes }));

        // The first call fails with schemaChanged, reloads the schema, and runs again
        expect(await other.get('car', 1)).to.deep.equal({ model: 'a', color: 'red', mileage: 100, bought: day(1), seats: null });
        expect(await other.transaction(tr => {
            tr.create('car', { model: 'd', color: 'red', mileage: 1, bought: null, seats: 2 });
        })).to.deep.equal([ 4 ]);
    });
});
