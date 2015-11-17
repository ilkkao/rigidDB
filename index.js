'use strict';

const debug = require('debug')('code');
const Redis = require('ioredis');
const crypto = require('crypto');

let cachedScripts = {};

function ObjectStore(prefix, opts) {
    if (!prefix || !onlyLetters(prefix)) {
        throw('Invalid prefix.');
    }

    this.prefix = prefix;
    this.schemaLoading = true;
    this.schema = null;

    opts = opts || {};

    this.client = new Redis({
        port: opts.port || undefined,
        host: opts.host || undefined,
        password: opts.password || undefined,
        db: opts.db || undefined
    });

    this.schemaPromise = this.client.get(`${prefix}:_schema`).then(function(result) {
        this.schemaLoading = false;

        if (result) {
            this.schema = JSON.parse(result);
            return true;
        }

        return false;
    }.bind(this));
}

ObjectStore.prototype.quit = function(schema) {
    return this.client.quit();
};

ObjectStore.prototype.setSchema = function(schema) {
    if (this.schemaLoading) {
        return this.schemaPromise.then(function() {
            return this._setSchema(schema);
        }.bind(this));
    } else {
        return this._setSchema(schema);
    }
};

ObjectStore.prototype.getSchemaHash = function() {
    if (this.schemaLoading) {
        return this.schemaPromise.then(function() {
            return this._getSchemaHash();
        }.bind(this));
    } else {
        return this._getSchemaHash();
    }
};

ObjectStore.prototype.create = function(collection, attrs) {
    return this._execSingle(this._create, 'CREATE', collection, attrs);
};

ObjectStore.prototype.update = function(collection, id, attrs) {
    return this._execSingle(this._update, 'UPDATE', collection, id, attrs);
};

ObjectStore.prototype.delete = function(collection, id) {
    return this._execSingle(this._delete, 'DELETE', collection, id);
};

ObjectStore.prototype.get = function(collection, id) {
    return this._execSingle(this._get, 'GET', collection, id);
};

ObjectStore.prototype.exists = function(collection, id) {
    return this._execSingle(this._exists, 'EXISTS', collection, id);
};

ObjectStore.prototype.list = function(collection) {
    return this._execSingle(this._list, 'LIST', collection);
};

ObjectStore.prototype.size = function(collection) {
    return this._execSingle(this._size, 'SIZE', collection);
};

ObjectStore.prototype.multi = function(cb) {
    if (this.schemaLoading) {
        return this.schemaPromise.then(function() {
            return this._execMultiNow(cb);
        }.bind(this));
    } else {
        return this._execMultiNow(cb);
    }
};

ObjectStore.prototype.find = function(collection, searchAttrs) {
    return this._execSingle(this._find, 'FIND', collection, searchAttrs);
};

ObjectStore.prototype.findAll = function(collection, searchAttrs) {
    return this._execSingle(this._findAll, 'FINDALL', collection, searchAttrs);
};

ObjectStore.prototype._setSchema = function(schema) {
    schema = this._verifySchema(schema);

    if (typeof(schema) == 'string') {
        return Promise.resolve({ val: false, reason: schema, command: 'SETSCHEMA' });
    }

    let schemaJSON = JSON.stringify(schema);
    let schemaJSONHash = crypto.createHash('sha1').update(schemaJSON).digest('hex');

    if (this.schema) {
        let currentSchemaJSON = JSON.stringify(this.schema);
        let currentSchemaJSONHash = crypto.createHash('sha1').update(currentSchemaJSON).digest('hex');

        if (schemaJSONHash !== currentSchemaJSONHash) {
            return Promise.resolve({ val: false, reason: 'Schema already exists', command: 'SETSCHEMA'});
        }
    }

    this.schema = schema;

    return this.client.set(`${this.prefix}:_schema`, schemaJSON).then(function() {
        return { val: schemaJSONHash };
    });
};

