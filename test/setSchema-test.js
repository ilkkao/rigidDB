'use strict';

const expect = require('chai').expect,
    RigidDB = require('../index');

let store = new RigidDB('foo', { db: 15 });

describe('SetSchema', function() {
    it('Missing schema parameter', function() {
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
        schema.schema = schema;

        return store.setSchema(1, schema).then(function(result) {
            expect(result).to.deep.equal({
                method: 'setSchema',
                reason: 'Invalid schema.',
                val: false
            });
        });
    });

    it('Zero collections', function() {
        return store.setSchema(1, {}).then(function(result) {
            expect(result).to.deep.equal({
                method: 'setSchema',
                reason: 'At least one collection must be defined.',
                val: false
            });
        });
    });

    it('Missing collection definition', function() {
        return store.setSchema(1, { cars: {} }).then(function(result) {
            expect(result).to.deep.equal({
                method: 'setSchema',
                reason: 'Definition missing.',
                val: false
            });
        });
    });

    it('Invalid collection field name', function() {
        return store.setSchema(1, {
            cars: {
                definition: {
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
        return store.setSchema(1, {
            cars: {
                definition: {
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
        return store.setSchema(1, {
            cars: {
                definition: {
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
        return store.setSchema(1, {
            cars: {
                definition: { color: 'string' },
                indices: {
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
        return store.setSchema(1, {
            cars: {
                definition: { color: 'string' },
                indices: {
                    first: {
                        uniq: true,
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
        return store.setSchema(1, {
            cars: {
                definition: { color: 'string' },
                indices: {
                    first: {
                        uniq: true,
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
        return store.setSchema(1, {
            cars: {
                definition: { color: 'string' },
                indices: {
                    first: {
                        uniq: true,
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
        return store.setSchema(1, {
            cars: {
                definition: { color: 'string' },
                indices: {
                    first: {
                        uniq: true,
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
        return store.setSchema(1, {
            cars: {
                definition: {
                    color: 'string',
                    year: 'int',
                    '9-convertible_32': 'boolean',
                    purchaseDate: 'date',
                    created: 'timestamp'
                },
                indices: {
                    date: {
                        uniq: true,
                        fields: [ { name: 'purchaseDate' } ]
                    },
                    details: {
                        uniq: false,
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
        store = new RigidDB('baz', { db: 15 });

        return store.setSchema(1, {
            cars: {
                definition: {
                    color: 'string',
                    purchaseDate: 'date'
                },
                indices: {
                    first: {
                        uniq: true,
                        fields: [ 'purchaseDate' ]
                    }
                }
            }
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: true
            });

            return store.setSchema(1, {
                cars: {
                    definition: {
                        color: 'string',
                        purchaseDate: 'date',
                        make: 'string'
                    },
                    indices: {
                        first: {
                            uniq: true,
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
