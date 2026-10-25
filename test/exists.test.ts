import { expect } from 'chai';
import { RigidDB } from '../src/index.ts';
import { redisClient, redisOpts } from './helpers.ts';

let store: RigidDB;
let id: number;

describe('Exists', function() {
    beforeEach(function() {
        return redisClient.flushdb().then(function() {
            store = new RigidDB('foo', 42, redisOpts);

            store.setSchema({
                car: {
                    fields: {
                        color: 'string',
                        mileage: 'int',
                        convertible: 'boolean',
                        purchaseDate: 'date'
                    },
                    indexes: {
                        purchase: {
                            unique: true,
                            fields: [ 'purchaseDate' ]
                        },
                        details: {
                            unique: false,
                            fields: [ 'color', 'mileage', 'convertible' ]
                        }
                    }
                }
            });
        }).then(function() {
            return store.create('car', {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        }).then(function(result) {
            id = result;
        });
    });

    it('Fails if id doesn\'t exist', function() {
        return store.exists('car', 4242).then(function(result) {
            expect(result).to.deep.equal(false);

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(6);
        });
    });

    it('Succeeds if id exists', function() {
        return store.exists('car', id).then(function(result) {
            expect(result).to.deep.equal(true);

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(6);
        });
    });
});
