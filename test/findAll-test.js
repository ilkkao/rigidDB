'use strict';

const expect = require('chai').expect,
      Redis = require('ioredis'),
      ObjectStore = require('../index');

let redisClient = new Redis({
    db: 15
});

let store = new ObjectStore('foo', { db: 15 });
let id;

describe('Find', function() {
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
                        fields: [ 'purchaseDate', 'color' ]
                    }, {
                        uniq: false,
                        fields: [ 'color', 'mileage', 'convertible' ]
                    }]
                }
            });
        }).then(function(result) {
            return store.create('car', {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        }).then(function(result) {
            return store.create('car', {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 22:41:24 GMT+0100 (CET)')
            });
        }).then(function(result) {
            return store.create('car', {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 23:41:24 GMT+0100 (CET)')
            });
        });
    });

    it('Fails if no index', function() {
        return store.findAll('car', {
            color: 'red'
        }).then(function(result) {
            expect(result).to.deep.equal({
                err: 'E_INDEX',
                command: 'FINDALL',
                val: false
            });
        });
    });

    it('Fails if index is unique', function() {
        return store.findAll('car', {
            color: 'blue',
            purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
        }).then(function(result) {
            expect(result).to.deep.equal({
                err: 'E_INDEX',
                command: 'FINDALL',
                val: false
            });
        });
    });

    it('Return empty array', function() {
        return store.findAll('car', {
            color: 'blue',
            mileage: 12346,
            convertible: true,
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: []
            });
        });
    });

    it('Succeeds', function() {
        return store.findAll('car', {
            color: 'blue',
            mileage: 12345,
            convertible: true,
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: [ 1, 2, 3 ]
            });
        });
    });
});
