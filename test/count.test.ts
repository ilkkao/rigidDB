import { expect } from 'chai';
import { RigidDB } from '../src/index.ts';
import { redisClient, redisOpts, errorDetails, shouldNotResolve } from './helpers.ts';

let store: RigidDB;

describe('Count', function() {
    beforeEach(function() {
        store = new RigidDB('foo', 42, redisOpts);

        return redisClient.flushdb().then(function() {
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

    it('Get count', function() {
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
            return store.count('car');
        }).then(function(result) {
            expect(result).to.deep.equal(2);
        });
    });

    it('Get count for empty collection', function() {
        return store.count('car').then(function(result) {
            expect(result).to.deep.equal(0);
        });
    });

    it('Get count for invalid type', function() {
        return store.count('bikes').then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                err: 'unknownCollection',
                method: 'count'
            });
        });
    });
});
