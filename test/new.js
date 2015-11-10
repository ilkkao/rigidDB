'use strict';

const expect = require('chai').expect,
      ObjectStore = require('../index');

describe('Create', function() {
    it("Missing prefix parameter throws", function() {
        expect(function() {
            new ObjectStore();
        }).to.throw('Invalid prefix.');
    });

    it("Invalid prefix parameter throws", function() {
        expect(function() {
            new ObjectStore('!notvalid');
        }).to.throw('Invalid prefix.');
    });

    it("Missing schema parameter throws", function() {
        expect(function() {
            new ObjectStore('foo');
        }).to.throw('Invalid schema.');
    });

    it("Zero collections throws", function() {
        expect(function() {
            new ObjectStore('foo', {});
        }).to.throw('At least one collection must be defined.');
    });

    it("Missing collection definition throws", function() {
        expect(function() {
            new ObjectStore('foo', { cars: {} });
        }).to.throw('Definition missing.');
    });

    it("Invalid collection field name throws", function() {
        expect(function() {
            new ObjectStore('foo', { cars: { definition: { 'co:lor': 'string' }} });
        }).to.throw('Invalid field name: \'co:lor\'');
    })

    it("Invalid collection field type throws", function() {
        expect(function() {
            new ObjectStore('foo', { cars: { definition: { color: 'wrong' }} });
        }).to.throw('Invalid type: \'wrong\'');
    });

    it("Missing unique property in index definition throws", function() {
        expect(function() {
            new ObjectStore('foo', {
                cars: {
                    definition: { color: 'string' },
                    indices: [{
                        fields: [ 'color' ]
                    }]
                }
            });
        }).to.throw('Invalid or missing index unique definition');
    });

    it("Invalid field name in index definition throws", function() {
        expect(function() {
            new ObjectStore('foo', {
                cars: {
                    definition: { color: 'string' },
                    indices: [{
                        uniq: true,
                        fields: [ 'color', 'mileage' ]
                    }]
                }
            });
        }).to.throw('Invalid index field: \'mileage\'');
    });
});
