'use strict';

const debug = require('debug')('code'),
      Redis = require('ioredis'),
      crypto = require('crypto');

let client = null;
let prefix = '';
let schema = {};
let api = {};
let cachedScripts = {};

exports.setSchema = function(definition) {
    prefix = definition.prefix || '';
    schema = definition.schema;

    // TODO: Check that field names and prefix doesn't contain character :
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

exports.getAllIds = function(type) {
    return execSingle(getAllIds, type);
};

exports.size = function(type) {
    return execSingle(size, type);
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
    if (findIndex(type, searchParams) !== 'uniq') {
        return Promise.resolve({ val: false, err: 'E_SEARCH', command: 'FINDALL' });
    }

    return execSingle(find, type, searchParams);
};

exports.findAll = function(type, searchParams) {
    if (findIndex(type, searchParams) !== 'nonUniq') {
        return Promise.resolve({ val: false, err: 'E_SEARCH', command: 'FINDALL' });
    }

    return execSingle(findAll, type, searchParams);
};

function findIndex(type, searchParams) {
    let indices = schema[type].indices || [];
    let searchFields = Object.keys(searchParams).sort().join();

    for (let index of indices) {
        if (index.fields.sort().join() === searchFields) {
            return index.uniq ? 'uniq' : 'nonUniq';
        }
    }

    return false;
}

function execSingle() {
    let args = Array.prototype.slice.call(arguments);
    let command = args.shift();
    let ctx = newContext();

    args.unshift(ctx);
    command.apply(ctx, args);

    return exec(ctx);
}

function create(ctx, type, attrs) {
    let redisAttrs = normalizeAttrs(type, attrs)

    if (Object.keys(schema[type].definition).length !== Object.keys(redisAttrs).length) {
        ctx.error = 'Create() must set all attributes';
        return;
    }

    genCode(ctx, `local id = redis.call('INCR', '${prefix}:${type}:nextid')`);
    genCode(ctx, `local key = '${prefix}:${type}:' .. id`);
    addValuesVar(ctx, redisAttrs);

    addIndices(ctx, type, 'CREATE');

    genCode(ctx, `hmset(key, values)`);
    genCode(ctx, `redis.call('SADD', '${prefix}:${type}:ids', id)`);

    genCode(ctx, `ret = { 'CREATE', 'E_NONE', id }`);
}

function update(ctx, type, id, attrs) {
    let redisAttrs = normalizeAttrs(type, attrs)

    genCode(ctx, `local id = ARGV[${ctx.paramCounter++}]`);
    pushParams(ctx, id);

    genCode(ctx, `local key = '${prefix}:${type}:' .. id`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'UPDATE', 'E_MISSING' } end`);
    genCode(ctx, `local values = hgetall(key)`);

    for (let prop in redisAttrs) {
        genCode(ctx, `values['${prop}'] = ARGV[${ctx.paramCounter++}]`);
        pushParams(ctx, redisAttrs[prop]);
    }

    assertUniqIndicesFree(ctx, type, 'UPDATE');

    genCode(ctx, `values = hgetall(key)`);
    removeIndices(ctx, type, 'UPDATE')

    for (let prop in redisAttrs) {
        genCode(ctx, `values['${prop}'] = ARGV[${ctx.paramCounter++}]`);
        pushParams(ctx, redisAttrs[prop]);
    }

    addIndices(ctx, type, 'UPDATE');

    genCode(ctx, `hmset(key, values)`);
    genCode(ctx, `ret = { 'UPDATE', 'E_NONE', true }`);
}

function remove(ctx, type, id) {
    genCode(ctx, `local id = ARGV[${ctx.paramCounter++}]`);
    genCode(ctx, `local key = '${prefix}:${type}:' .. id`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'REMOVE', 0 } end`);
    genCode(ctx, `local values = hgetall(key)`);

    removeIndices(ctx, type, 'REMOVE');

    genCode(ctx, `redis.call('SREM', '${prefix}:${type}:ids', id)`);
    genCode(ctx, `redis.call('DEL', key)`);
    genCode(ctx, `ret = { 'REMOVE', 'E_NONE' }`);

    pushParams(ctx, id);
}

function get(ctx, type, id) {
    genCode(ctx, `local key = '${prefix}:${type}:' .. ARGV[${ctx.paramCounter++}]`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'GET', 'E_MISSING' } end`);
    genCode(ctx, `ret = { 'GET', 'E_NONE', redis.call('HGETALL', key), '${type}' }`);

    pushParams(ctx, id);
}

function exists(ctx, type, id) {
    genCode(ctx, `local key = '${prefix}:${type}:' .. ARGV[${ctx.paramCounter++}]`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'EXISTS', 'E_MISSING' } end`);
    genCode(ctx, `ret = { 'EXISTS', 'E_NONE' }`);

    pushParams(ctx, id);
}

function getAllIds(ctx, type) {
    genCode(ctx, `local key = '${prefix}:${type}:ids'`);
    genCode(ctx, `ret = { 'GETALLIDS', 'E_NONE', redis.call("SMEMBERS", key) }`);
}

function find(ctx, type, attrs) {
    let ret = genIndex(ctx, type, attrs);

    genCode(ctx, `ret = { 'FIND', 'E_NONE', redis.call('HGET', ${ret.name}, ${ret.prop}) }`);
}

