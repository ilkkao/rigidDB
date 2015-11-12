'use strict';

const debug = require('debug')('code'),
      Redis = require('ioredis'),
      crypto = require('crypto');

let cachedScripts = {};

function ObjectStore(prefix, schema, opts) {
    if (!prefix || !onlyLetters(prefix)) {
        throw('Invalid prefix.');
    }

    if (typeof(schema) !== 'object') {
        throw('Invalid schema.');
    }

    let collections = Object.keys(schema);

    if (collections.length === 0) {
        throw('At least one collection must be defined.');
    }

    for (let collectionName of collections) {
        let collection = schema[collectionName];

        if (!collection.definition) {
            throw('Definition missing.');
        }

        let fieldNames = Object.keys(collection.definition)

        for (let fieldName of fieldNames) {
            if (!onlyLetters(fieldName)) {
                throw(`Invalid field name: '${fieldName}'`);
            }

            let type = collection.definition[fieldName];

            if (!/^(string|int|boolean|date|timestamp)$/.test(type)) {
                throw(`Invalid type: '${type}'`);
            }
        }

        for (let index of collection.indices) {
            if (!(index.uniq === true || index.uniq === false)) {
                throw('Invalid or missing index unique definition');
            }

            for (let field of index.fields) {
                if (fieldNames.indexOf(field) === -1) {
                    throw(`Invalid index field: '${field}'`);
                }
            }
        }
    }

    this.prefix = prefix;
    this.schema = schema || {};

    opts = opts || {};

    this.client = new Redis({
        port: opts.port || undefined,
        host: opts.host || undefined,
        password: opts.password || undefined,
        db: opts.db || undefined
    });
}

ObjectStore.prototype.create = function(type, attrs) {
    return this._execSingle(this._create, 'CREATE', type, attrs);
};

ObjectStore.prototype.update = function(type, id, attrs) {
    return this._execSingle(this._update, 'UPDATE', type, id, attrs);
};

ObjectStore.prototype.delete = function(type, id) {
    return this._execSingle(this._delete, 'DELETE', type, id);
};

ObjectStore.prototype.get = function(type, id) {
    return this._execSingle(this._get, 'GET', type, id);
};

ObjectStore.prototype.exists = function(type, id) {
    return this._execSingle(this._exists, 'EXISTS', type, id);
};

ObjectStore.prototype.list = function(type) {
    return this._execSingle(this._list, 'LIST', type);
};

ObjectStore.prototype.size = function(type) {
    return this._execSingle(this._size, 'SIZE', type);
};

ObjectStore.prototype.multi = function(cb) {
    let ctx = newContext();

    const execute = function(op, args) {
        if (!ctx.error) {
            this[op].apply(this, [ ctx ].concat(args));
        }
    }.bind(this);

    let api = {
        create: (type, attrs) => execute('_create', [ type, attrs ]),
        update: (type, id, attrs) => execute('_update', [ type, id, attrs ]),
        delete: (type, id) => execute('_delete', [ type, id ]),
        get: (type, id) => execute('_get', [ type, id ]),
        exists: (type, id) => execute('_exists', [ type, id ])
    };

    cb(api);

    return this._exec(ctx);
};

ObjectStore.prototype.find = function(type, searchParams) {
    if (this._findIndex(type, searchParams) !== 'uniq') {
        return Promise.resolve({ val: false, err: 'E_SEARCH', command: 'FINDALL' });
    }

    return this._execSingle(this._find, 'FIND', type, searchParams);
};

ObjectStore.prototype.findAll = function(type, searchParams) {
    if (this._findIndex(type, searchParams) !== 'nonUniq') {
        return Promise.resolve({ val: false, err: 'E_SEARCH', command: 'FINDALL' });
    }

    return this._execSingle(this._findAll, 'FINDALL', type, searchParams);
};

ObjectStore.prototype._execSingle = function() {
    let args = Array.prototype.slice.call(arguments);
    let command = args.shift();
    let commandName = args.shift();
    let type = args[0];

    let ctx = newContext();

    if (!this.schema[type]) {
        ctx.error = { command: commandName, err: 'E_TYPE' };
    } else {
        args.unshift(ctx);
        command.apply(this, args);
    }

    return this._exec(ctx);
}

