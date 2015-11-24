'use strict';

const expect = require('chai').expect,
      Redis = require('ioredis'),
      RigidDB = require('../index');

let redisClient = new Redis({
    db: 15
});

let store;
let id;

describe('Size', function() {
    beforeEach(function() {
        store = new RigidDB('foo', { db: 15 });

        return redisClient.flushdb().then(function() {
            return store.setSchema(1, {
                car: {
                    definition: {
                        color: 'string',
                        mileage: 'int',
                        convertible: 'boolean',
                        purchaseDate: 'date'
                    },
                    indices: {
                        first: {
                            uniq: true,
                            fields: [ 'purchaseDate' ]
                        },
                        second: {
                            uniq: false,
                            fields: [ 'color', 'mileage', 'convertible' ]
                        }
                    }
                }
            });
        });
    });

    it('Get size', function() {
        return store.create('car', {
            color: 'blue',
            mileage: 12345,
            convertible: true,
            purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
        }).then(function(result) {
            return store.create('car', {
                color: 'black',
                mileage: 4242,
                convertible: false,
                purchaseDate: new Date('Sun Nov 20 2015 07:41:24 GMT+0100 (CET)')
            });
        }).then(function(result) {
            return store.size('car');
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: 2
            });
        });
    });

    it('Get size for empty collection', function() {
        return store.size('car').then(function(result) {
            expect(result).to.deep.equal({
                val: 0
            });
        });
    });

    it('Get size for invalid type', function() {
        return store.size('bikes').then(function(result) {
            expect(result).to.deep.equal({
                err: 'unknownCollection',
                method: 'SIZE',
                val: false
            });
        });
    });
});
