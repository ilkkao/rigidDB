'use strict';

const expect = require('chai').expect,
      ObjectStore = require('../index');

describe('Constructor', function() {
    it('Missing prefix parameter throws', function() {
        expect(function() {
            new ObjectStore();
        }).to.throw('Invalid prefix.');
    });

    it('Invalid prefix parameter throws', function() {
        expect(function() {
            new ObjectStore('!notvalid');
        }).to.throw('Invalid prefix.');
    });
});
