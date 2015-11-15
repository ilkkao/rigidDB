'use strict';

const expect = require('chai').expect,
      ObjectStore = require('../index');

let store;

describe('Quit', function() {
    it('exists succesfully', function() {
        store = new ObjectStore('foo');

        return store.quit().then(function(result) {
            expect(result).to.equal('OK');
        });
    });
});
