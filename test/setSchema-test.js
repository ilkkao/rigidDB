'use strict';

const expect = require('chai').expect,
      Redis = require('ioredis'),
      ObjectStore = require('../index');

let store = new ObjectStore('foo', { db: 15 });

describe('SetSchema', function() {
    it('Missing schema parameter', function() {
        return store.setSchema().then(function(result) {
            expect(result).to.deep.equal({
                command: 'SETSCHEMA',
                reason: 'Invalid schema.',
                val: false
            });
        });
    });

    it('Zero collections', function() {
        return store.setSchema({}).then(function(result) {
            expect(result).to.deep.equal({
                command: 'SETSCHEMA',
                reason: 'At least one collection must be defined.',
                val: false
            });
        });
    });

    it('Missing collection definition', function() {
        return store.setSchema({ cars: {} }).then(function(result) {
            expect(result).to.deep.equal({
                command: 'SETSCHEMA',
                reason: 'Definition missing.',
                val: false
            });
        });
    });

    it('Invalid collection field name', function() {
        return store.setSchema({
            cars: {
                definition: {
                    'co:lor': 'string'
                }
            }
        }).then(function(result) {
            expect(result).to.deep.equal({
                command: 'SETSCHEMA',
                reason: 'Invalid field name: \'co:lor\'',
                val: false
            });
        });
    });

    it('Invalid collection field type', function() {
        return store.setSchema({
            cars: {
                definition: {
                    color: 'wrong'
                }
            }
        }).then(function(result) {
            expect(result).to.deep.equal({
                command: 'SETSCHEMA',
                reason: 'Invalid type: \'wrong\'',
                val: false
            });
        });
    });

    it('Missing unique property in index definition', function() {
        return store.setSchema({
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
                command: 'SETSCHEMA',
                reason: 'Invalid or missing index unique definition',
                val: false
            });
        });
    });

    it('Invalid field name in index definition', function() {
        return store.setSchema({
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
                command: 'SETSCHEMA',
                reason: 'Invalid index field: \'mileage\'',
                val: false
            });
        });
    });

    it('Valid parameters don\'t throw', function() {
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
                    date: {
                        uniq: true,
                        fields: [ 'purchaseDate' ]
                    },
                    details: {
                        uniq: false,
                        fields: [ 'color', 'year', 'convertible' ]
                    }
                }
            }
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: 'fb916f33124621b821306571fcd9009199a55aec'
            });
        });
    });

    it('Same schema can be set twice', function() {
        store = new ObjectStore('bar', { db: 15 });

        return store.setSchema({
            cars: {
                definition: {
                    color: 'string',
                    purchaseDate: 'date',
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
                val: '86e891bf17af68dbf1d91404040ebfd63f6dea9a'
            });

            return store.setSchema({
                cars: {
                    definition: {
                        color: 'string',
                        purchaseDate: 'date',
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
                val: '86e891bf17af68dbf1d91404040ebfd63f6dea9a'
            });
        });
    });

    it('Set Schema can\'t be modified', function() {
        store = new ObjectStore('baz', { db: 15 });

        return store.setSchema({
            cars: {
                definition: {
                    color: 'string',
                    purchaseDate: 'date',
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
                val: '86e891bf17af68dbf1d91404040ebfd63f6dea9a'
            });

            return store.setSchema({
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
                command: 'SETSCHEMA',
                reason: 'Schema already exists',
                val: false
            });
        });
    });
});
