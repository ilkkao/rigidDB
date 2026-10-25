import { expect } from 'chai';
import { RigidDB } from '../src/index.ts';
import { redisClient, redisOpts, errorDetails, shouldNotResolve } from './helpers.ts';

let store: RigidDB;
let id: number;

describe('Get', function() {
    beforeEach(function() {
        return redisClient.flushdb().then(function() {
            store = new RigidDB('foo', 42, redisOpts);

            return store.setSchema({
                car: {
                    fields: {
                        color: { type: 'string', allowNull: true },
                        test: 'string',
                        mileage: 'int',
                        convertible: 'boolean',
                        purchaseDate: 'date',
                        purchaseTs: 'timestamp'
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
                color: null,
                test: '~',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)'),
                purchaseTs: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
            });
        }).then(function(result) {
            id = result;
        });
    });

    it('Fails if id doesn\'t exist', function() {
        return store.get('car', 4242).then(shouldNotResolve, function(result) {
            expect(errorDetails(result)).to.deep.equal({
                method: 'get',
                err: 'notFound'
            });

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(6);
        });
    });

    it('Succeeds if id exists', function() {
        return store.get('car', id).then(function(result) {
            expect(result).to.deep.equal({
                    color: null,
                    test: '~',
                    mileage: 12345,
                    convertible: true,
                    purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)'),
                    purchaseTs: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)')
                });

            return redisClient.keys('*');
        }).then(function(result) {
            expect(result).to.have.length(6);
        });
    });
});
