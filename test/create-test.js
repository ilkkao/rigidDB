'use strict';

const expect = require('chai').expect,
      Redis = require('ioredis'),
      ObjectStore = require('../index');

let redisClient = new Redis({
    db: 15
});

let store;

describe('Create', function() {
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
            expect(result).to.deep.equal({
                val: '2ea7c9c97651bf3415d70ba73fe8b92936bc95e1'
            });
        });
    });

    it('Fails if collection is missing', function() {
        return store.create('bikes', {
            color: 'blue',
            mileage: 12345,
            convertible: true,
        }).then(function(result) {
            expect(result).to.deep.equal({
                command: 'CREATE',
                err: 'E_COLLECTION',
                val: false
            });
        });
    });

    it('Fails if not all parameters are given', function() {
        return store.create('car', {
            color: 'blue',
            mileage: 12345,
            convertible: true,
        }).then(function(result) {
            expect(result).to.deep.equal({
                command: 'CREATE',
                err: 'E_PARAMS',
                val: false
            });
        });
    });

    it('Fails if unique index would not be unique', function() {
        return store.create('car', {
            color: 'blue',
            mileage: 12345,
            convertible: true,
            purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: 1
            });

            return store.create('car', {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        }).then(function(result) {
            expect(result).to.deep.equal({
                command: 'CREATE',
                err: 'E_INDEX',
                val: false
            });
        });
    });

    it('Redis is updated correctly', function() {
        return store.create('car', {
            color: 'blue',
            mileage: 12345,
            convertible: true,
            purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0000 (UTC)')
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: 1
            });

            return redisClient.hgetall('foo:car:1');
        }).then(function(result) {
            expect(result).to.deep.equal({
                color: 'blue',
                mileage: '12345',
                convertible: 'true',
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0000 (UTC)').toString()
            });

            return redisClient.zrange('foo:car:ids', 0, -1);
        }).then(function(result) {
            expect(result).to.deep.equal([ "1" ]);

            return redisClient.get('foo:car:nextid');
        }).then(function(result) {
            expect(result).to.equal('1');

            return redisClient.hgetall('foo:car:i:purchaseDate');
        }).then(function(result) {
            let dateResult = {};
            dateResult[new Date('Sun Nov 01 2015 17:41:24 GMT+0000 (UTC)').toString().replace(/:/g, '::')] = '1';
            expect(result).to.deep.equal(dateResult);

            return redisClient.smembers('foo:car:i:color:convertible:mileage:blue:true:12345');
        }).then(function(result) {
            expect(result).to.deep.equal([ '1' ]);

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(6);
        });
    });

    it('Succeeds if the schema is set earlier', function() {
        let secondStore = new ObjectStore('foo', { db: 15 });

        return secondStore.create('car', {
            color: 'white',
            mileage: 12345,
            convertible: true,
            purchaseDate: new Date('Sun Nov 15 2015 17:41:24 GMT+0000 (UTC)')
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: 1
            });
        });
    });

    it('Fails if the schema is not set', function() {
        let secondStore = new ObjectStore('baz', { db: 15 });

        return secondStore.create('car', {
            color: 'white',
            mileage: 12345,
            convertible: true,
            purchaseDate: new Date('Sun Nov 15 2015 17:41:24 GMT+0000 (UTC)')
        }).then(function(result) {
            expect(result).to.deep.equal({
              command: 'CREATE',
              err: 'E_NOSCHEMA',
              val: false
            });
        });
    });

});
