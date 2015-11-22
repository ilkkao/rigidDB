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
            return store.setSchema(1, {
                car: {
                    definition: {
                        color: { type: 'string', allowNull: true },
                        mileage: { type: 'int', allowNull: false },
                        convertible: 'boolean',
                        purchaseDate: 'date'
                    },
                    indices: {
                        first: {
                            uniq: true,
                            fields: [ 'purchaseDate' ]
                        },
                        second: {
                            uniq: false,
                            fields: [ 'color', 'mileage', 'convertible' ]
                        },
                        third: {
                            uniq: true,
                            fields: [ 'mileage', 'color' ]
                        }
                    }
                }
            });
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: true
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
                err: 'unknownCollection',
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
                err: 'badParameter',
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
                err: 'notUnique',
                val: false,
                indices: [ 'first', 'third' ]
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
            expect(result).to.deep.equal([ '1' ]);

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
            expect(result).to.have.length(8);
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
              err: 'schemaMissing',
              val: false
            });
        });
    });

    it('Fails if the value is null', function() {
        return store.create('car', {
            color: 'blue',
            mileage: null,
            convertible: true,
            purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0000 (UTC)')
        }).then(function(result) {
            expect(result).to.deep.equal({
                command: 'CREATE',
                err: 'nullNotAllowed',
                val: false
            });
        });
    });
});
