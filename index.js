'use strict';

const Redis = require('ioredis'),
      crypto = require('crypto');

let client = null;
let prefix = '';
let schema = {};
let api = {};
let cachedScripts = {};

exports.setSchema = function(definition) {
    prefix = definition.prefix || '';
    schema = definition.schema;
}

exports.start = function(params) {
    client = new Redis();
};

exports.create = function(type, attrs) {
    return execSingle(create, type, attrs);
};

exports.update = function(type, id, attrs) {
    return execSingle(update, type, id, attrs);
};

exports.delete = function(type, id) {
    return execSingle(remove, type, id);
};

exports.get = function(type, id) {
    return execSingle(get, type, id);
};

exports.exists = function(type, id) {
    return execSingle(exists, type, id);
};

exports.multi = function(cb) {
    let ctx = newContext();

    let api = {
        create: (type, attrs) => create(ctx, type, attrs),
        update: (type, id, attrs) => update(ctx, type, id, attrs),
        delete: (type, id) => delete(ctx, type, id),
        get: (type, id) => get(ctx, type, id),
        exists: (type, id) => exists(ctx, type, id)
    };

    cb(api);

    return exec(ctx);
};

exports.find = function(type, searchParams) {
    // redisobj.find('window', {
    //     email: 'foo@bar.fi'
    // })
};

function execSingle() {
    let args = Array.prototype.slice.call(arguments);
    let command = args.shift();
    let ctx = newContext();

    args.unshift(ctx);
    command.apply(ctx, args);

    return exec(ctx);
}

function create(ctx, type, attrs) {
    let ret = normalizeFields(type, attrs)
    let redisProps = ret.fields;
    let redisVals = ret.values;
    let lua = '';

    genCode(ctx, `local p1 = redis.call('INCR', '${prefix}:${type}:nextid')`);

    for (let prop of redisProps) {
        lua += `, '${prop}', ARGV[${ctx.paramCounter++}]`;
    }

    genCode(ctx, `redis.call('HMSET', '${prefix}:${type}:' .. p1${lua})`);
    genCode(ctx, `ret = { 'create', p1 }`);

    pushParams(ctx, redisVals);
}

function update(ctx, type, id, attrs) {
    let ret = normalizeFields(type, attrs)
    let redisProps = ret.fields;
    let redisVals = ret.values;
    let lua = '';

    genCode(ctx, `local p1 = '${prefix}:${type}:' .. ARGV[${ctx.paramCounter++}]`);
    genCode(ctx, `if redis.call("EXISTS", p1) == 0 then return { 'update', 0 } end`);

    for (let prop of redisProps) {
        lua += `, '${prop}', ARGV[${ctx.paramCounter++}]`;
    }

    genCode(ctx, `redis.call('HMSET', p1${lua})`);
    genCode(ctx, `ret = { 'update', 1 }`);

    redisVals.unshift(id);
    pushParams(ctx, redisVals);
}

function remove(ctx, type, id) {
    genCode(ctx, `local p1 = '${prefix}:${type}:' .. ARGV[${ctx.paramCounter++}]`);
    genCode(ctx, `if redis.call("EXISTS", p1) == 0 then return { 'remove', 0 } end`);
    genCode(ctx, `ret = { 'remove', redis.call('DEL', p1) }`);

    pushParams(ctx, id);
}

function get(ctx, type, id) {
    genCode(ctx, `local p1 = '${prefix}:${type}:' .. ARGV[${ctx.paramCounter++}]`);
    genCode(ctx, `if redis.call("EXISTS", p1) == 0 then return { 'get', 0 } end`);
    genCode(ctx, `ret = { 'get', redis.call('HGETALL', p1), '${type}' }`);

    pushParams(ctx, id);
}

function exists(ctx, type, id) {
    genCode(ctx, `local p1 = '${prefix}:${type}:' .. ARGV[${ctx.paramCounter++}]`);
    genCode(ctx, `if redis.call("EXISTS", p1) == 0 then return { 'exists', 0 } end`);
    genCode(ctx, `ret = { 'exists', 1 }`);

    pushParams(ctx, id);
}

function exec(ctx) {
    let code = `local ret = { 'none', 0 }\n ${ctx.script}\n return ret`;
    let sha1 = crypto.createHash('sha1').update(code).digest('hex');
    let evalParams = [ sha1, 0 ].concat(ctx.params);

    function decodeResult(ret) {
        let command = ret[0];
        let redisRetVal = ret[1];
        let retVal;

        if (command === 'get') {
            retVal = redisRetVal ? denormalizeFields(ret[2], redisRetVal) : false;
        } else {
            retVal = redisRetVal || false;
        }

        return retVal;
    }

    if (cachedScripts[sha1]) {
        return client.evalsha.apply(client, evalParams).then(decodeResult);
    } else {
        return client.script('load', code).then(function() {
            cachedScripts[sha1] = true;
            return client.evalsha.apply(client, evalParams).then(decodeResult);
        });
    }
}

function normalizeFields(type, obj) {
    let redisProps = [];
    let redisVals = [];

    for (let prop in obj) {
        let propType = schema[type].definition[prop];
        let propVal = obj[prop];
        let redisVal;

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

        if (typeof(redisVal) !== 'undefined') {
            redisProps.push(prop);
            redisVals.push(redisVal);
        }
    }

    return { fields: redisProps, values: redisVals };
}

function denormalizeFields(type, redisRetVal) {
    let ret = {};

    while (redisRetVal.length > 0) {
        let prop = redisRetVal.shift();
        let val = redisRetVal.shift();
        let propType = schema[type].definition[prop]

        switch (propType) {
            case 'boolean':
                val = val === 'true';
                break;
            case 'int':
                val = parseInt(val);
                break;
            case 'unixtime':
                val = new Date(val);
                break;
        }

        ret[prop] = val;
    }

    return ret;
}

function newContext() {
    return {
        paramCounter: 1,
        params: [],
        script: ''
    }
}

function genCode(ctx, lua) {
    ctx.script += lua + '\n';
}

function pushParams(ctx, params) {
    if (Object.prototype.toString.call(params) === '[object Array]') {
        ctx.params = ctx.params.concat(params);
    } else {
        ctx.params.push(params);
    }
}
