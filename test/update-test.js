'use strict';

const expect = require('chai').expect,
    Redis = require('ioredis'),
    RigidDB = require('../index');

let redisClient = new Redis({
    db: 15
});

let store;
let id;

describe('Update', function() {
    beforeEach(function() {
        store = new RigidDB('foo', { db: 15 });

        return redisClient.flushdb().then(function() {
            return store.setSchema(1, {
                car: {
                    definition: {
                        color: 'string',
                        mileage: { type: 'int', allowNull: false },
                        convertible: 'boolean',
                        purchaseDate: { type: 'date', allowNull: true }
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
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        }).then(function(result) {
            id = result.val;
        });
    });

    it('Fails if id doesn\'t exists', function() {
        return store.update('car', 42, {
            color: 'red'
        }).then(function(result) {
            expect(result).to.deep.equal({
                method: 'update',
                err: 'notFound',
                val: false,
                indices: []
            });
        });
    });

    it('Fails if unique index would not be unique', function() {
        return store.create('car', {
            color: 'black',
            mileage: 10,
            convertible: false,
            purchaseDate: new Date('Wed Nov 11 2015 18:29:45 GMT+0100 (CET)')
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: 2
            });

            return store.update('car', id, {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Wed Nov 11 2015 18:29:45 GMT+0100 (CET)')
            });
        }).then(function(result) {
            expect(result).to.deep.equal({
                method: 'update',
                err: 'notUnique',
                val: false,
                indices: [ 'first' ]
            });
        });
    });

    it('Can be updated with the identical values', function() {
        return store.update('car', id, {
            color: 'blue',
            mileage: 12345,
            convertible: true,
            purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: 0
            });
        });
    });

    it('Redis is updated correctly', function() {
        return store.update('car', id, {
            color: 'red',
            mileage: 4242,
            convertible: true,
            purchaseDate: new Date('Wed Nov 11 2015 18:19:56 GMT+0100 (CET)'),
            foobar: new Date(NaN) // Properties not in schema are ignored
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: 3
            });

            return redisClient.hgetall('foo:car:1');
        }).then(function(result) {
            expect(result).to.deep.equal({
                color: 'red',
                mileage: '4242',
                convertible: 'true',
                purchaseDate: new Date('Wed Nov 11 2015 18:19:56 GMT+0100 (CET)').toString()
            });

            return redisClient.zrange('foo:car:ids', 0, -1);
        }).then(function(result) {
            expect(result).to.deep.equal([ id.toString() ]);

            return redisClient.get('foo:car:nextid');
        }).then(function(result) {
            expect(result).to.equal(id.toString());

            return redisClient.hgetall('foo:car:i:purchaseDate');
        }).then(function(result) {
            let dateResult = {};
            dateResult[new Date('Wed Nov 11 2015 18:19:56 GMT+0100 (CET)').toString().replace(/:/g, '::')] = '1';
            expect(result).to.deep.equal(dateResult);

            return redisClient.hget('foo:car:i:color:convertible:mileage', 'red:true:4242');
        }).then(function(result) {
            expect(result).to.deep.equal(id.toString());

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(7);
        });
    });

    it('Fails if null attribute is not allowed', function() {
        return store.update('car', id, {
            color: 'red',
            mileage: null,
            convertible: false,
            purchaseDate: new Date('Wed Nov 11 2015 18:19:56 GMT+0100 (CET)')
        }).then(function(result) {
            expect(result).to.deep.equal({
                method: 'update',
                err: 'nullNotAllowed',
                val: false
            });
        });
    });

    it('Succeeds if null attribute is allowed', function() {
        return store.update('car', id, {
            color: 'red',
            mileage: '1234',
            convertible: false,
            purchaseDate: null
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: 4
            });
        });
    });

});
