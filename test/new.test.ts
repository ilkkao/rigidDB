import { expect } from 'chai';
import { RigidDB } from '../src/index.ts';
import { redisClient, redisOpts } from './helpers.ts';

describe('Constructor', function() {
    it('Missing prefix parameter throws', function() {
        // @ts-expect-error: invalid input on purpose
        expect(() => new RigidDB()).to.throw('Invalid prefix.');
    });

    it('Invalid prefix parameter throws', function() {
        // @ts-expect-error: invalid input on purpose
        expect(() => new RigidDB('!notvalid')).to.throw('Invalid prefix.');
    });

    it('Missing revision parameter throws', function() {
        // @ts-expect-error: invalid input on purpose
        expect(() => new RigidDB('mas')).to.throw('Invalid revision.');
    });

    it('Invalid revision parameter throws', function() {
        expect(() => new RigidDB('mas', 1.2)).to.throw('Invalid revision.');
    });

    it('Invalid existing schema causes error', function() {
        return redisClient.flushdb().then(function() {
            return redisClient.set('foo-42:_schema', 'whatwhat');
        }).then(function() {
            let store = new RigidDB('foo', 42, redisOpts);

            return store.create('cars', {});
        }).then(function(result) {
            expect(result).to.deep.equal({
                err: 'badSavedSchema',
                method: 'create',
                val: false
            });
        });
    });

    it('Invalid existing schema causes error', function() {
        return redisClient.flushdb().then(function() {
            return redisClient.set('foo-42:_schema', '{ "cars": {} }');
        }).then(function() {
            let store = new RigidDB('foo', 42, redisOpts);

            return store.create('cars', {});
        }).then(function(result) {
            expect(result).to.deep.equal({
                err: 'badSavedSchema',
                method: 'create',
                val: false
            });
        });
    });

    it('Invalid existing schema causes error for multi', function() {
        return redisClient.flushdb().then(function() {
            return redisClient.set('foo-42:_schema', '{ "cars": {} }');
        }).then(function() {
            let store = new RigidDB('foo', 42, redisOpts);

            return store.multi(function(tr) {
                tr.create('cars', { color: 'black' });
            });
        }).then(function(result) {
            expect(result).to.deep.equal({
                err: 'badSavedSchema',
                method: 'multi',
                val: false
            });
        });
    });
});
