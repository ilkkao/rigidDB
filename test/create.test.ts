import { expect } from 'chai';
import { RigidDB } from '../src/index.ts';
import { redisClient, redisOpts, errorDetails, shouldNotResolve } from './helpers.ts';

let store: RigidDB;

describe('Create', function() {
    beforeEach(function() {
        store = new RigidDB('foo', 42, redisOpts, () => {});

        return redisClient.flushdb().then(function() {
            return redisClient.script('FLUSH');
        }).then(function() {
            return store.setSchema({
                car: {
                    fields: {
                        color: { type: 'string', allowNull: true },
                        mileage: { type: 'int', allowNull: false },
                        convertible: 'boolean',
                        purchaseDate: 'timestamp'
                    },
                    indexes: {
                        first: {
                            unique: true,
                            fields: [ 'purchaseDate' ]
                        },
                        second: {
                            unique: false,
                            fields: [ 'color', 'mileage', 'convertible' ]
                        },
                        third: {
                            unique: true,
                            fields: [ 'mileage', 'color' ]
                        }
                    }
                }
            });
        }).then(function(result) {
            expect(result).to.equal(undefined);
        });
    });

    it('Fails if collection is missing', function() {
        return store.create('bikes', {
            color: 'blue',
            mileage: 12345,
            convertible: true
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'create',
                err: 'unknownCollection'
            });
        });
    });

    it('Fails if not all parameters are given', function() {
        return store.create('car', {
            color: 'blue',
            mileage: 12345,
            convertible: true
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'create',
                err: 'missingFields'
            });
        });
    });

    it('Fails if unique index would not be unique', function() {
        return store.create('car', {
            color: 'blue',
            mileage: 12345,
            convertible: true,
            purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
        }).then(function(result) {
            expect(result).to.deep.equal(1);

            return store.create('car', {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'create',
                err: 'notUnique',
                indexes: [ 'first', 'third' ]
            });
        });
    });

    it('Succeeds if unique index value case differs', function() {
        return store.create('car', {
            color: 'blue',
            mileage: 12345,
            convertible: true,
            purchaseDate: new Date('Sun Nov 01 2015 18:41:24 GMT+0100 (CET)')
        }).then(function(result) {
            expect(result).to.deep.equal(1);

            return store.create('car', {
                color: 'Blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        }).then(function(result) {
            expect(result).to.deep.equal(2);
        });
    });

    it('Fails if unique index value matches when caseInSensitive is true', function() {
        store = new RigidDB('baz', 42, redisOpts);

        return store.setSchema({
            car: {
                fields: {
                    color: { type: 'string', allowNull: true },
                    mileage: { type: 'int', allowNull: false },
                    convertible: 'boolean',
                    purchaseDate: 'date'
                },
                indexes: {
                    third: {
                        unique: true,
                        fields: [ 'mileage', { name: 'color', caseInsensitive: true } ]
                    }
                }
            }
        }).then(function(result) {
            expect(result).to.equal(undefined);

            return store.create('car', {
                color: 'white',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0000 (UTC)')
            }).then(function(createResult) {
                expect(createResult).to.deep.equal(1);

                return store.create('car', {
                    color: 'WHITE',
                    mileage: 12345,
                    convertible: true,
                    purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
                });
            }).then(shouldNotResolve, function(createResult) {
                expect(errorDetails(createResult)).to.deep.equal({
                    err: 'notUnique',
                    indexes: [ 'third' ],
                    method: 'create'
                });
            });
        });
    });

    it('Redis is updated correctly', function() {
        return store.create('car', {
            color: 'blue',
            mileage: 12345,
            convertible: true,
            purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0000 (UTC)')
        }).then(function(result) {
            expect(result).to.deep.equal(1);

            return redisClient.hgetall('foo-42:car:1');
        }).then(function(result) {
            expect(result).to.deep.equal({
                color: 'blue',
                mileage: '12345',
                convertible: 'true',
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0000 (UTC)').getTime().toString()
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
            dateResult[new Date('Sun Nov 01 2015 17:41:24 GMT+0000 (UTC)').getTime().toString().replace(/:/g, '::')] = '1';
            expect(result).to.deep.equal(dateResult);

            return redisClient.hget('foo-42:car:i:color:convertible:mileage', 'blue:true:12345');
        }).then(function(result) {
            expect(result).to.deep.equal('1');

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(7);
        });
    });

    it('Redis is updated correctly when indexes change from hash to set', function() {
        store = new RigidDB('bar', 42, redisOpts);

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
                        unique: false,
                        fields: [ 'mileage' ]
                    }
                }
            }
        }).then(function(result) {
            expect(result).to.equal(undefined);

            return store.create('car', {
                color: 'white',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0000 (UTC)')
            });
        }).then(function() {
            return redisClient.hgetall('bar-42:car:i:mileage');
        }).then(function(result) {
            expect(result).to.deep.equal({ '12345': '1' });

            return redisClient.smembers('bar-42:car:i:mileage:12345');
        }).then(function(result) {
            expect(result).to.deep.equal([]);

            return store.create('car', {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 18:41:24 GMT+0000 (UTC)')
            });
        }).then(function() {
            return redisClient.hgetall('bar-42:car:i:mileage');
        }).then(function(result) {
            expect(result).to.deep.equal({});

            return redisClient.smembers('bar-42:car:i:mileage:12345');
        }).then(function(result) {
            expect(result).to.deep.equal([ '1', '2' ]);

            return store.create('car', {
                color: 'red',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 19:41:24 GMT+0000 (UTC)')
            });
        }).then(function() {
            return redisClient.hgetall('bar-42:car:i:mileage');
        }).then(function(result) {
            expect(result).to.deep.equal({});

            return redisClient.smembers('bar-42:car:i:mileage:12345');
        }).then(function(result) {
            expect(result).to.deep.equal([ '1', '2', '3' ]);

            return store.delete('car', 3);
        }).then(function() {
            return store.delete('car', 1);
        }).then(function() {
            return redisClient.hgetall('bar-42:car:i:mileage');
        }).then(function(result) {
            expect(result).to.deep.equal({ '12345': '2' });

            return redisClient.smembers('bar-42:car:i:mileage:12345');
        }).then(function(result) {
            expect(result).to.deep.equal([]);

            return store.delete('car', 2);
        }).then(function() {
            return redisClient.hgetall('bar-42:car:i:mileage');
        }).then(function(result) {
            expect(result).to.deep.equal({});

            return redisClient.smembers('bar-42:car:i:mileage:12345');
        }).then(function(result) {
            expect(result).to.deep.equal([]);
        });
    });

    it('Succeeds if the schema is set earlier', function() {
        let secondStore = new RigidDB('foo', 42, redisOpts);

        return secondStore.create('car', {
            color: 'white',
            mileage: 12345,
            convertible: true,
            purchaseDate: new Date('Sun Nov 15 2015 17:41:24 GMT+0000 (UTC)')
        }).then(function(result) {
            expect(result).to.deep.equal(1);
        });
    });

    it('Fails if the schema is not set', function() {
        let secondStore = new RigidDB('baz', 42, redisOpts);

        return secondStore.create('car', {
            color: 'white',
            mileage: 12345,
            convertible: true,
            purchaseDate: new Date('Sun Nov 15 2015 17:41:24 GMT+0000 (UTC)')
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'create',
                err: 'schemaMissing'
            });
        });
    });

    it('Fails if the value is null', function() {
        return store.create('car', {
            color: 'blue',
            mileage: null,
            convertible: true,
            purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0000 (UTC)')
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'create',
                err: 'nullNotAllowed'
            });
        });
    });

    it('Handles invalid date correctly', function() {
        return store.create('car', {
            color: 'blue',
            mileage: 1234,
            convertible: true,
            purchaseDate: 'just a string'
        }).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'create',
                err: 'wrongType'
            });
        });
    });
});
