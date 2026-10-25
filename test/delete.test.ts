import { expect } from 'chai';
import { RigidDB } from '../src/index.ts';
import { redisClient, redisOpts, unwrap } from './helpers.ts';

let store: RigidDB;
let id: number;

describe('Delete', function() {
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
            id = unwrap(result);
        });
    });

    it('Fails if id doesn\'t exists', function() {
        return store.delete('car', 42).then(function(result) {
            expect(result).to.deep.equal({
                method: 'delete',
                err: 'notFound',
                val: false
            });
        });
    });

    it('Redis is updated correctly', function() {
        return store.delete('car', id).then(function(result) {
            expect(result).to.deep.equal({
                val: true
            });

            return redisClient.smembers('foo-42:car:ids');
        }).then(function(result) {
            expect(result).to.deep.equal([]);

            return redisClient.get('foo-42:car:nextid');
        }).then(function(result) {
            expect(result).to.equal('1');

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(2);
        });
    });
});
