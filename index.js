'use strict';

const debug = require('debug')('code');
const Redis = require('ioredis');
const crypto = require('crypto');

let cachedScripts = {};

function RigidDB(prefix, redisOpts) {
    if (!prefix || !onlyLetters(prefix)) {
        throw('Invalid prefix.');
    }

    this.prefix = prefix;
    this.schemaLoading = true;
    this.invalidSavedSchema = false;
    this.schema = null;

    redisOpts = redisOpts || {};

    this.client = new Redis({
        port: redisOpts.port,
        host: redisOpts.host,
        password: redisOpts.password,
        db: redisOpts.db
    });

    this.schemaPromise = this.client.get(`${prefix}:_schema`).then(result => {
        this.schemaLoading = false;

        if (result) {
            try {
                this.srcSchema = JSON.parse(result);
            } catch(e) {
                this.invalidSavedSchema = true;
                return;
            }

            let normalizedSchema = this._verifySchema(this.srcSchema);

            if (typeof(normalizedSchema) === 'string') {
                this.invalidSavedSchema = true;
            } else {
                this.schema = normalizedSchema;
            }
        }
    });
}

RigidDB.prototype.quit = function() {
    return this.client.quit();
};

RigidDB.prototype.setSchema = function(revision, schema) {
    return this._whenSchemaLoaded(() => this._setSchema(revision, schema));
};

RigidDB.prototype.getSchema = function() {
    return this._whenSchemaLoaded(() => this._getSchema());
};

RigidDB.prototype.create = function(collection, attrs) {
    return this._execSingle(this._create, 'CREATE', collection, attrs);
};

RigidDB.prototype.update = function(collection, id, attrs) {
    return this._execSingle(this._update, 'UPDATE', collection, id, attrs);
};

RigidDB.prototype.delete = function(collection, id) {
    return this._execSingle(this._delete, 'DELETE', collection, id);
};

RigidDB.prototype.get = function(collection, id) {
    return this._execSingle(this._get, 'GET', collection, id);
};

RigidDB.prototype.exists = function(collection, id) {
    return this._execSingle(this._exists, 'EXISTS', collection, id);
};

RigidDB.prototype.list = function(collection) {
    return this._execSingle(this._list, 'LIST', collection);
};

RigidDB.prototype.size = function(collection) {
    return this._execSingle(this._size, 'SIZE', collection);
};

RigidDB.prototype.multi = function(cb) {
    return this._whenSchemaLoaded(() => this._execMultiNow(cb));
};

RigidDB.prototype.find = function(collection, searchAttrs) {
    return this._execSingle(this._find, 'FIND', collection, searchAttrs);
};

RigidDB.prototype._setSchema = function(revision, schema) {
    let srcSchemaJSON = '';

    if (this.schema) {
        return Promise.resolve({ val: false, reason: 'Schema already exists', command: 'SETSCHEMA'});
    }

    try {
        srcSchemaJSON = JSON.stringify(schema);
    } catch(e) {
        return Promise.resolve({ val: false, reason: 'Invalid schema.', command: 'SETSCHEMA' });
    }

    schema = this._verifySchema(schema);

    if (typeof(schema) == 'string') {
        return Promise.resolve({ val: false, reason: schema, command: 'SETSCHEMA' });
    }

    this.schema = schema;
    this.srcSchema = JSON.parse(srcSchemaJSON); // Clone

    return this.client.set(`${this.prefix}:_schema`, srcSchemaJSON)
        .then(() => this.client.set(`${this.prefix}:_schemaRevision`, revision))
        .then(() => ({ val: true }));
};

