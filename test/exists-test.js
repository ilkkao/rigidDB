'use strict';

const expect = require('chai').expect,
    Redis = require('ioredis'),
    RigidDB = require('../index');

let redisClient = new Redis({
    db: 15
});

let store;
let id;

describe('Exists', function() {
    beforeEach(function() {
        return redisClient.flushdb().then(function() {
            store = new RigidDB('foo', 42, { db: 15 });

            store.setSchema({
                car: {
                    definition: {
                        color: 'string',
                        mileage: 'int',
                        convertible: 'boolean',
                        purchaseDate: 'date'
                    },
                    indices: {
                        purchase: {
                            uniq: true,
                            fields: [ 'purchaseDate' ]
                        },
                        details: {
                            uniq: false,
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
            id = result.val;
        });
    });

    it('Fails if id doesn\'t exist', function() {
        return store.exists('car', 4242).then(function(result) {
            expect(result).to.deep.equal({
                val: false
            });

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(6);
        });
    });

    it('Succeeds if id exists', function() {
        return store.exists('car', id).then(function(result) {
            expect(result).to.deep.equal({
                val: true
            });

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(6);
        });
    });
});
