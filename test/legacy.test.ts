import { expect } from 'chai';
import { RigidDB } from '../src/index.ts';
import { redisClient, redisOpts, expectError } from './helpers.ts';

// Schema and record as rigiddb 0.x stored them
const legacySchema = {
    car: {
        definition: { model: 'string', mileage: 'int' },
        indices: { byModel: { uniq: true, fields: [ 'model' ] } }
    }
};

describe('Database created by rigiddb 0.x', function() {
    beforeEach(async function() {
        await redisClient.flushdb();
    });

    it('Stored schema with the old keys is read', async function() {
        await redisClient.set('foo-42:_schema', JSON.stringify(legacySchema));
        await redisClient.hset('foo-42:car:1', { model: 'sedan', mileage: '100' });
        await redisClient.zadd('foo-42:car:ids', 1, '1');
        await redisClient.set('foo-42:car:nextid', '1');
        await redisClient.hset('foo-42:car:i:model', 'sedan', '1');

        const store = new RigidDB('foo', 42, redisOpts);

        expect(await store.getSchema()).to.deep.equal({
                revision: 42,
                schema: {
                    car: {
                        fields: { model: 'string', mileage: 'int' },
                        indexes: { byModel: { unique: true, fields: [ 'model' ] } }
                    }
                }
            });
        expect(await store.get('car', 1)).to.deep.equal({ model: 'sedan', mileage: 100 });
        expect(await store.find('car', { model: 'sedan' })).to.deep.equal([ 1 ]);
        await expectError(store.create('car', { model: 'sedan', mileage: 1 }), {
            method: 'create',
            err: 'notUnique',
            indexes: [ 'byModel' ]
        });
    });

    it('Stored schema without indexes is read', async function() {
        await redisClient.set('foo-42:_schema', JSON.stringify({ car: { definition: { model: 'string' } } }));

        const store = new RigidDB('foo', 42, redisOpts);

        expect(await store.create('car', { model: 'sedan' })).to.deep.equal(1);
        expect(await store.count('car')).to.deep.equal(1);
    });

    for (const stored of [ 'null', '{ "car": null }' ]) {
        it(`Stored schema ${stored} is invalid`, async function() {
            await redisClient.set('foo-42:_schema', stored);

            const store = new RigidDB('foo', 42, redisOpts);

            await expectError(store.list('car'), {
                method: 'list',
                err: 'invalidStoredSchema'
            });
        });
    }
});
