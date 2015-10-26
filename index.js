'use strict';

const Redis = require('ioredis');

let client = null;
let prefix = '';
let schema = {};
let api = {};

exports.setSchema = function(definition) {
    prefix = definition.prefix || '';
    schema = definition.schema;
}

exports.start = function(params) {
    client = new Redis();
};

exports.create = function(type, obj) {
    api.create(type, obj);
};

exports.update = function(type, id, attrs) {
    api.update(type, id, attrs);
};

exports.delete = function(type, id) {
    api.delete(type, id);
};

exports.get = function(type, id) {

};

exports.find = function(type, searchParams) {
    // redisobj.find('window', {
    //     email: 'foo@bar.fi'
    // })

};

exports.multi = function(commands) {
    // [ [ 'create', 'window', obj ], [ 'update', 'window', obj2 ] ]
};

api.create = function(type, obj) {
    let redisObj = {};

    for (let prop in obj) {
        let propType = schema[type].definition[prop];
        let propVal = obj[prop];
        let redisVal = '';

        switch (propType) {
            case 'boolean':
                redisVal = propVal ? 'true' : 'false';
                break;
            case 'int':
                redisVal = parseInt(propVal).toString();
                break;
            case 'string':
                redisVal = String(propVal);
                break;
            case 'unixtime':
                redisVal = propVal.toString();
                break;
        }

        redisObj[prop] = redisVal;
    }

    console.log(redisObj)

    client.hmset(`${prefix}:${type}`, redisObj).then(function() {
        console.log('jees')
    });
};

api.update = function(type, id, attrs) {

};

api.delete = function(type, id) {

};

// redis.register('window')

// redisobj.schema({
//     prefix: 'mas'
//     types: {
//         window: {
//             definition: {
//                name: "string",
//                retries: "int"
//             },
//             index: [ 'userId', 'conversationId' ] <- yhdessa unique?
//         },
//         group: {
//             index: [ 'foo', 'bar' ]
//         }
//     }
// });
