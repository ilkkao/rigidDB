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
});