ObjectStore.prototype._verifySchema = function(schema) {
    if (typeof(schema) !== 'object') {
        return 'Invalid schema.';
    }

    let collections = Object.keys(schema);

    if (collections.length === 0) {
        return 'At least one collection must be defined.';
    }

    for (let collectionName of collections) {
        let collection = schema[collectionName];

        if (!collection.definition) {
            return 'Definition missing.';
        }

        let fieldNames = Object.keys(collection.definition);

        for (let fieldName of fieldNames) {
            if (!onlyLetters(fieldName)) {
                return `Invalid field name: '${fieldName}'`;
            }

            let type = collection.definition[fieldName];

            if (!/^(string|int|boolean|date|timestamp)$/.test(type)) {
                return `Invalid type: '${type}'`;
            }
        }

        collection.indices = collection.indices || {};

        for (let indexName in collection.indices) {
            let index = collection.indices[indexName];

            if (!(index.uniq === true || index.uniq === false)) {
                return 'Invalid or missing index unique definition';
            }

            for (let field of index.fields) {
                if (fieldNames.indexOf(field) === -1) {
                    return `Invalid index field: '${field}'`;
                }
            }
        }
    }

    return schema;
};

ObjectStore.prototype._getSchemaHash = function() {
    if (!this.schema) {
        return Promise.resolve({ val: false, err: 'E_NOSCHEMA', command: 'GETSCHEMAHASH'});
    } else {
        let schemaJSON = JSON.stringify(this.schema);
        let schemaJSONHash = crypto.createHash('sha1').update(schemaJSON).digest('hex');
        return Promise.resolve({ val: schemaJSONHash });
    }
};

ObjectStore.prototype._execMultiNow = function(cb) {
    let ctx = newContext();

    if (!this.schema) {
        ctx.error = { command: 'MULTI', err: 'E_NOSCHEMA' };
    } else {
        const execute = function(op, commandName, args) {
            let collection = args[0];

            if (!this.schema[collection]) {
                ctx.error = { command: commandName, err: 'E_COLLECTION' };
            }

            if (!ctx.error) {
                this[op].apply(this, [ ctx ].concat(args));
            }
        }.bind(this);

        let api = {
            create: (collection, attrs) => execute('_create', 'CREATE', [ collection, attrs ]),
            update: (collection, id, attrs) => execute('_update', 'UPDATE', [ collection, id, attrs ]),
            delete: (collection, id) => execute('_delete', 'DELETE', [ collection, id ]),
            get: (collection, id) => execute('_get', 'GET', [ collection, id ]),
            exists: (collection, id) => execute('_exists', 'EXISTS', [ collection, id ])
        };

        cb(api);
    }

    return this._exec(ctx);
};

ObjectStore.prototype._execSingle = function() {
    let args = Array.prototype.slice.call(arguments);
    let command = args.shift();
    let commandName = args.shift();

    let ctx = newContext();

    if (this.schemaLoading) {
        return this.schemaPromise.then(function() {
            return this._execSingleNow(ctx, command, commandName, args);
        }.bind(this));
    } else {
        return this._execSingleNow(ctx, command, commandName, args);
    }
};

ObjectStore.prototype._execSingleNow = function(ctx, command, commandName, args) {
    let collection = args[0];

    if (!this.schema) {
        ctx.error = { command: commandName, err: 'E_NOSCHEMA' };
    } else if (!this.schema[collection]) {
        ctx.error = { command: commandName, err: 'E_COLLECTION' };
    }

    if (!ctx.error) {
        args.unshift(ctx);
        command.apply(this, args);
    }

    return this._exec(ctx);
};

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
            if (command === 'CREATE' || command == 'UPDATE') {
                return { val: false, err: err, command: command, indices: val || [] };
            } else {
                return { val: false, err: err, command: command };
            }
        }

        if (command === 'GET') {
            val = that._denormalizeAttrs(ret[3], val);
        } else if (command === 'EXISTS') {
            val = !!val; // Lua returns 0 (not found) or 1 (found)
        } else if (command === 'FIND') {
            val = val ? parseInt(val) : false;
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
};

ObjectStore.prototype._create = function(ctx, collection, attrs) {
    let redisAttrs = this._normalizeAttrs(collection, attrs);

    if (Object.keys(this.schema[collection].definition).sort().join(':') !==
        Object.keys(redisAttrs).sort().join(':')) {
        ctx.error = { command: 'CREATE', err: 'E_PARAMS' };
        return;
    }

    genCode(ctx, `local id = redis.call('INCR', '${this.prefix}:${collection}:nextid')`);
    genCode(ctx, `local key = '${this.prefix}:${collection}:' .. id`);
    this._addValuesVar(ctx, redisAttrs);

    this._addIndices(ctx, collection, 'CREATE');

    genCode(ctx, `hmset(key, values)`);
    genCode(ctx, `redis.call('ZADD', '${this.prefix}:${collection}:ids', id, id)`);

    genCode(ctx, `ret = { 'CREATE', 'E_NONE', id }`);
};

