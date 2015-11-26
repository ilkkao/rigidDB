'use strict';

const expect = require('chai').expect,
      Redis = require('ioredis'),
      RigidDB = require('../index');

let redisClient = new Redis({
    db: 15
});

let store;

describe('Find', function() {
    beforeEach(function() {
        return redisClient.flushdb().then(function() {
            store = new RigidDB('foo', { db: 15 });

            return store.setSchema(1, {
                cars: {
                    definition: {
                        color: { type: 'string', allowNull: true },
                        mileage: 'int',
                        convertible: 'boolean',
                        purchaseDate: 'date'
                    },
                    indices: {
                        first: {
                            uniq: true,
                            fields: [ 'purchaseDate', 'color' ]
                        },
                        second: {
                            uniq: false,
                            fields: [ 'color', 'mileage', 'convertible' ]
                        }
                    }
                }
            });
        }).then(function() {
            return store.create('cars', {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        }).then(function() {
            return store.create('cars', {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 22:41:24 GMT+0100 (CET)')
            });
        }).then(function() {
            return store.create('cars', {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 23:41:24 GMT+0100 (CET)')
            });
        });
    });

    it('Prints collection', function() {
        return store.debugPrint('cars').then(function(result) {
        });
    });
});
