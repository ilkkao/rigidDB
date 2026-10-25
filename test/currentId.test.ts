import { expect } from 'chai';
import { RigidDB } from '../src/index.ts';
import { redisClient, redisOpts } from './helpers.ts';

let store: RigidDB;

describe('CurrentId', function() {
    beforeEach(function() {
        store = new RigidDB('foo', 42, redisOpts);

        return redisClient.flushdb().then(function() {
            return store.setSchema({
                car: {
                    definition: {
                        color: 'string'
                    }
                }
            });
        });
    });

    it('Get currentId when collection is empty', function() {
        return store.currentId('car').then(function(result) {
            expect(result).to.deep.equal({
                val: 0
            });
        });
    });

    it('Get currentId when collection is not empty', function() {
        return store.create('car', {
            color: 'blue'
        }).then(function() {
            return store.create('car', {
                color: 'black'
            });
        }).then(function() {
            return store.currentId('car');
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: 2
            });
        });
    });

    it('Get currentId when collection is invalid', function() {
        return store.currentId('boat').then(function(result) {
            expect(result).to.deep.equal({
                err: 'unknownCollection',
                method: 'currentId',
                val: false
            });
        });
    });
});
