import { expect } from 'chai';
import { Redis } from 'ioredis';
import { RigidDB } from '../src/index.ts';
import { redisClient, redisOpts } from './helpers.ts';

const url = `redis://${redisOpts.host}:${redisOpts.port}/${redisOpts.db}`;

async function useStore(store: RigidDB): Promise<void> {
    await store.setSchema({ car: { fields: { model: 'string' } } });
    expect(await store.get('car', await store.create('car', { model: 'sedan' }))).to.deep.equal({ model: 'sedan' });
}

describe('Connection', function() {
    beforeEach(async function() {
        await redisClient.flushdb();
    });

    it('quit() closes the connection it opened', async function() {
        const store = new RigidDB('foo', 42, redisOpts);
        const ended = new Promise(resolve => store.client.once('end', resolve));

        await store.quit();
        await ended;
        expect(store.client.status).to.equal('end');
    });

    it('Connects with a redis:// URL', async function() {
        const store = new RigidDB('foo', 42, url);

        await useStore(store);
        await store.quit();
    });

    it('Passes all ioredis options through', async function() {
        const store = new RigidDB('foo', 42, { ...redisOpts, connectionName: 'rigiddb-test' });

        expect(await store.client.client('GETNAME')).to.equal('rigiddb-test');
        await store.quit();
    });

    it('Uses an existing client and leaves it open on quit()', async function() {
        const client = new Redis(redisOpts);
        const store = new RigidDB('foo', 42, client);

        expect(store.client).to.equal(client);
        await useStore(store);
        await store.quit();
        expect(await client.ping()).to.equal('PONG');
        await client.quit();
    });

    it('keyPrefix option is rejected', function() {
        // @ts-expect-error: invalid input on purpose
        expect(() => new RigidDB('foo', 42, { ...redisOpts, keyPrefix: 'x:' }))
            .to.throw('The keyPrefix option of ioredis is not supported, use the database name instead.');
    });

    it('Existing client with keyPrefix is rejected and left open', async function() {
        const client = new Redis({ ...redisOpts, keyPrefix: 'x:' });

        expect(() => new RigidDB('foo', 42, client)).to.throw('keyPrefix');
        expect(await client.ping()).to.equal('PONG');
        await client.quit();
    });
});
