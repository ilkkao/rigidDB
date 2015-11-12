'use strict';

const expect = require('chai').expect,
      ObjectStore = require('../index'),
      Redis = require('ioredis');

let redisClient = new Redis({
    db: 15
});

let store;

describe('Legacy', function() {
    before(function() {
        return redisClient.flushall().then(function() {
            store = new ObjectStore('test', {
                car: {
                    definition: {
                        color: 'string',
                        mileage: 'int',
                        inUse: 'boolean',
                        purchased: 'date'
                    },
                    indices: [{
                        uniq: true,
                        fields: [ 'color', 'inUse' ]
                    }, {
                        uniq: true,
                        fields: [ 'mileage', 'purchased' ]
                    }, {
                        uniq: false,
                        fields: [ 'color' ]
                    }]
                }
            }, {
                db: 15
            });
        });
    });

    it("create first object", function() {
        return store.create('car', {
            color: 'blue',
            mileage: 12345,
            inUse: true,
            purchased: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: 1
            });
        });
    });

    it("create second object", function() {
        return store.create('car', {
            color: 'black',
            mileage: 42,
            inUse: true,
            purchased: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: 2
            });
        });
    });

    it("update second object", function() {
        return store.update('car', 2, {
            color: 'red'
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: true
            });
        });
    });

    it("get second object", function() {
        return store.get('car', 2).then(function(result) {
            expect(result).to.deep.equal({
                val: {
                    color: 'red',
                    mileage: 42,
                    inUse: true,
                    purchased: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
                }
            });
        });
    });

    it("get all object ids", function() {
        return store.getAllIds('car').then(function(result) {
            expect(result).to.deep.equal({
                val: [ 1, 2 ]
            });
        });
    });

    it("remove second object", function() {
        return store.delete('car', 2).then(function(result) {
            expect(result).to.deep.equal({
                val: true
            });
        });
    });

    it("get all object ids", function() {
        return store.getAllIds('car').then(function(result) {
            expect(result).to.deep.equal({
               val: [ 1 ]
            });
        });
    });

    it("get non-existent second object", function() {
        return store.get('car', 2).then(function(result) {
            expect(result).to.deep.equal({
                err: 'E_MISSING',
                val: false,
                command: "GET"
            });
        });
    });

    it("find blue objects", function() {
        return store.findAll('car', { color: 'blue' }).then(function(result) {
            expect(result).to.deep.equal({
                val: [ 1 ]
            });
        });
    });

    it("find gold objects", function() {
        return store.findAll('car', { color: 'gold' }).then(function(result) {
            expect(result).to.deep.equal({
                val: []
            });
        });
    });
});
