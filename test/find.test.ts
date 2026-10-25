import { expect } from 'chai';
import { RigidDB } from '../src/index.ts';
import { redisClient, redisOpts, errorDetails, shouldNotResolve } from './helpers.ts';

let store: RigidDB;

describe('Find', function() {
    beforeEach(function() {
        return redisClient.flushdb().then(function() {
            store = new RigidDB('foo', 42, redisOpts);

            return store.setSchema({
                car: {
                    fields: {
                        color: { type: 'string', allowNull: true },
                        mileage: { type: 'int', allowNull: false },
                        convertible: 'boolean',
                        purchaseDate: 'date'
                    },
                    indexes: {
                        first: {
                            unique: true,
                            fields: [ 'purchaseDate', 'color' ]
                        },
                        second: {
                            unique: false,
                            fields: [ 'color', 'mileage', 'convertible' ]
                        }
                    }
                }
            });
        }).then(function() {
            return store.create('car', {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        }).then(function() {
            return store.create('car', {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 22:41:24 GMT+0100 (CET)')
            });
        }).then(function() {
            return store.create('car', {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 23:41:24 GMT+0100 (CET)')
            });
        });
    });

    it('Fails if no index', function() {
        return store.find('car', {
            color: 'red'
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                err: 'unknownIndex',
                method: 'find'
            });
        });
    });

    it('Fails if null when null is not allowed', function() {
        return store.find('car', {
            color: 'white',
            mileage: null,
            convertible: false
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'find',
                err: 'nullNotAllowed'
            });
        });
    });

    it('Return empty array', function() {
        return store.find('car', {
            color: 'blue',
            mileage: 12346,
            convertible: true
        }).then(function(result) {
            expect(result).to.deep.equal([]);
        });
    });

    it('Succeeds', function() {
        return store.find('car', {
            color: 'blue',
            mileage: 12345,
            convertible: true
        }).then(function(result) {
            expect(result).to.deep.equal([ 1, 2, 3 ]);
        });
    });

    it('Succeeds to find null values', function() {
        return store.create('car', {
            color: null,
            mileage: 12345,
            convertible: true,
            purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
        }).then(function() {
            return store.create('car', {
                color: null,
                mileage: 12346,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        }).then(function() {
            return store.find('car', {
                color: null,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        }).then(function(result) {
            expect(result).to.deep.equal([ 4, 5 ]);
        });
    });
});
