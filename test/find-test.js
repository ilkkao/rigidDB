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
                car: {
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
            return store.create('car', {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        }).then(function() {
            return store.create('car', {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 22:41:24 GMT+0100 (CET)')
            });
        }).then(function() {
            return store.create('car', {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 23:41:24 GMT+0100 (CET)')
            });
        });
    });

    it('Fails if no index', function() {
        return store.find('car', {
            color: 'red'
        }).then(function(result) {
            expect(result).to.deep.equal({
                err: 'unknownIndex',
                method: 'find',
                val: false
            });
        });
    });

    it('Fails if null when null is not allowed', function() {
        return store.find('car', {
            color: 'white',
            mileage: null,
            convertible: false
        }).then(function(result) {
            expect(result).to.deep.equal({
                method: 'find',
                err: 'nullNotAllowed',
                val: false
            });
        });
    });

    it('Return empty array', function() {
        return store.find('car', {
            color: 'blue',
            mileage: 12346,
            convertible: true
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: []
            });
        });
    });

    it('Succeeds', function() {
        return store.find('car', {
            color: 'blue',
            mileage: 12345,
            convertible: true
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: [ 1, 2, 3 ]
            });
        });
    });

    it('Succeeds to find null values', function() {
        return store.create('car', {
            color: null,
            mileage: 12345,
            convertible: true,
            purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
        }).then(function() {
            return store.create('car', {
                color: null,
                mileage: 12346,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        }).then(function() {
            return store.find('car', {
                color: null,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: [ 4, 5 ]
            });
        });
    });
});
