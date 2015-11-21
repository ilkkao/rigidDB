'use strict';

const expect = require('chai').expect,
      Redis = require('ioredis'),
      ObjectStore = require('../index');

let redisClient = new Redis({
    db: 15
});

let store;
let id;

describe('Get', function() {
    beforeEach(function() {
        return redisClient.flushdb().then(function() {
            store = new ObjectStore('foo', { db: 15 });

            return store.setSchema(1, {
                car: {
                    definition: {
                        color: 'string',
                        mileage: 'int',
                        convertible: 'boolean',
                        purchaseDate: 'date',
                        purchaseTs: 'timestamp'
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
        }).then(function() {
            return store.create('car', {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)'),
                purchaseTs: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        }).then(function(result) {
            id = result.val;
        });
    });

    it('Fails if id doesn\'t exist', function() {
        return store.get('car', 4242).then(function(result) {
            expect(result).to.deep.equal({
                command: 'GET',
                err: 'notFound',
                val: false
            });

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(7);
        });
    });

    it('Succeeds if id exists', function() {
        return store.get('car', id).then(function(result) {
            expect(result).to.deep.equal({
                val: {
                    color: 'blue',
                    mileage: 12345,
                    convertible: true,
                    purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)'),
                    purchaseTs: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
                }
            });

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(7);
        });
    });
});
