import { expect } from 'chai';
import { RigidDB } from '../src/index.ts';
import { redisClient, redisOpts } from './helpers.ts';

let store: RigidDB;

describe('List', function() {
    beforeEach(function() {
        return redisClient.flushdb().then(function() {
            store = new RigidDB('foo', 42, redisOpts);

            return store.setSchema({
                car: {
                    fields: {
                        color: 'string',
                        mileage: 'int',
                        convertible: 'boolean',
                        purchaseDate: 'date'
                    },
                    indexes: {
                        first: {
                            unique: true,
                            fields: [ 'purchaseDate' ]
                        },
                        second: {
                            unique: false,
                            fields: [ 'color', 'mileage', 'convertible' ]
                        }
                    }
                }
            });
        });
    });

    it('Get ids', function() {
        return store.create('car', {
            color: 'blue',
            mileage: 12345,
            convertible: true,
            purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
        }).then(function() {
            return store.create('car', {
                color: 'black',
                mileage: 4242,
                convertible: false,
                purchaseDate: new Date('Sun Nov 20 2015 07:41:24 GMT+0100 (CET)')
            });
        }).then(function() {
            return store.list('car');
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: [ 1, 2 ]
            });
        });
    });

    it('Get ids for empty collection', function() {
        return store.list('car').then(function(result) {
            expect(result).to.deep.equal({
                val: []
            });
        });
    });

    it('Get ids for invalid collection', function() {
        return store.list('bikes').then(function(result) {
            expect(result).to.deep.equal({
                err: 'unknownCollection',
                method: 'list',
                val: false
            });
        });
    });
});
