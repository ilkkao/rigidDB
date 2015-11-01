'use strict';

const expect = require('chai').expect,
      store = require('../index'),
      Redis = require('ioredis');

let redisClient = new Redis();

describe('Create', function() {
    before(function(done) {
        redisClient.flushall().then(function() {
            store.setSchema({
                prefix: 'test',
                schema: {
                    car: {
                        definition: {
                            color: 'string',
                            mileage: 'int',
                            inUse: 'boolean',
                            purchased: 'unixtime'
                        },
                        index: []
                    }
                }
            });

            store.start();
            done();
        });
    });

    it("create first object", function() {
        return store.create('car', {
            color: 'blue',
            mileage: 12345,
            inUse: true,
            purchased: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
        }).then(function(result) {
            expect(result).to.equal(1);
        });
    });

    it("create second object", function() {
        return store.create('car', {
            color: 'blue',
            mileage: 42,
            inUse: true,
            purchased: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
        }).then(function(result) {
            expect(result).to.equal(2);
        });
    });

    it("update second object", function() {
        return store.update('car', 2, {
            color: 'red'
        }).then(function(result) {
            expect(result).to.equal(1);
        });
    });

    it("update non-existent object", function() {
        return store.update('car', 42, {
            color: 'red'
        }).then(function(result) {
            expect(result).to.equal(false);
        });
    });

    it("get second object", function() {
        return store.get('car', 2).then(function(result) {
            expect(result).to.deep.equal({
                color: 'red',
                mileage: 42,
                inUse: true,
                purchased: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        });
    });

    it("remove second object", function() {
        return store.delete('car', 2).then(function(result) {
            expect(result).to.equal(1);
        });
    });

    it("get non-existent second object", function() {
        return store.get('car', 2).then(function(result) {
            expect(result).to.equal(false);
        });
    });

    it("empty multi", function() {
        return store.multi(function() {}).then(function(result) {
            expect(result).to.equal(false);
        });
    });

    it("multi", function() {
        return store.multi(function(tr) {
            tr.create('car', { color: 'black' });
            tr.update('car', 3, { color: 'white' });
            tr.get('car', 3);
        }).then(function(result) {
            expect(result).to.deep.equal({
                color: 'white'
            });
        });
    });
});
