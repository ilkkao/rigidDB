'use strict';

const expect = require('chai').expect,
      ObjectStore = require('../index'),
      Redis = require('ioredis');

let redisClient = new Redis();
let store;

describe('Legacy', function() {
    before(function(done) {
        redisClient.flushall().then(function() {
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
            });

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
            expect(result).to.deep.equal({
                val: 1
            });
        });
    });

    it("create second object", function() {
        return store.create('car', {
            color: 'blue',
            mileage: 42,
            inUse: true,
            purchased: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
        }).then(function(result) {
            expect(result).to.deep.equal({
                err: 'E_INDEX',
                val: false,
                command: "CREATE"
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
                val: 3
            });
        });
    });

    it("update second object", function() {
        return store.update('car', 3, {
            color: 'red'
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: true
            });
        });
    });

    it("update non-existent object", function() {
        return store.update('car', 42, {
            color: 'red'
        }).then(function(result) {
            expect(result).to.deep.equal({
                err: 'E_MISSING',
                val: false,
                command: "UPDATE"
            });
        });
    });

    it("get second object", function() {
        return store.get('car', 3).then(function(result) {
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
                val: [ 1, 3 ]
            });
        });
    });

    it("remove second object", function() {
        return store.delete('car', 3).then(function(result) {
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

    it("empty multi", function() {
        return store.multi(function() {}).then(function(result) {
            expect(result).to.deep.equal({
                val: true
            });
        });
    });

    it("multi containing invalid create", function(done) {
        store.multi(function(tr) {
            tr.create('car', { color: 'black' });
        }).then(null, function(reason) {
            expect(reason).to.equal('Create() must set all attributes');
            done();
        });
    });

    it("multi", function() {
        return store.multi(function(tr) {
            tr.create('car', {
                color: 'red',
                mileage: 42,
                inUse: true,
                purchased: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
            tr.update('car', 4, { color: 'white' });
            tr.get('car', 4);
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: {
                    color: 'white',
                    mileage: 42,
                    inUse: true,
                    purchased: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
                }
            });
        });
    });

    it("find black objects", function() {
        return store.findAll('car', { color: 'white' }).then(function(result) {
            expect(result).to.deep.equal({
                val: [ 4 ]
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
