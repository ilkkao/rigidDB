'use strict';

const expect = require('chai').expect,
      RigidDB = require('../index');

let store;

describe('Quit', function() {
    it('exists succesfully', function() {
        store = new RigidDB('foo');

        return store.quit().then(function(result) {
            expect(result).to.equal('OK');
        });
    });
});
