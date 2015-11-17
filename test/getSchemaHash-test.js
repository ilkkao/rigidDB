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
                indices: {
                    first: {
                        uniq: true,
                        fields: [ 'purchaseDate' ]
                    },
                    second: {
                        uniq: false,
                        fields: [ 'color', 'year', 'convertible' ]
                    }
                }
            }
        }).then(function(result) {
            return store.getSchemaHash();
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: '2ec78556eb49981297a8804603419571cd8eb055'
            });
        })
    });
});
