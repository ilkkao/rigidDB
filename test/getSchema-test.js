'use strict';

const expect = require('chai').expect,
    Redis = require('ioredis'),
    RigidDB = require('../index');

let redisClient = new Redis({
    db: 15
});

let store = new RigidDB('foo', { db: 15 });

describe('GetSchema', function() {
    beforeEach(function() {
        store = new RigidDB('foo', { db: 15 });

        return redisClient.flushdb();
    });

    it('Fails when schema is not set', function() {
        return store.getSchema().then(function(result) {
            expect(result).to.deep.equal({
                method: 'getSchema',
                err: 'schemaMissing',
                val: false
            });
        });
    });

    it('Returns correct original schema', function() {
        return store.setSchema(1, {
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
        }).then(function() {
            return store.getSchema();
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: {
                    revision: 1, schema: {
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
                    }
                }
            });
        });
    });
});
