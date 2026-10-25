import { expect } from 'chai';
import { RigidDB } from '../src/index.ts';
import { redisClient, redisOpts } from './helpers.ts';

let store = new RigidDB('foo', 42, redisOpts);

describe('GetSchema', function() {
    beforeEach(function() {
        store = new RigidDB('foo', 42, redisOpts);

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
        }).then(function() {
            return store.getSchema();
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: {
                    revision: 42, schema: {
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
