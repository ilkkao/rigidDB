import { expect } from 'chai';
import { RigidDB } from '../src/index.ts';
import { redisClient, redisOpts, errorDetails, shouldNotResolve } from './helpers.ts';

let store: RigidDB;
let id: number;

describe('Update', function() {
    beforeEach(function() {
        store = new RigidDB('foo', 42, redisOpts);

        return redisClient.flushdb().then(function() {
            return store.setSchema({
                car: {
                    fields: {
                        color: 'string',
                        mileage: { type: 'int', allowNull: false },
                        convertible: 'boolean',
                        purchaseDate: { type: 'date', allowNull: true }
                    },
                    indexes: {
                        first: {
                            unique: true,
                            fields: [ 'purchaseDate' ]
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
        }).then(function(result) {
            id = result;
        });
    });

    it('Fails if id doesn\'t exists', function() {
        return store.update('car', 42, {
            color: 'red'
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'update',
                err: 'notFound'
            });
        });
    });

    it('Fails if unique index would not be unique', function() {
        return store.create('car', {
            color: 'black',
            mileage: 10,
            convertible: false,
            purchaseDate: new Date('Wed Nov 11 2015 18:29:45 GMT+0100 (CET)')
        }).then(function(result) {
            expect(result).to.deep.equal(2);

            return store.update('car', id, {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Wed Nov 11 2015 18:29:45 GMT+0100 (CET)')
            });
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'update',
                err: 'notUnique',
                indexes: [ 'first' ]
            });
        });
    });

    it('Can be updated with the identical values', function() {
        return store.update('car', id, {
            color: 'blue',
            mileage: 12345,
            convertible: true,
            purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
        }).then(function(result) {
            expect(result).to.deep.equal(0);
        });
    });

    it('Redis is updated correctly', function() {
        return store.update('car', id, {
            color: 'red',
            mileage: 4242,
            convertible: true,
            purchaseDate: new Date('Wed Nov 11 2015 18:19:56 GMT+0100 (CET)'),
            foobar: new Date(NaN) // Properties not in schema are ignored
        }).then(function(result) {
            expect(result).to.deep.equal(3);

            return redisClient.hgetall('foo-42:car:1');
        }).then(function(result) {
            expect(result).to.deep.equal({
                color: 'red',
                mileage: '4242',
                convertible: 'true',
                purchaseDate: new Date('Wed Nov 11 2015 18:19:56 GMT+0100 (CET)').toISOString()
            });

            return redisClient.zrange('foo-42:car:ids', 0, '-1');
        }).then(function(result) {
            expect(result).to.deep.equal([ id.toString() ]);

            return redisClient.get('foo-42:car:nextid');
        }).then(function(result) {
            expect(result).to.equal(id.toString());

            return redisClient.hgetall('foo-42:car:i:purchaseDate');
        }).then(function(result) {
            const dateResult: Record<string, string> = {};
            dateResult[new Date('Wed Nov 11 2015 18:19:56 GMT+0100 (CET)').toISOString().replace(/:/g, '::')] = '1';
            expect(result).to.deep.equal(dateResult);

            return redisClient.hget('foo-42:car:i:color:convertible:mileage', 'red:true:4242');
        }).then(function(result) {
            expect(result).to.deep.equal(id.toString());

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(6);
        });
    });

    it('Fails if null attribute is not allowed', function() {
        return store.update('car', id, {
            color: 'red',
            mileage: null,
            convertible: false,
            purchaseDate: new Date('Wed Nov 11 2015 18:19:56 GMT+0100 (CET)')
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'update',
                err: 'nullNotAllowed'
            });
        });
    });

    it('Succeeds if null attribute is allowed', function() {
        return store.update('car', id, {
            color: 'red',
            mileage: 1.3,
            convertible: false,
            purchaseDate: null
        }).then(function(result) {
            expect(result).to.deep.equal(4);
        });
    });

});
