import { expect } from 'chai';
import { RigidDB } from '../src/index.ts';
import { redisClient, redisOpts, errorDetails, shouldNotResolve } from './helpers.ts';

let store = new RigidDB('foo', 42, redisOpts);

describe('GetSchema', function() {
    beforeEach(function() {
        store = new RigidDB('foo', 42, redisOpts);

        return redisClient.flushdb();
    });

    it('Fails when schema is not set', function() {
        return store.getSchema().then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'getSchema',
                err: 'schemaMissing'
            });
        });
    });

    it('Returns correct original schema', function() {
        return store.setSchema({
            cars: {
                fields: {
                    color: 'string',
                    year: 'int',
                    convertible: 'boolean',
                    purchaseDate: 'date',
                    created: 'timestamp'
                },
                indexes: {
                    first: {
                        unique: true,
                        fields: [ 'purchaseDate' ]
                    },
                    second: {
                        unique: false,
                        fields: [ 'color', 'year', 'convertible' ]
                    }
                }
            }
        }).then(function() {
            return store.getSchema();
        }).then(function(result) {
            expect(result).to.deep.equal({
                    revision: 42, schema: {
                        cars: {
                            fields: {
                                color: 'string',
                                year: 'int',
                                convertible: 'boolean',
                                purchaseDate: 'date',
                                created: 'timestamp'
                            },
                            indexes: {
                                first: {
                                    unique: true,
                                    fields: [ 'purchaseDate' ]
                                },
                                second: {
                                    unique: false,
                                    fields: [ 'color', 'year', 'convertible' ]
                                }
                            }
                        }
                    }
                });
        });
    });
});
