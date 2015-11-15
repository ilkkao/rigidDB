'use strict';

const expect = require('chai').expect,
      Redis = require('ioredis'),
      ObjectStore = require('../index');

let redisClient = new Redis({
    db: 15
});

let store;
let id;

describe('Update', function() {
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
            });
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
        return store.update('car', 42, {
            color: 'red',
        }).then(function(result) {
            expect(result).to.deep.equal({
                command: 'UPDATE',
                err: 'E_MISSING',
                val: false
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
                command: 'UPDATE',
                err: 'E_INDEX',
                val: false
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
                val: true
            });
        });
    });

    it('Redis is updated correctly', function() {
        return store.update('car', id, {
            color: 'red',
            mileage: 4242,
            convertible: false,
            purchaseDate: new Date('Wed Nov 11 2015 18:19:56 GMT+0100 (CET)')
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: true
            });

            return redisClient.hgetall('foo:car:1');
        }).then(function(result) {
            expect(result).to.deep.equal({
                color: 'red',
                mileage: '4242',
                convertible: 'false',
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

            return redisClient.smembers('foo:car:i:color:convertible:mileage:red:false:4242');
        }).then(function(result) {
            expect(result).to.deep.equal([ id.toString() ]);

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(6);
        });
    });
});
