'use strict';

const expect = require('chai').expect,
      Redis = require('ioredis'),
      ObjectStore = require('../index');

let redisClient = new Redis({
    db: 15
});

let store = new ObjectStore('foo', { db: 15 });
let id;

describe('List', function() {
    beforeEach(function() {
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
            });
        });
    });

    it('Get ids', function() {
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
                err: 'E_COLLECTION',
                command: 'LIST',
                val: false
            });
        });
    });
});
