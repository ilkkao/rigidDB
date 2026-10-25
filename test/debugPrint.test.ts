import { expect } from 'chai';
import { RigidDB } from '../src/index.ts';
import { redisClient, redisOpts } from './helpers.ts';

let store: RigidDB;

describe('DebugPrint', function() {
    beforeEach(function() {
        return redisClient.flushdb().then(function() {
            store = new RigidDB('foo', 42, redisOpts);

            return store.setSchema({
                cars: {
                    definition: {
                        color: { type: 'string', allowNull: true },
                        mileage: 'int',
                        convertible: 'boolean',
                        purchaseDate: 'date',
                        serviceDate: 'timestamp',
                        extra: 'string'
                    },
                    indices: {
                        first: {
                            uniq: true,
                            fields: [ 'purchaseDate', 'color' ]
                        },
                        second: {
                            uniq: false,
                            fields: [ 'color', 'mileage', 'convertible' ]
                        }
                    }
                }
            });
        }).then(function() {
            return store.create('cars', {
                color: null,
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)'),
                serviceDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)'),
                extra: '~'
            });
        }).then(function() {
            return store.create('cars', {
                color: 'blue',
                mileage: 12345,
                convertible: true,
                purchaseDate: new Date('Sun Nov 01 2015 22:41:24 GMT+0100 (CET)'),
                serviceDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)'),
                extra: '~~~'
            });
        });
    });

    it('Prints collection', function() {
        console.table = function(params) { // eslint-disable-line no-console
            expect(params).to.deep.equal([
                {
                    color: '[NULL]',
                    extra: '"~"',
                    id: '1',
                    mileage: '12345',
                    convertible: 'true',
                    purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)').toISOString(),
                    serviceDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)').toISOString()
                }, {
                    color: '"blue"',
                    extra: '"~~~"',
                    id: '2',
                    mileage: '12345',
                    convertible: 'true',
                    purchaseDate: new Date('Sun Nov 01 2015 22:41:24 GMT+0100 (CET)').toISOString(),
                    serviceDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0100 (CET)').toISOString()
                }
            ]);
        };


        return store.debugPrint('cars').then(function() {
        });
    });
});