ObjectStore.prototype._update = function(ctx, collection, id, attrs) {
    let redisAttrs = this._normalizeAttrs(collection, attrs);

    genCode(ctx, `local id = ARGV[${ctx.paramCounter++}]`);
    pushParams(ctx, id);

    genCode(ctx, `local key = '${this.prefix}:${collection}:' .. id`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'UPDATE', 'E_MISSING' } end`);
    genCode(ctx, `local values = hgetall(key)`);

    for (let prop in redisAttrs) {
        genCode(ctx, `values['${prop}'] = ARGV[${ctx.paramCounter++}]`);
        pushParams(ctx, redisAttrs[prop]);
    }

    this._assertUniqIndicesFree(ctx, collection, 'UPDATE');

    genCode(ctx, `values = hgetall(key)`);
    this._removeIndices(ctx, collection, 'UPDATE');

    for (let prop in redisAttrs) {
        genCode(ctx, `values['${prop}'] = ARGV[${ctx.paramCounter++}]`);
        pushParams(ctx, redisAttrs[prop]);
    }

    this._addIndices(ctx, collection, 'UPDATE');

    genCode(ctx, `hmset(key, values)`);
    genCode(ctx, `ret = { 'UPDATE', 'E_NONE', true }`);
};

ObjectStore.prototype._delete = function(ctx, collection, id) {
    genCode(ctx, `local id = ARGV[${ctx.paramCounter++}]`);
    genCode(ctx, `local key = '${this.prefix}:${collection}:' .. id`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'DELETE', 'E_MISSING' } end`);
    genCode(ctx, `local values = hgetall(key)`);

    this._removeIndices(ctx, collection, 'DELETE');

    genCode(ctx, `redis.call('ZREM', '${this.prefix}:${collection}:ids', id)`);
    genCode(ctx, `redis.call('DEL', key)`);
    genCode(ctx, `ret = { 'DELETE', 'E_NONE' }`);

    pushParams(ctx, id);
};

ObjectStore.prototype._get = function(ctx, collection, id) {
    genCode(ctx, `local key = '${this.prefix}:${collection}:' .. ARGV[${ctx.paramCounter++}]`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'GET', 'E_MISSING' } end`);
    genCode(ctx, `ret = { 'GET', 'E_NONE', redis.call('HGETALL', key), '${collection}' }`);

    pushParams(ctx, id);
};

ObjectStore.prototype._exists = function(ctx, collection, id) {
    genCode(ctx, `local key = '${this.prefix}:${collection}:' .. ARGV[${ctx.paramCounter++}]`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'EXISTS', 'E_NONE', 0 } end`);
    genCode(ctx, `ret = { 'EXISTS', 'E_NONE', 1 }`);

    pushParams(ctx, id);
};

