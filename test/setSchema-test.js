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
                indices: [{
                    fields: [ 'color' ]
                }]
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
                indices: [{
                    uniq: true,
                    fields: [ 'color', 'mileage' ]
                }]
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
                indices: [{
                    uniq: true,
                    fields: [ 'purchaseDate' ]
                }, {
                    uniq: false,
                    fields: [ 'color', 'year', 'convertible' ]
                }]
            }
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: '8f8e7f3a957940ba9f1e04483485a18a12071652'
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
                indices: [{
                    uniq: true,
                    fields: [ 'purchaseDate' ]
                }]
            }
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: 'c4d1e63c21175dd62bf576509ef50f45df3eef92'
            });

            return store.setSchema({
                cars: {
                    definition: {
                        color: 'string',
                        purchaseDate: 'date',
                    },
                    indices: [{
                        uniq: true,
                        fields: [ 'purchaseDate' ]
                    }]
                }
            });
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: 'c4d1e63c21175dd62bf576509ef50f45df3eef92'
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
                indices: [{
                    uniq: true,
                    fields: [ 'purchaseDate' ]
                }]
            }
        }).then(function(result) {
            expect(result).to.deep.equal({
                val: 'c4d1e63c21175dd62bf576509ef50f45df3eef92'
            });

            return store.setSchema({
                cars: {
                    definition: {
                        color: 'string',
                        purchaseDate: 'date',
                        make: 'string'
                    },
                    indices: [{
                        uniq: true,
                        fields: [ 'purchaseDate' ]
                    }]
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
