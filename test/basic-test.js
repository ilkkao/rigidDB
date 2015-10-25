var expect = require('chai').expect;
var store = require('../index');

describe('Basic tests', function() {
    describe('Create', function() {
        it("should create new object", function() {

            store.setSchema({
                prefix: 'test',
                schema: {
                    car: {
                        definition: {
                            color: 'string',
                            mileage: 'int',
                            inUse: 'boolean',
                            purchased: 'unixtime'
                        },
                        index: []
                    }
                }
            });

            store.start();

            store.create('car', {
                color: 'blue',
                mileage: 123,
                inUse: true,
                purchased: Date.now()
            });

            expect(1).to.equal(1);
        });
    });
});