ObjectStore.prototype._exec = function(ctx) {
    if (ctx.error) {
        return Promise.resolve({ val: false, err: ctx.error.err, command: ctx.error.command });
    }

    let code = `${utilityFuncs()}\n local ret = { 'none', 'E_NONE' }\n ${ctx.script}\n return ret`;

    let sha1 = crypto.createHash('sha1').update(code).digest('hex');
    let evalParams = [ sha1, 0 ].concat(ctx.params);
    let that = this;

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
            val = that._denormalizeAttrs(ret[3], val);
        } else if (command === 'EXISTS') {
            val = !!val // Lua returns 0 (not found) or 1 (found)
        } else if (command === 'LIST' || command === 'FINDALL') {
            val = val.map(item => parseInt(item));
        } else if (command === 'UPDATE' || command === 'DELETE' || command === 'none') {
            val = true;
        }

        return { val: val };
    }

    if (cachedScripts[sha1]) {
        return this.client.evalsha.apply(this.client, evalParams).then(decodeResult);
    } else {
        return this.client.script('load', code).then(function() {
            cachedScripts[sha1] = true;
            return that.client.evalsha.apply(that.client, evalParams).then(decodeResult);
        });
    }
}

ObjectStore.prototype._findIndex = function(type, searchParams) {
    let indices = this.schema[type].indices || [];
    let searchFields = Object.keys(searchParams).sort().join();

    for (let index of indices) {
        if (index.fields.sort().join() === searchFields) {
            return index.uniq ? 'uniq' : 'nonUniq';
        }
    }

    return false;
}

ObjectStore.prototype._create = function(ctx, type, attrs) {
    let redisAttrs = this._normalizeAttrs(type, attrs)

    if (Object.keys(this.schema[type].definition).length !== Object.keys(redisAttrs).length) {
        ctx.error = { command: 'CREATE', err: 'E_PARAMS' };
        return;
    }

    genCode(ctx, `local id = redis.call('INCR', '${this.prefix}:${type}:nextid')`);
    genCode(ctx, `local key = '${this.prefix}:${type}:' .. id`);
    this._addValuesVar(ctx, redisAttrs);

    this._addIndices(ctx, type, 'CREATE');

    genCode(ctx, `hmset(key, values)`);
    genCode(ctx, `redis.call('SADD', '${this.prefix}:${type}:ids', id)`);

    genCode(ctx, `ret = { 'CREATE', 'E_NONE', id }`);
}

ObjectStore.prototype._update = function(ctx, type, id, attrs) {
    let redisAttrs = this._normalizeAttrs(type, attrs)

    genCode(ctx, `local id = ARGV[${ctx.paramCounter++}]`);
    pushParams(ctx, id);

    genCode(ctx, `local key = '${this.prefix}:${type}:' .. id`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'UPDATE', 'E_MISSING' } end`);
    genCode(ctx, `local values = hgetall(key)`);

    for (let prop in redisAttrs) {
        genCode(ctx, `values['${prop}'] = ARGV[${ctx.paramCounter++}]`);
        pushParams(ctx, redisAttrs[prop]);
    }

    this._assertUniqIndicesFree(ctx, type, 'UPDATE');

    genCode(ctx, `values = hgetall(key)`);
    this._removeIndices(ctx, type, 'UPDATE')

    for (let prop in redisAttrs) {
        genCode(ctx, `values['${prop}'] = ARGV[${ctx.paramCounter++}]`);
        pushParams(ctx, redisAttrs[prop]);
    }

    this._addIndices(ctx, type, 'UPDATE');

    genCode(ctx, `hmset(key, values)`);
    genCode(ctx, `ret = { 'UPDATE', 'E_NONE', true }`);
}

ObjectStore.prototype._delete = function(ctx, type, id) {
    genCode(ctx, `local id = ARGV[${ctx.paramCounter++}]`);
    genCode(ctx, `local key = '${this.prefix}:${type}:' .. id`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'DELETE', 'E_MISSING' } end`);
    genCode(ctx, `local values = hgetall(key)`);

    this._removeIndices(ctx, type, 'DELETE');

    genCode(ctx, `redis.call('SREM', '${this.prefix}:${type}:ids', id)`);
    genCode(ctx, `redis.call('DEL', key)`);
    genCode(ctx, `ret = { 'DELETE', 'E_NONE' }`);

    pushParams(ctx, id);
}

ObjectStore.prototype._get = function(ctx, type, id) {
    genCode(ctx, `local key = '${this.prefix}:${type}:' .. ARGV[${ctx.paramCounter++}]`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'GET', 'E_MISSING' } end`);
    genCode(ctx, `ret = { 'GET', 'E_NONE', redis.call('HGETALL', key), '${type}' }`);

    pushParams(ctx, id);
}

ObjectStore.prototype._exists = function(ctx, type, id) {
    genCode(ctx, `local key = '${this.prefix}:${type}:' .. ARGV[${ctx.paramCounter++}]`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'EXISTS', 'E_NONE', 0 } end`);
    genCode(ctx, `ret = { 'EXISTS', 'E_NONE', 1 }`);

    pushParams(ctx, id);
}