function findAll(ctx, type, attrs) {
    let ret = genIndex(ctx, type, attrs);

    genCode(ctx, `ret = { 'FINDALL', 'E_NONE', redis.call('SMEMBERS', '${ret.name}:' .. ${ret.prop}) }`);
}

function genIndex(ctx, type, attrs) {
    let redisAttrs = normalizeAttrs(type, attrs)

    addValuesVar(ctx, redisAttrs);

    let fields = Object.keys(redisAttrs);

    return {
        name: indexName(type, fields),
        prop: indexValues(type, fields)
    }
}

function exec(ctx) {
    if (ctx.error) {
        return Promise.reject(ctx.error);
    }

    let code = `${utilityFuncs()}\n local ret = { 'none', 'E_NONE' }\n ${ctx.script}\n return ret`;

    let sha1 = crypto.createHash('sha1').update(code).digest('hex');
    let evalParams = [ sha1, 0 ].concat(ctx.params);

    debug(`PARAMETERS : ${ctx.params}`);
    debug(code);

    function decodeResult(ret) {
        let command = ret[0];
        let err = ret[1];
        let val = ret[2];

        if (err != 'E_NONE') {
            return { val: false, err: err, command: command };
        }

        if (command === 'GET') {
            val = denormalizeAttrs(ret[3], val);
        } else if (command === 'GETALLIDS' || command === 'FINDALL') {
            val = val.map(item => parseInt(item));
        } else if (command === 'UPDATE' || command === 'REMOVE' || command === 'none') {
            val = true;
        }

        return { val: val };
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

function genAllIndices(ctx, type) {
    let indices = schema[type].indices || [];
    let redisIndices = [];

    // { name: "color:mileage", value: 'red:423423' }

    for (let index of indices) {
        redisIndices.push({
            name: indexName(type, index.fields),
            value: indexValues(type, index.fields),
            uniq: index.uniq
        });
    }

    return redisIndices;
}

function indexName(type, fields) {
    return `${prefix}:${type}:index:${fields.sort().join(':')}`;
}

function indexValues(type, fields) {
    return fields.sort().map(field => `string.gsub(values["${field}"], ':', '::')`).join(`..':'..`);
}

function assertUniqIndicesFree(ctx, type, command) {
    let redisIndices = genAllIndices(ctx, type);

    for (let index of redisIndices) {
        if (index.uniq) {
            genCode(ctx, `local currentIndex = redis.call('HGET', '${index.name}', ${index.value})`);
            genCode(ctx, `if currentIndex and currentIndex ~= id then`);
            genCode(ctx, `return { '${command}', 'E_INDEX' }`)
            genCode(ctx, `end`);
        }
    }

    return redisIndices;
}

function addIndices(ctx, type, command) {
    let redisIndices = assertUniqIndicesFree(ctx, type, command);

    for (let redisIndex of redisIndices) {
        if (redisIndex.uniq) {
            genCode(ctx, `redis.call('HSET', '${redisIndex.name}', ${redisIndex.value}, id)`);
        } else {
            genCode(ctx, `redis.call('SADD', '${redisIndex.name}:' .. ${redisIndex.value}, id)`);
        }
    }
}

function removeIndices(ctx, type) {
    let redisIndices = genAllIndices(ctx, type);

    for (let redisIndex of redisIndices) {
        if (redisIndex.uniq) {
            genCode(ctx, `redis.call('HDEL', '${redisIndex.name}', ${redisIndex.value})`);
        } else {
            genCode(ctx, `redis.call('SREM', '${redisIndex.name}:' .. ${redisIndex.value}, id)`);
        }
    }
}

function addValuesVar(ctx, attrs) {
    genCode(ctx, `local values = {`);

    for (let prop in attrs) {
        genCode(ctx, `['${prop}'] = ARGV[${ctx.paramCounter++}],`);
        pushParams(ctx, attrs[prop]);
    }

    genCode(ctx, `}`);
}

function normalizeAttrs(type, attrs) {
    let redisAttrs = {};

    for (let prop in attrs) {
        let propType = schema[type].definition[prop];
        let propVal = attrs[prop];
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
            case 'date':
                redisVal = propVal.toString();
                break;
        }

        if (typeof(redisVal) !== 'undefined') {
            redisAttrs[prop] = redisVal;
        }
    }

    return redisAttrs;
}

function denormalizeAttrs(type, redisRetVal) {
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
            case 'date':
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
        script: '',
        error: false
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

function escape(str) {
    return str.replace(/:/g, '::');
}

function utilityFuncs() {
    return `
        local hgetall = function (key)
            local bulk = redis.call('HGETALL', key)
            local result = {}
            local nextkey
            for i, v in ipairs(bulk) do
                if i % 2 == 1 then
                    nextkey = v
                else
                    result[nextkey] = v
                end
            end
            return result
        end

        local hmget = function (key, ...)
            if next(arg) == nil then return {} end
            local bulk = redis.call('HMGET', key, unpack(arg))
            local result = {}
            for i, v in ipairs(bulk) do result[ arg[i] ] = v end
            return result
        end

        local hmset = function (key, dict)
            if next(dict) == nil then return nil end
            local bulk = {}
            for k, v in pairs(dict) do
                table.insert(bulk, k)
                table.insert(bulk, v)
            end
            return redis.call('HMSET', key, unpack(bulk))
        end
    `;
}