RigidDB.prototype._verifySchema = function(schema) {
    if (typeof(schema) !== 'object' || schema === null) {
        return 'Invalid schema.';
    }

    let collections = Object.keys(schema);

    if (collections.length === 0) {
        return 'At least one collection must be defined.';
    }

    for (let collectionName of collections) {
        let definition = schema[collectionName].definition;
        let indices =  schema[collectionName].indices || {};

        if (!definition) {
            return 'Definition missing.';
        }

        let fieldNames = Object.keys(definition);

        for (let fieldName of fieldNames) {
            if (!onlyLettersNumbersDashes(fieldName)) {
                return `Invalid field name (letters, numbers, and dashes allowed): '${fieldName}'`;
            }

            if (typeof(definition[fieldName]) === 'string') {
                definition[fieldName] = { type: definition[fieldName] };
            }

            let type = definition[fieldName];

            if (!type || !type.type) {
                return `Type definition missing.`;
            }

            if (!/^(string|int|boolean|date|timestamp)$/.test(type.type)) {
                return `Invalid type: '${type.type}'`;
            }

            type.allowMulti = !!type.allowMulti;
        }

        for (let indexName in indices) {
            let index = indices[indexName];

            if (!(index.uniq === true || index.uniq === false)) {
                return 'Invalid or missing index unique definition';
            }

            if (!index.fields || !(index.fields instanceof Array) || index.fields.length == 0) {
                return 'Invalid or missing index fields definition';
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

RigidDB.prototype._getSchema = function() {
    let ret;

    if (!this.schema) {
        ret = { val: false, err: 'schemaMissing', command: 'GETSCHEMA'};
    } else {
        ret = { val: { revision: 1, schema: this.srcSchema } };
    }

    return Promise.resolve(ret);
};

RigidDB.prototype._execMultiNow = function(cb) {
    let ctx = newContext();

    if (this.invalidSavedSchema) {
        ctx.error = { command: 'MULTI', err: 'badSavedSchema' };
    } else if (!this.schema) {
        ctx.error = { command: 'MULTI', err: 'schemaMissing' };
    } else {
        const execute = function(op, commandName, args) {
            let collection = args[0];

            if (!this.schema[collection]) {
                ctx.error = { command: commandName, err: 'unknownCollection' };
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

RigidDB.prototype._execSingle = function() {
    let args = Array.prototype.slice.call(arguments);
    let command = args.shift();
    let commandName = args.shift();

    let ctx = newContext();

    return this._whenSchemaLoaded(() => this._execSingleNow(ctx, command, commandName, args));
};

RigidDB.prototype._execSingleNow = function(ctx, command, commandName, args) {
    let collection = args[0];

 //   console.log(this);

    if (this.invalidSavedSchema) {
        ctx.error = { command: commandName, err: 'badSavedSchema' };
    } else if (!this.schema) {
        ctx.error = { command: commandName, err: 'schemaMissing' };
    } else if (!this.schema[collection]) {
        ctx.error = { command: commandName, err: 'unknownCollection' };
    }

    if (!ctx.error) {
        args.unshift(ctx);
        command.apply(this, args);
    }

    return this._exec(ctx);
};

RigidDB.prototype._exec = function(ctx) {
    if (ctx.error) {
        return Promise.resolve({ val: false, err: ctx.error.err, command: ctx.error.command });
    }

    let code = `${utilityFuncs()}\n local ret = { 'none', 'noError' }\n ${ctx.script}\n return ret`;

    let sha1 = crypto.createHash('sha1').update(code).digest('hex');
    let evalParams = [ sha1, 0 ].concat(ctx.params);
    let that = this;

    debug(`PARAMETERS : ${ctx.params}`);
    debug(code);

    function decodeResult(ret) {
        let command = ret[0];
        let err = ret[1];
        let val = ret[2];

        if (err != 'noError') {
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
        } else if (command === 'LIST' || command === 'FIND') {
            val = val.map(item => parseInt(item));
        } else if (command === 'UPDATE' || command === 'DELETE' || command === 'none') {
            val = true;
        }

        return { val: val };
    }

    if (cachedScripts[sha1]) {
        return this.client.evalsha.apply(this.client, evalParams).then(decodeResult);
    } else {
        return this.client.script('load', code).then(() => {
            cachedScripts[sha1] = true;
            return that.client.evalsha.apply(that.client, evalParams).then(decodeResult);
        });
    }
};

RigidDB.prototype._whenSchemaLoaded = function(cb) {
    return this.schemaLoading ? this.schemaPromise.then(cb) : cb();
};

RigidDB.prototype._create = function(ctx, collection, attrs) {
    let redisAttrs = this._normalizeAttrs(collection, attrs);

    if (redisAttrs.err) {
        ctx.error = { command: 'CREATE', err: redisAttrs.err };
        return;
    }

    if (Object.keys(this.schema[collection].definition).sort().join(':') !==
        Object.keys(redisAttrs.val).sort().join(':')) {
        ctx.error = { command: 'CREATE', err: 'badParameter' };
        return;
    }

    genCode(ctx, `local id = redis.call('INCR', '${this.prefix}:${collection}:nextid')`);
    genCode(ctx, `local key = '${this.prefix}:${collection}:' .. id`);
    this._addValuesVar(ctx, redisAttrs.val);

    this._addIndices(ctx, collection, 'CREATE');

    genCode(ctx, `hmset(key, values)`);
    genCode(ctx, `redis.call('ZADD', '${this.prefix}:${collection}:ids', id, id)`);

    genCode(ctx, `ret = { 'CREATE', 'noError', id }`);
};

RigidDB.prototype._update = function(ctx, collection, id, attrs) {
    let redisAttrs = this._normalizeAttrs(collection, attrs);

    if (redisAttrs.err) {
        ctx.error = { command: 'UPDATE', err: redisAttrs.err };
        return;
    }

    genCode(ctx, `local id = ARGV[${ctx.paramCounter++}]`);
    pushParams(ctx, id);

    genCode(ctx, `local key = '${this.prefix}:${collection}:' .. id`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'UPDATE', 'notFound' } end`);
    genCode(ctx, `local values = hgetall(key)`);

    for (let prop in redisAttrs.val) {
        genCode(ctx, `values['${prop}'] = ARGV[${ctx.paramCounter++}]`);
        pushParams(ctx, redisAttrs.val[prop]);
    }

    let indices = this._genAllIndices(ctx, collection);
    this._assertUniqIndicesFree(ctx, collection, indices, 'UPDATE');

    genCode(ctx, `values = hgetall(key)`);
    this._removeIndices(ctx, collection, 'UPDATE');

    for (let prop in redisAttrs.val) {
        genCode(ctx, `values['${prop}'] = ARGV[${ctx.paramCounter++}]`);
        pushParams(ctx, redisAttrs.val[prop]);
    }

    this._addIndices(ctx, collection, 'UPDATE');

    genCode(ctx, `hmset(key, values)`);
    genCode(ctx, `ret = { 'UPDATE', 'noError', true }`);
};

RigidDB.prototype._delete = function(ctx, collection, id) {
    genCode(ctx, `local id = ARGV[${ctx.paramCounter++}]`);
    genCode(ctx, `local key = '${this.prefix}:${collection}:' .. id`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'DELETE', 'notFound' } end`);
    genCode(ctx, `local values = hgetall(key)`);

    this._removeIndices(ctx, collection, 'DELETE');

    genCode(ctx, `redis.call('ZREM', '${this.prefix}:${collection}:ids', id)`);
    genCode(ctx, `redis.call('DEL', key)`);
    genCode(ctx, `ret = { 'DELETE', 'noError' }`);

    pushParams(ctx, id);
};

RigidDB.prototype._get = function(ctx, collection, id) {
    genCode(ctx, `local key = '${this.prefix}:${collection}:' .. ARGV[${ctx.paramCounter++}]`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'GET', 'notFound' } end`);
    genCode(ctx, `ret = { 'GET', 'noError', redis.call('HGETALL', key), '${collection}' }`);

    pushParams(ctx, id);
};

RigidDB.prototype._exists = function(ctx, collection, id) {
    genCode(ctx, `local key = '${this.prefix}:${collection}:' .. ARGV[${ctx.paramCounter++}]`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'EXISTS', 'noError', 0 } end`);
    genCode(ctx, `ret = { 'EXISTS', 'noError', 1 }`);

    pushParams(ctx, id);
};

RigidDB.prototype._size = function(ctx, collection) {
    genCode(ctx, `local key = '${this.prefix}:${collection}:ids'`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'SIZE', 'noError', 0 } end`);
    genCode(ctx, `ret = { 'SIZE', 'noError', redis.call('ZCARD', key) }`);
};

RigidDB.prototype._list = function(ctx, collection) {
    genCode(ctx, `local key = '${this.prefix}:${collection}:ids'`);
    genCode(ctx, `ret = { 'LIST', 'noError', redis.call("ZRANGE", key, 0, -1) }`);
};

RigidDB.prototype._find = function(ctx, collection, attrs) {
    let indices = this.schema[collection].indices;
    let searchFields = Object.keys(attrs).sort().join();
    let indexFound = false;

    for (let indexName in indices) {
        let index = indices[indexName];

        if (index.fields.sort().join() === searchFields) {
            indexFound = true;
            break;
        }
    }

    if (!indexFound) {
        ctx.error = { command: 'FIND', err: 'unknownIndex' };
        return;
    }

    let redisAttrs = this._normalizeAttrs(collection, attrs);

    if (redisAttrs.err) {
        ctx.error = { command: 'FIND', err: redisAttrs.err };
        return;
    }

    this._addValuesVar(ctx, redisAttrs.val);

    let fields = Object.keys(redisAttrs.val);
    let name = this._indexName(collection, fields);
    let prop = this._indexValues(fields);

    genCode(ctx, `local result = redis.call('HGET', '${name}', ${prop})`);
    genCode(ctx, `if result ~= false then`);
    genCode(ctx, `result = { result }`);
    genCode(ctx, `else`);
    genCode(ctx, `result = redis.call('SMEMBERS', '${name}:' .. ${prop})`);
    genCode(ctx, `end`);
    genCode(ctx, `ret = { 'FIND', 'noError', result }`);
};

RigidDB.prototype._genAllIndices = function(ctx, collection) {
    let indices = this.schema[collection].indices;
    let redisIndices = [];

    // { name: "color:mileage", value: 'red:423423', uniq: false }

    for (let indexName in indices) {
        let index = indices[indexName];

        redisIndices.push({
            name: indexName,
            redisKey: this._indexName(collection, index.fields),
            redisValue: this._indexValues(index.fields),
            fields: index.fields,
            uniq: index.uniq
        });
    }

    return redisIndices;
};

RigidDB.prototype._indexName = function(collection, fields) {
    return `${this.prefix}:${collection}:i:${fields.sort().join(':')}`;
};

RigidDB.prototype._indexValues = function(fields) {
    // Lua gsub returns two values. Extra parenthesis are used to discard the second value.
    return fields.sort().map(field => `(string.gsub(values["${field}"], ':', '::'))`).join(`..':'..`);
};

RigidDB.prototype._assertUniqIndicesFree = function(ctx, collection, indices, command) {
    genCode(ctx, `local nonUniqIndices, uniqError = {}, false`);

    for (let index of indices) {
        if (index.uniq) {
            let notNullCheck = index.fields.map(field => `values["${field}"] ~= '~'`).join(' and ');

            genCode(ctx, `local currentIndex = redis.call('HGET', '${index.redisKey}', ${index.redisValue})`);
            genCode(ctx, `if currentIndex and currentIndex ~= id and ${notNullCheck} then`);
            genCode(ctx, `table.insert(nonUniqIndices, '${index.name}')`);
            genCode(ctx, `uniqError = true`);
            genCode(ctx, `end`);
        }
    }

    genCode(ctx, `if uniqError then`);
    genCode(ctx, `return { '${command}', 'notUnique', nonUniqIndices }`);
    genCode(ctx, `end`);

    return indices;
};

RigidDB.prototype._addIndices = function(ctx, collection, command) {
    let indices = this._genAllIndices(ctx, collection);
    this._assertUniqIndicesFree(ctx, collection, indices, command);

    for (let index of indices) {
        genCode(ctx, `local hashId = redis.call('HGET', '${index.redisKey}', ${index.redisValue})`);
        genCode(ctx, `local isSet = redis.call('EXISTS', '${index.redisKey}:' .. ${index.redisValue})`);
        genCode(ctx, `if not hashId and isSet == 0 then `);
        genCode(ctx, `redis.call('HSET', '${index.redisKey}', ${index.redisValue}, id)`);
        genCode(ctx, `elseif isSet == 0 then`);
        genCode(ctx, `redis.call('HDEL', '${index.redisKey}', ${index.redisValue})`);
        genCode(ctx, `redis.call('SADD', '${index.redisKey}:' .. ${index.redisValue}, id, hashId)`);
        genCode(ctx, `else`);
        genCode(ctx, `redis.call('SADD', '${index.redisKey}:' .. ${index.redisValue}, id)`);
        genCode(ctx, `end`);
    }
};

RigidDB.prototype._removeIndices = function(ctx, collection) {
    let indices = this._genAllIndices(ctx, collection);

    for (let index of indices) {
        genCode(ctx, `local removed = redis.call('HDEL', '${index.redisKey}', ${index.redisValue})`);
        genCode(ctx, `if removed == 0 then`);
        genCode(ctx, `redis.call('SREM', '${index.redisKey}:' .. ${index.redisValue}, id)`);
        genCode(ctx, `local remaining = redis.call('SCARD', '${index.redisKey}:' .. ${index.redisValue})`);
        genCode(ctx, `if remaining == 1 then`);
        genCode(ctx, `local last = redis.call('SMEMBERS', '${index.redisKey}:' .. ${index.redisValue})`);
        genCode(ctx, `redis.call('DEL', '${index.redisKey}:' .. ${index.redisValue})`);
        genCode(ctx, `redis.call('HSET', '${index.redisKey}', ${index.redisValue}, last[1])`);
        genCode(ctx, `end`);
        genCode(ctx, `end`);
    }
};

RigidDB.prototype._addValuesVar = function(ctx, attrs) {
    genCode(ctx, `local values = {`);

    for (let prop in attrs) {
        genCode(ctx, `['${prop}'] = ARGV[${ctx.paramCounter++}],`);
        pushParams(ctx, attrs[prop]);
    }

    genCode(ctx, `}`);
};

RigidDB.prototype._normalizeAttrs = function(collection, attrs) {
    let redisAttrs = {};
    let definition = this.schema[collection].definition;

    for (let prop in attrs) {
        let propType = definition[prop];
        let propVal = attrs[prop];
        let redisVal;

        if (propVal === null) {
            if (!propType.allowNull) {
                return { err: `nullNotAllowed` };
            }

            redisVal = '~';
        } else {
            switch (propType.type) {
                case 'boolean':
                    redisVal = propVal ? 'true' : 'false';
                    break;
                case 'int':
                    redisVal = parseInt(propVal).toString();
                    break;
                case 'string':
                    redisVal = String(propVal);
                    if (/^~+$/.test(redisVal)) {
                        redisVal = `~${redisVal}`;
                    }
                    break;
                case 'date':
                    redisVal = propVal.toString();
                    break;
                case 'timestamp':
                    redisVal = propVal.getTime().toString();
                    break;
            }
        }

        redisAttrs[prop] = redisVal;
    }

    return { val: redisAttrs };
};

RigidDB.prototype._denormalizeAttrs = function(collection, redisRetVal) {
    let ret = {};

    while (redisRetVal.length > 0) {
        let prop = redisRetVal.shift();
        let redisVal = redisRetVal.shift();
        let propType = this.schema[collection].definition[prop];

        if (redisVal === '~') {
            ret[prop] = null;
        } else {
            switch (propType.type) {
                case 'boolean':
                    redisVal = redisVal === 'true';
                    break;
                case 'int':
                    redisVal = parseInt(redisVal);
                    break;
                case 'string':
                    if (/^~+$/.test(redisVal)) {
                        redisVal = redisVal.substring(1);
                    }
                    break;
                case 'date':
                    redisVal = new Date(redisVal);
                    break;
                case 'timestamp':
                    redisVal = new Date(parseInt(redisVal));
                    break;
            }

            ret[prop] = redisVal;
        }
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

function onlyLettersNumbersDashes(str) {
    return /^[a-zA-Z0-9_\-]+$/.test(str);
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

module.exports = RigidDB;
