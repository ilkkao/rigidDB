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
        return redisClient.flushdb().then(function() {
            store = new ObjectStore('foo', {
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
            }, {
                db: 15
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

            return redisClient.smembers('foo:car:ids');
        }).then(function(result) {
            expect(result).to.deep.equal([ "1" ]);

            return redisClient.get('foo:car:nextid');
        }).then(function(result) {
            expect(result).to.equal('1');

            return redisClient.hgetall('foo:car:index:purchaseDate');
        }).then(function(result) {
            let dateResult = {};
            dateResult[new Date('Sun Nov 01 2015 17:41:24 GMT+0000 (UTC)').toString().replace(/:/g, '::')] = '1';
            expect(result).to.deep.equal(dateResult);

            return redisClient.smembers('foo:car:index:color:convertible:mileage:blue:true:12345');
        }).then(function(result) {
            expect(result).to.deep.equal([ '1' ]);

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(5);
        });
    });
});