ObjectStore.prototype._size = function(ctx, type) {
    genCode(ctx, `local key = '${this.prefix}:${type}:ids'`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'SIZE', 'E_NONE', 0 } end`);
    genCode(ctx, `ret = { 'SIZE', 'E_NONE', redis.call('SCARD', key) }`);
}

ObjectStore.prototype._list = function(ctx, type) {
    genCode(ctx, `local key = '${this.prefix}:${type}:ids'`);
    genCode(ctx, `ret = { 'LIST', 'E_NONE', redis.call("SMEMBERS", key) }`);
}

ObjectStore.prototype._find = function(ctx, type, attrs) {
    let ret = this._genIndex(ctx, type, attrs);

    genCode(ctx, `ret = { 'FIND', 'E_NONE', redis.call('HGET', ${ret.name}, ${ret.prop}) }`);
}

ObjectStore.prototype._findAll = function(ctx, type, attrs) {
    let ret = this._genIndex(ctx, type, attrs);

    genCode(ctx, `ret = { 'FINDALL', 'E_NONE', redis.call('SMEMBERS', '${ret.name}:' .. ${ret.prop}) }`);
}

ObjectStore.prototype._genIndex = function(ctx, type, attrs) {
    let redisAttrs = this._normalizeAttrs(type, attrs)

    this._addValuesVar(ctx, redisAttrs);

    let fields = Object.keys(redisAttrs);

    return {
        name: this._indexName(type, fields),
        prop: this._indexValues(type, fields)
    }
}

ObjectStore.prototype._genAllIndices = function(ctx, type) {
    let indices = this.schema[type].indices || [];
    let redisIndices = [];

    // { name: "color:mileage", value: 'red:423423' }

    for (let index of indices) {
        redisIndices.push({
            name: this._indexName(type, index.fields),
            value: this._indexValues(type, index.fields),
            uniq: index.uniq
        });
    }

    return redisIndices;
}

ObjectStore.prototype._indexName = function(type, fields) {
    return `${this.prefix}:${type}:index:${fields.sort().join(':')}`;
}

ObjectStore.prototype._indexValues = function(type, fields) {
    // Lua gsub returns two values. Extra parenthesis are used to discard the second value.
    return fields.sort().map(field => `(string.gsub(values["${field}"], ':', '::'))`).join(`..':'..`);
}

ObjectStore.prototype._assertUniqIndicesFree = function(ctx, type, command) {
    let redisIndices = this._genAllIndices(ctx, type);

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

ObjectStore.prototype._addIndices = function(ctx, type, command) {
    let redisIndices = this._assertUniqIndicesFree(ctx, type, command);

    for (let redisIndex of redisIndices) {
        if (redisIndex.uniq) {
            genCode(ctx, `redis.call('HSET', '${redisIndex.name}', ${redisIndex.value}, id)`);
        } else {
            genCode(ctx, `redis.call('SADD', '${redisIndex.name}:' .. ${redisIndex.value}, id)`);
        }
    }
}

ObjectStore.prototype._removeIndices = function(ctx, type) {
    let redisIndices = this._genAllIndices(ctx, type);

    for (let redisIndex of redisIndices) {
        if (redisIndex.uniq) {
            genCode(ctx, `redis.call('HDEL', '${redisIndex.name}', ${redisIndex.value})`);
        } else {
            genCode(ctx, `redis.call('SREM', '${redisIndex.name}:' .. ${redisIndex.value}, id)`);
        }
    }
}

ObjectStore.prototype._addValuesVar = function(ctx, attrs) {
    genCode(ctx, `local values = {`);

    for (let prop in attrs) {
        genCode(ctx, `['${prop}'] = ARGV[${ctx.paramCounter++}],`);
        pushParams(ctx, attrs[prop]);
    }

    genCode(ctx, `}`);
}

ObjectStore.prototype._normalizeAttrs = function(type, attrs) {
    let redisAttrs = {};

    for (let prop in attrs) {
        let propType = this.schema[type].definition[prop];
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
            case 'timestamp':
                redisVal = propVal.getTime().toString();
                break;
        }

        if (typeof(redisVal) !== 'undefined') {
            redisAttrs[prop] = redisVal;
        }
    }

    return redisAttrs;
}

ObjectStore.prototype._denormalizeAttrs = function(type, redisRetVal) {
    let ret = {};

    while (redisRetVal.length > 0) {
        let prop = redisRetVal.shift();
        let val = redisRetVal.shift();
        let propType = this.schema[type].definition[prop]

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
            case 'timestamp':
                val = new Date(parseInt(val));
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

function onlyLetters(str) {
    return /^[a-zA-Z]+$/.test(str);
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

module.exports = ObjectStore;
