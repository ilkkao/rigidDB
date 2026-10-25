import { expect } from 'chai';
import { RigidDB } from '../src/index.ts';
import { redisClient, redisOpts, errorDetails, shouldNotResolve } from './helpers.ts';

let store: RigidDB;

describe('SetSchema', function() {
    beforeEach(function() {
        return redisClient.flushdb().then(function() {
            store = new RigidDB('foo', 42, redisOpts);
        });
    });

    it('Missing schema parameter', function() {
        // @ts-expect-error: invalid input on purpose
        return store.setSchema().then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'setSchema',
                err: 'invalidSchema',
                reason: 'Invalid schema.'
            });
        });
    });

    it('Circular reference', function() {
        let schema = {};
        // @ts-expect-error: invalid input on purpose
        schema.schema = schema;

        return store.setSchema(schema).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'setSchema',
                err: 'invalidSchema',
                reason: 'Invalid schema.'
            });
        });
    });

    it('Zero collections', function() {
        return store.setSchema({}).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'setSchema',
                err: 'invalidSchema',
                reason: 'At least one collection must be defined.'
            });
        });
    });

    it('Missing collection fields', function() {
        // @ts-expect-error: invalid input on purpose
        return store.setSchema({ cars: {} }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'setSchema',
                err: 'invalidSchema',
                reason: 'Fields missing.'
            });
        });
    });

    it('Invalid collection field name', function() {
        return store.setSchema({
            cars: {
                fields: {
                    'co:lor': 'string'
                }
            }
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'setSchema',
                err: 'invalidSchema',
                reason: 'Invalid field name (letters, numbers, and dashes allowed): \'co:lor\''
            });
        });
    });

    it('Invalid collection field type', function() {
        return store.setSchema({
            cars: {
                fields: {
                    // @ts-expect-error: invalid input on purpose
                    color: 'wrong'
                }
            }
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'setSchema',
                err: 'invalidSchema',
                reason: 'Invalid type: \'wrong\''
            });
        });
    });

    it('Missing collection field type when object', function() {
        return store.setSchema({
            cars: {
                fields: {
                    // @ts-expect-error: invalid input on purpose
                    color: {}
                }
            }
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'setSchema',
                err: 'invalidSchema',
                reason: 'Type definition missing.'
            });
        });
    });

    it('Missing unique property in index definition', function() {
        return store.setSchema({
            cars: {
                fields: { color: 'string' },
                indexes: {
                    // @ts-expect-error: invalid input on purpose
                    first: {
                        fields: [ 'color' ]
                    }
                }
            }
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'setSchema',
                err: 'invalidSchema',
                reason: 'Invalid or missing index unique definition'
            });
        });
    });

    it('Invalid fields property in index definition', function() {
        return store.setSchema({
            cars: {
                fields: { color: 'string' },
                indexes: {
                    first: {
                        unique: true,
                        // @ts-expect-error: invalid input on purpose
                        fields: 'color'
                    }
                }
            }
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'setSchema',
                err: 'invalidSchema',
                reason: 'Invalid or missing index fields definition'
            });
        });
    });

    it('Invalid fields property in index definition', function() {
        return store.setSchema({
            cars: {
                fields: { color: 'string' },
                indexes: {
                    first: {
                        unique: true,
                        fields: []
                    }
                }
            }
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'setSchema',
                err: 'invalidSchema',
                reason: 'Invalid or missing index fields definition'
            });
        });
    });

    it('Invalid field name in index definition', function() {
        return store.setSchema({
            cars: {
                fields: { color: 'string' },
                indexes: {
                    first: {
                        unique: true,
                        fields: [ 'color', 'mileage' ]
                    }
                }
            }
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'setSchema',
                err: 'invalidSchema',
                reason: 'Invalid index field name: \'mileage\''
            });
        });
    });

    it('Invalid field definition property definition', function() {
        return store.setSchema({
            cars: {
                fields: { color: 'string' },
                indexes: {
                    first: {
                        unique: true,
                        // @ts-expect-error: invalid input on purpose
                        fields: [ { name: 'color', caseInSensitive: false } ]
                    }
                }
            }
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'setSchema',
                err: 'invalidSchema',
                reason: 'Invalid index field property: \'caseInSensitive\''
            });
        });
    });

    it('Valid parameters don\'t throw', function() {
        return store.setSchema({
            cars: {
                fields: {
                    color: 'string',
                    year: 'int',
                    '9-convertible_32': 'boolean',
                    purchaseDate: 'date',
                    created: 'timestamp'
                },
                indexes: {
                    date: {
                        unique: true,
                        fields: [ { name: 'purchaseDate' } ]
                    },
                    details: {
                        unique: false,
                        fields: [ 'color', 'year', '9-convertible_32' ]
                    }
                }
            }
        }).then(function(result) {
            expect(result).to.equal(undefined);
        });
    });

    it('Set Schema can\'t be modified', function() {
        store = new RigidDB('baz', 42, redisOpts);

        return store.setSchema({
            cars: {
                fields: {
                    color: 'string',
                    purchaseDate: 'date'
                },
                indexes: {
                    first: {
                        unique: true,
                        fields: [ 'purchaseDate' ]
                    }
                }
            }
        }).then(function(result) {
            expect(result).to.equal(undefined);

            return store.setSchema({
                cars: {
                    fields: {
                        color: 'string',
                        purchaseDate: 'date',
                        make: 'string'
                    },
                    indexes: {
                        first: {
                            unique: true,
                            fields: [ 'purchaseDate' ]
                        }
                    }
                }
            });
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'setSchema',
                err: 'schemaExists'
            });
        });
    });
});
