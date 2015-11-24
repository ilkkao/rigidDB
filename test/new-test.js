'use strict';

const expect = require('chai').expect,
      Redis = require('ioredis'),
      RigidDB = require('../index');

let redisClient = new Redis({
    db: 15
});

describe('Constructor', function() {
    it('Missing prefix parameter throws', function() {
        expect(function() {
            new RigidDB();
        }).to.throw('Invalid prefix.');
    });

    it('Invalid prefix parameter throws', function() {
        expect(function() {
            new RigidDB('!notvalid');
        }).to.throw('Invalid prefix.');
    });

    it('Invalid existing schema causes error', function() {
        return redisClient.flushdb().then(function() {
            return redisClient.set('foo:_schema', 'whatwhat');
        }).then(function() {
            let store = new RigidDB('foo', {
                db: 15
            });

            return store.create('cars', {});
        }).then(function(result) {
            expect(result).to.deep.equal({
                err: 'badSavedSchema',
                method: 'create',
                val: false
            });
        });
    });

    it('Invalid existing schema causes error', function() {
        return redisClient.flushdb().then(function() {
            return redisClient.set('foo:_schema', '{ "cars": {} }');
        }).then(function() {
            let store = new RigidDB('foo', {
                db: 15
            });

            return store.create('cars', {});
        }).then(function(result) {
            expect(result).to.deep.equal({
                err: 'badSavedSchema',
                method: 'create',
                val: false
            });
        });
    });

    it('Invalid existing schema causes error for multi', function() {
        return redisClient.flushdb().then(function() {
            return redisClient.set('foo:_schema', '{ "cars": {} }');
        }).then(function() {
            let store = new RigidDB('foo', {
                db: 15
            });

            return store.multi(function(tr) {
                tr.create('cars', { color: 'black' });
            });
        }).then(function(result) {
            expect(result).to.deep.equal({
                err: 'badSavedSchema',
                method: 'multi',
                val: false
            });
        });
    });
});
