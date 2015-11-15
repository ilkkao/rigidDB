'use strict';

const expect = require('chai').expect,
      Redis = require('ioredis'),
      ObjectStore = require('../index');

let redisClient = new Redis({
    db: 15
});

let store;
let id;

describe('Delete', function() {
    beforeEach(function() {
        store = new ObjectStore('foo', { db: 15 });

        return redisClient.flushdb().then(function() {
            return store.setSchema({
                car: {
                    definition: {
                        color: 'string',
                        mileage: 'int',
                        convertible: 'boolean',
                        purchaseDate: 'date'
                    },
                    indices: [{
                        uniq: true,
                        fields: [ 'purchaseDate' ]
                    }, {
                        uniq: false,
                        fields: [ 'color', 'mileage', 'convertible' ]
                    }]
                }
            })
        }).then(function(result) {
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

    it('Fails if id doesn\'t exists', function() {
        return store.delete('car', 42).then(function(result) {
            expect(result).to.deep.equal({
                command: 'DELETE',
                err: 'E_MISSING',
                val: false
            });
        });
    });

    it('Redis is updated correctly', function() {
        return store.delete('car', id).then(function(result) {
            expect(result).to.deep.equal({
                val: true
            });

            return redisClient.smembers('foo:car:ids');
        }).then(function(result) {
            expect(result).to.deep.equal([]);

            return redisClient.get('foo:car:nextid');
        }).then(function(result) {
            expect(result).to.equal('1');

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(2);
        });
    });
});
