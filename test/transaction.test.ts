import { expect } from 'chai';
import { RigidDB } from '../src/index.ts';
import { redisClient, redisOpts, errorDetails, shouldNotResolve } from './helpers.ts';

let store: RigidDB;

describe('Transaction', function() {
    beforeEach(function() {
        store = new RigidDB('foo', 42, redisOpts);

        return redisClient.flushdb().then(function() {
            return store.setSchema({
                car: {
                    fields: {
                        color: 'string',
                        mileage: 'int',
                        convertible: 'boolean',
                        purchaseDate: 'date'
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
        });
    });

    it('empty transaction', function() {
        return store.transaction(function() {}).then(function(result) {
            expect(result).to.deep.equal([]);
        });
    });

    it('transaction containing invalid create', function() {
        return store.transaction(function(tr) {
            tr.create('car', { color: 'black' });
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                err: 'missingFields',
                method: 'create'
            });
        });
    });

    it('transaction', function() {
        return store.transaction(function(tr) {
            tr.create('car', {
                color: 'red',
                mileage: 42,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
            tr.update('car', 1, { color: 'white' });
            tr.get('car', 1);
        }).then(function(result) {
            expect(result).to.deep.equal([ 1, 1, {
                color: 'white',
                mileage: 42,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            } ]);

            return redisClient.hgetall('foo-42:car:1');
        }).then(function(result) {
            expect(result).to.deep.equal({
                color: 'white',
                mileage: '42',
                convertible: 'true',
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)').toISOString()
            });

            return redisClient.zrange('foo-42:car:ids', 0, '-1');
        }).then(function(result) {
            expect(result).to.deep.equal([ '1' ]);

            return redisClient.get('foo-42:car:nextid');
        }).then(function(result) {
            expect(result).to.equal('1');

            return redisClient.hgetall('foo-42:car:i:purchaseDate');
        }).then(function(result) {
            const dateResult: Record<string, string> = {};
            dateResult[new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)').toISOString().replace(/:/g, '::')] = '1';
            expect(result).to.deep.equal(dateResult);

            return redisClient.hget('foo-42:car:i:color:convertible:mileage', 'white:true:42');
        }).then(function(result) {
            expect(result).to.deep.equal('1');

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(6);
        });
    });

    it('create delete', function() {
        return store.transaction(function(tr) {
            tr.create('car', {
                color: 'red',
                mileage: 42,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
            tr.delete('car', 1);
        }).then(function(result) {
            expect(result).to.deep.equal([ 1, undefined ]);

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(2);
        });
    });

    it('failed exists cancels transaction', function() {
        return store.transaction(function(tr) {
            tr.exists('car', 1);
            tr.create('car', {
                color: 'red',
                mileage: 42,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'exists',
                err: 'notFound'
            });

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(1);
        });
    });

    it('failed create cancels transaction', function() {
        return store.transaction(function(tr) {
            tr.create('bikes', {
                color: 'red',
                mileage: 42,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
            tr.create('car', {
                color: 'red',
                mileage: 42,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'create',
                err: 'unknownCollection'
            });

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(1);
        });
    });

    it('transaction before setSchema fails', function() {
        store = new RigidDB('bar', 42, redisOpts);

        return store.transaction(function() {}).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'transaction',
                err: 'schemaMissing'
            });
        });
    });
});
