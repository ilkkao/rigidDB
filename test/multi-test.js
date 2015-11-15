'use strict';

const expect = require('chai').expect,
      Redis = require('ioredis'),
      ObjectStore = require('../index');

let redisClient = new Redis({
    db: 15
});

let store = new ObjectStore('foo', { db: 15 });

describe('Multi', function() {
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

            return redisClient.zrange('foo:car:ids', 0, -1);
        }).then(function(result) {
            expect(result).to.deep.equal([ '1' ]);

            return redisClient.get('foo:car:nextid');
        }).then(function(result) {
            expect(result).to.equal('1');

            return redisClient.hgetall('foo:car:i:purchaseDate');
        }).then(function(result) {
            let dateResult = {};
            dateResult[new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)').toString().replace(/:/g, '::')] = '1';
            expect(result).to.deep.equal(dateResult);

            return redisClient.smembers('foo:car:i:color:convertible:mileage:white:true:42');
        }).then(function(result) {
            expect(result).to.deep.equal([ '1' ]);

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(6);
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
            expect(result).to.have.length(2);
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
            expect(result).to.have.length(1);
        });
    });

    it('failed create cancels multi', function() {
        return store.multi(function(tr) {
            tr.create('bikes', {
                color: 'red',
                mileage: 42,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
            tr.create('car', {
                color: 'red',
                mileage: 42,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        }).then(function(result) {
            expect(result).to.deep.equal({
                command: 'CREATE',
                err: 'E_COLLECTION',
                val: false
            });

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(1);
        });
    });

});