ObjectStore.prototype._size = function(ctx, collection) {
    genCode(ctx, `local key = '${this.prefix}:${collection}:ids'`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'SIZE', 'E_NONE', 0 } end`);
    genCode(ctx, `ret = { 'SIZE', 'E_NONE', redis.call('ZCARD', key) }`);
};

ObjectStore.prototype._list = function(ctx, collection) {
    genCode(ctx, `local key = '${this.prefix}:${collection}:ids'`);
    genCode(ctx, `ret = { 'LIST', 'E_NONE', redis.call("ZRANGE", key, 0, -1) }`);
};

ObjectStore.prototype._find = function(ctx, collection, attrs) {
    this._findCommon(ctx, collection, attrs, true, 'FIND');
};

ObjectStore.prototype._findAll = function(ctx, collection, attrs) {
    this._findCommon(ctx, collection, attrs, false, 'FINDALL');
};

ObjectStore.prototype._findCommon = function(ctx, collection, attrs, uniqIndex, command) {
    let indices = this.schema[collection].indices;
    let searchFields = Object.keys(attrs).sort().join();
    let indexFound = false;

    for (let indexName in indices) {
        let index = indices[indexName];

        if (index.fields.sort().join() === searchFields && index.uniq === uniqIndex) {
            indexFound = true;
            break;
        }
    }

    if (!indexFound) {
        ctx.error = { command: command, err: 'E_INDEX' };
        return;
    }

    let redisAttrs = this._normalizeAttrs(collection, attrs);

    this._addValuesVar(ctx, redisAttrs);

    let fields = Object.keys(redisAttrs);
    let name = this._indexName(collection, fields);
    let prop = this._indexValues(fields);
    let redisCommand = uniqIndex ? 'HGET' : 'SMEMBERS';
    let redisParams =  uniqIndex ? `'${name}', ${prop}` : `'${name}:' .. ${prop}`

    genCode(ctx, `ret = { '${command}', 'E_NONE', redis.call('${redisCommand}', ${redisParams}) }`);
};

ObjectStore.prototype._genAllIndices = function(ctx, collection) {
    let indices = this.schema[collection].indices;
    let redisIndices = [];

    // { name: "color:mileage", value: 'red:423423', uniq: false }

    for (let indexName in indices) {
        let index = indices[indexName];

        redisIndices.push({
            name: indexName,
            redisKey: this._indexName(collection, index.fields),
            redisValue: this._indexValues(index.fields),
            uniq: index.uniq
        });
    }

    return redisIndices;
};

ObjectStore.prototype._indexName = function(collection, fields) {
    return `${this.prefix}:${collection}:i:${fields.sort().join(':')}`;
};

ObjectStore.prototype._indexValues = function(fields) {
    // Lua gsub returns two values. Extra parenthesis are used to discard the second value.
    return fields.sort().map(field => `(string.gsub(values["${field}"], ':', '::'))`).join(`..':'..`);
};

ObjectStore.prototype._assertUniqIndicesFree = function(ctx, collection, command) {
    let indices = this._genAllIndices(ctx, collection);

    genCode(ctx, `local nonUniqIndices, uniqError = {}, false`);

    for (let index of indices) {
        if (index.uniq) {
            genCode(ctx, `local currentIndex = redis.call('HGET', '${index.redisKey}', ${index.redisValue})`);
            genCode(ctx, `if currentIndex and currentIndex ~= id then`);
            genCode(ctx, `table.insert(nonUniqIndices, '${index.name}')`)
            genCode(ctx, `uniqError = true`)
            genCode(ctx, `end`);
        }
    }

    genCode(ctx, `if uniqError then`);
    genCode(ctx, `return { '${command}', 'E_INDEX', nonUniqIndices }`);
    genCode(ctx, `end`);

    return indices;
};

ObjectStore.prototype._addIndices = function(ctx, collection, command) {
    let indices = this._assertUniqIndicesFree(ctx, collection, command);

    for (let index of indices) {
        if (index.uniq) {
            genCode(ctx, `redis.call('HSET', '${index.redisKey}', ${index.redisValue}, id)`);
        } else {
            genCode(ctx, `redis.call('SADD', '${index.redisKey}:' .. ${index.redisValue}, id)`);
        }
    }
};

ObjectStore.prototype._removeIndices = function(ctx, collection) {
    let indices = this._genAllIndices(ctx, collection);

    for (let index of indices) {
        if (index.uniq) {
            genCode(ctx, `redis.call('HDEL', '${index.redisKey}', ${index.redisValue})`);
        } else {
            genCode(ctx, `redis.call('SREM', '${index.redisKey}:' .. ${index.redisValue}, id)`);
        }
    }
};

ObjectStore.prototype._addValuesVar = function(ctx, attrs) {
    genCode(ctx, `local values = {`);

    for (let prop in attrs) {
        genCode(ctx, `['${prop}'] = ARGV[${ctx.paramCounter++}],`);
        pushParams(ctx, attrs[prop]);
    }

    genCode(ctx, `}`);
};

ObjectStore.prototype._normalizeAttrs = function(collection, attrs) {
    let redisAttrs = {};

    for (let prop in attrs) {
        let propType = this.schema[collection].definition[prop];
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

        redisAttrs[prop] = redisVal;
    }

    return redisAttrs;
};

ObjectStore.prototype._denormalizeAttrs = function(collection, redisRetVal) {
    let ret = {};

    while (redisRetVal.length > 0) {
        let prop = redisRetVal.shift();
        let val = redisRetVal.shift();
        let propType = this.schema[collection].definition[prop];

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
};

function newContext() {
    return {
        paramCounter: 1,
        params: [],
        script: '',
        error: false
    };
}

function genCode(ctx, lua) {
    ctx.script += lua + '\n';
}

function pushParams(ctx, params) {
    ctx.params.push(params);
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
