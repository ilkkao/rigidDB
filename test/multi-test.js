'use strict';

const expect = require('chai').expect,
      Redis = require('ioredis'),
      ObjectStore = require('../index');

let redisClient = new Redis({
    db: 15
});

let store;

describe('Multi', function() {
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

    it('empty multi', function() {
        return store.multi(function() {}).then(function(result) {
            expect(result).to.deep.equal({
                val: true
            });
        });
    });

    it('multi containing invalid create', function() {
        return store.multi(function(tr) {
            tr.create('car', { color: 'black' });
        }).then(function(result) {
            expect(result).to.deep.equal({
                err: 'E_PARAMS',
                val: false,
                command: 'CREATE'
            });
        });
    });

    it('multi', function() {
        return store.multi(function(tr) {
            tr.create('car', {
                color: 'red',
                mileage: 42,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
            tr.update('car', 1, { color: 'white' });
            tr.get('car', 1);
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: {
                    color: 'white',
                    mileage: 42,
                    convertible: true,
                    purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
                }
            });

            return redisClient.hgetall('foo:car:1');
        }).then(function(result) {
            expect(result).to.deep.equal({
                color: 'white',
                mileage: '42',
                convertible: 'true',
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)').toString()
            });

            return redisClient.smembers('foo:car:ids');
        }).then(function(result) {
            expect(result).to.deep.equal([ '1' ]);

            return redisClient.get('foo:car:nextid');
        }).then(function(result) {
            expect(result).to.equal('1');

            return redisClient.hgetall('foo:car:index:purchaseDate');
        }).then(function(result) {
            let dateResult = {};
            dateResult[new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)').toString().replace(/:/g, '::')] = '1';
            expect(result).to.deep.equal(dateResult);

            return redisClient.smembers('foo:car:index:color:convertible:mileage:white:true:42');
        }).then(function(result) {
            expect(result).to.deep.equal([ '1' ]);

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(5);
        });
    });

    it('create delete', function() {
        return store.multi(function(tr) {
            tr.create('car', {
                color: 'red',
                mileage: 42,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
            tr.delete('car', 1);
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: true
            });

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(1);
        });
    });

    it('failed exists cancels multi', function() {
        return store.multi(function(tr) {
            tr.exists('car', 1);
            tr.create('car', {
                color: 'red',
                mileage: 42,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: false
            });

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(0);
        });
    });
});