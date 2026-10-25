import { expect } from 'chai';
import { RigidDB, type CollectionDefinition } from '../src/index.ts';
import { redisClient, redisOpts, unwrap } from './helpers.ts';

let store: RigidDB;

const fresh = () => new RigidDB('bar', 42, redisOpts);

const makeSchema = (): { car: CollectionDefinition } => ({
    car: {
        fields: {
            model: 'string',
            mileage: 'int',
            purchaseDate: 'date'
        },
        indexes: {
            date: {
                unique: false,
                fields: [ 'purchaseDate' ]
            }
        }
    }
});

describe('Regressions', function() {
    beforeEach(async function() {
        await redisClient.flushdb();
        store = new RigidDB('foo', 42, redisOpts);
        await store.setSchema(makeSchema());
    });

    it('Float values survive a round trip', async function() {
        const id = unwrap(await store.create('car', { model: 'a', mileage: 1.5, purchaseDate: null }));

        expect(await store.get('car', id)).to.deep.equal({
            val: { model: 'a', mileage: 1.5, purchaseDate: null }
        });
    });

    it('Dates keep their milliseconds and can be found regardless of the time zone', async function() {
        const purchaseDate = new Date('2015-11-01T16:41:24.123Z');
        const id = unwrap(await store.create('car', { model: 'a', mileage: 1, purchaseDate }));

        expect(await store.get('car', id)).to.deep.equal({
            val: { model: 'a', mileage: 1, purchaseDate }
        });
        expect(await redisClient.hget(`foo-42:car:${id}`, 'purchaseDate')).to.equal('2015-11-01T16:41:24.123Z');
        expect(await store.find('car', { purchaseDate: new Date(purchaseDate.getTime()) })).to.deep.equal({
            val: [ id ]
        });
    });

    it('Dates stored by older versions can be read', async function() {
        const purchaseDate = new Date('2015-11-01T16:41:24.000Z');
        const id = unwrap(await store.create('car', { model: 'a', mileage: 1, purchaseDate }));

        await redisClient.hset(`foo-42:car:${id}`, 'purchaseDate', purchaseDate.toString());

        expect(await store.get('car', id)).to.deep.equal({
            val: { model: 'a', mileage: 1, purchaseDate }
        });
    });

    it('Invalid Date is rejected', async function() {
        expect(await store.create('car', { model: 'a', mileage: 1, purchaseDate: new Date('not a date') })).to.deep.equal({
            method: 'create',
            err: 'wrongType',
            val: false
        });
    });

    it('Long transaction does not run out of Lua local variables', async function() {
        const result = await store.transaction(function(tr) {
            for (let i = 0; i < 100; i++) {
                tr.create('car', { model: `m${i}`, mileage: i, purchaseDate: null });
            }
        });

        expect(result).to.deep.equal({ val: 100 });
        expect(await store.count('car')).to.deep.equal({ val: 100 });
    });

    it('Object.prototype properties are not collections', async function() {
        expect(await store.get('constructor', 1)).to.deep.equal({
            method: 'get',
            err: 'unknownCollection',
            val: false
        });
    });

    it('Changing the original schema object after setSchema has no effect', async function() {
        const srcSchema = makeSchema();

        store = new RigidDB('bar', 42, redisOpts);
        await store.setSchema(srcSchema);
        srcSchema.car.fields['model'] = 'int';

        const result = unwrap(await store.getSchema());
        expect(result.schema['car']?.fields['model']).to.equal('string');
    });

    it('Invalid collection and index names are rejected', async function() {
        expect(await fresh().setSchema({ "car'": { fields: { model: 'string' } } })).to.deep.equal({
            method: 'setSchema',
            reason: 'Invalid collection name (letters, numbers, and dashes allowed): \'car\'\'',
            val: false
        });

        expect(await fresh().setSchema({
            car: { fields: { model: 'string' }, indexes: { 'a:b': { unique: true, fields: [ 'model' ] } } }
        })).to.deep.equal({
            method: 'setSchema',
            reason: 'Invalid index name (letters, numbers, and dashes allowed): \'a:b\'',
            val: false
        });

        // @ts-expect-error: invalid input on purpose
        expect(await fresh().setSchema({ car: null })).to.deep.equal({
            method: 'setSchema',
            reason: 'Fields missing.',
            val: false
        });
    });

    it('debugPrint of an unknown collection prints an empty table', async function() {
        const table = console.table;
        let printed: unknown;

        console.table = (data: unknown) => {
            printed = data;
        };

        try {
            await store.debugPrint('bikes');
        } finally {
            console.table = table;
        }

        expect(printed).to.deep.equal([]);
    });

    it('Unreachable Redis rejects API calls instead of crashing the process', async function() {
        const offline = new RigidDB('foo', 42, { port: 1, retryStrategy: () => null }, () => {});

        let error: unknown;

        try {
            await offline.getSchema();
        } catch (err) {
            error = err;
        }

        expect(error).to.be.instanceOf(Error);
        offline.client.disconnect();
    });

    it('Unreachable Redis does not cause an unhandled rejection when the API is not used', async function() {
        const rejections: unknown[] = [];
        const listener = (reason: unknown) => rejections.push(reason);
        const listeners = process.listeners('unhandledRejection');

        process.removeAllListeners('unhandledRejection');
        process.on('unhandledRejection', listener);

        try {
            const offline = new RigidDB('foo', 42, { port: 1, retryStrategy: () => null }, () => {});

            await new Promise(resolve => offline.client.once('end', resolve));
            await new Promise(resolve => setTimeout(resolve, 10));
        } finally {
            process.off('unhandledRejection', listener);

            for (const previous of listeners) {
                process.on('unhandledRejection', previous);
            }
        }

        expect(rejections).to.deep.equal([]);
    });
});
