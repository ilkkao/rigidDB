import { expect } from 'chai';
import { RigidDB } from '../src/index.ts';
import { redisClient, redisOpts } from './helpers.ts';

let store: RigidDB;

describe('SetSchema', function() {
    beforeEach(function() {
        return redisClient.flushdb().then(function() {
            store = new RigidDB('foo', 42, redisOpts);
        });
    });

    it('Missing schema parameter', function() {
        // @ts-expect-error: invalid input on purpose
        return store.setSchema().then(function(result) {
            expect(result).to.deep.equal({
                method: 'setSchema',
                reason: 'Invalid schema.',
                val: false
            });
        });
    });

    it('Circular reference', function() {
        let schema = {};
        // @ts-expect-error: invalid input on purpose
        schema.schema = schema;

        return store.setSchema(schema).then(function(result) {
            expect(result).to.deep.equal({
                method: 'setSchema',
                reason: 'Invalid schema.',
                val: false
            });
        });
    });

    it('Zero collections', function() {
        return store.setSchema({}).then(function(result) {
            expect(result).to.deep.equal({
                method: 'setSchema',
                reason: 'At least one collection must be defined.',
                val: false
            });
        });
    });

    it('Missing collection fields', function() {
        // @ts-expect-error: invalid input on purpose
        return store.setSchema({ cars: {} }).then(function(result) {
            expect(result).to.deep.equal({
                method: 'setSchema',
                reason: 'Fields missing.',
                val: false
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
        }).then(function(result) {
            expect(result).to.deep.equal({
                method: 'setSchema',
                reason: 'Invalid field name (letters, numbers, and dashes allowed): \'co:lor\'',
                val: false
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
        }).then(function(result) {
            expect(result).to.deep.equal({
                method: 'setSchema',
                reason: 'Invalid type: \'wrong\'',
                val: false
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
        }).then(function(result) {
            expect(result).to.deep.equal({
                method: 'setSchema',
                reason: 'Type definition missing.',
                val: false
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
        }).then(function(result) {
            expect(result).to.deep.equal({
                method: 'setSchema',
                reason: 'Invalid or missing index unique definition',
                val: false
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
        }).then(function(result) {
            expect(result).to.deep.equal({
                method: 'setSchema',
                reason: 'Invalid or missing index fields definition',
                val: false
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
        }).then(function(result) {
            expect(result).to.deep.equal({
                method: 'setSchema',
                reason: 'Invalid or missing index fields definition',
                val: false
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
        }).then(function(result) {
            expect(result).to.deep.equal({
                method: 'setSchema',
                reason: 'Invalid index field name: \'mileage\'',
                val: false
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
        }).then(function(result) {
            expect(result).to.deep.equal({
                method: 'setSchema',
                reason: 'Invalid index field property: \'caseInSensitive\'',
                val: false
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
            expect(result).to.deep.equal({
                val: true
            });
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
            expect(result).to.deep.equal({
                val: true
            });

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
        }).then(function(result) {
            expect(result).to.deep.equal({
                method: 'setSchema',
                reason: 'Schema already exists',
                val: false
            });
        });
    });
});
