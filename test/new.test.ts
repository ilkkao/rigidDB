import { expect } from 'chai';
import { RigidDB } from '../src/index.ts';
import { redisClient, redisOpts, errorDetails, shouldNotResolve } from './helpers.ts';

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
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                err: 'invalidStoredSchema',
                method: 'create'
            });
        });
    });

    it('Invalid existing schema causes error', function() {
        return redisClient.flushdb().then(function() {
            return redisClient.set('foo-42:_schema', '{ "cars": {} }');
        }).then(function() {
            let store = new RigidDB('foo', 42, redisOpts);

            return store.create('cars', {});
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                err: 'invalidStoredSchema',
                method: 'create'
            });
        });
    });

    it('Invalid existing schema causes error for transaction', function() {
        return redisClient.flushdb().then(function() {
            return redisClient.set('foo-42:_schema', '{ "cars": {} }');
        }).then(function() {
            let store = new RigidDB('foo', 42, redisOpts);

            return store.transaction(function(tr) {
                tr.create('cars', { color: 'black' });
            });
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                err: 'invalidStoredSchema',
                method: 'transaction'
            });
        });
    });
});
