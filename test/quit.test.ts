import { expect } from 'chai';
import { RigidDB } from '../src/index.ts';
import { redisOpts } from './helpers.ts';

let store: RigidDB;

describe('Quit', function() {
    it('exists succesfully', function() {
        store = new RigidDB('foo', 42, redisOpts);

        return store.quit().then(function(result) {
            expect(result).to.equal('OK');
        });
    });
});
