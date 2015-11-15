'use strict';

const expect = require('chai').expect,
      Redis = require('ioredis'),
      ObjectStore = require('../index');

let redisClient = new Redis({
    db: 15
});

let store = new ObjectStore('foo', { db: 15 });

describe('GetSchemaHash', function() {
    beforeEach(function() {
        store = new ObjectStore('foo', { db: 15 });

        return redisClient.flushdb();
    });

    it('Fails when schema is not set', function() {
        return store.getSchemaHash().then(function(result) {
            expect(result).to.deep.equal({
                command: 'GETSCHEMAHASH',
                err: 'E_NOSCHEMA',
                val: false
            });
        })
    });

    it('Returns correct sha1', function() {
        return store.setSchema({
            cars: {
                definition: {
                    color: 'string',
                    year: 'int',
                    convertible: 'boolean',
                    purchaseDate: 'date',
                    created: 'timestamp'
                },
                indices: [{
                    uniq: true,
                    fields: [ 'purchaseDate' ]
                }, {
                    uniq: false,
                    fields: [ 'color', 'year', 'convertible' ]
                }]
            }
        }).then(function(result) {
            return store.getSchemaHash();
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: '8f8e7f3a957940ba9f1e04483485a18a12071652'
            });
        })
    });
});
