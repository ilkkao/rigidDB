'use strict';

const debug = require('debug')('code'),
    Redis = require('ioredis'),
    crypto = require('crypto'),
    clone = require('clone');

require('console.table');

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

            let ret = this._normalizeAndVerifySchema(this.srcSchema);

            if (ret.err) {
                this.invalidSavedSchema = true;
            } else {
                this.schema = ret.schema;
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
    return this._execSingle(this._create, 'create', collection, attrs);
};

RigidDB.prototype.update = function(collection, id, attrs) {
    return this._execSingle(this._update, 'update', collection, id, attrs);
};

RigidDB.prototype.delete = function(collection, id) {
    return this._execSingle(this._delete, 'delete', collection, id);
};

RigidDB.prototype.get = function(collection, id) {
    return this._execSingle(this._get, 'get', collection, id);
};

RigidDB.prototype.exists = function(collection, id) {
    return this._execSingle(this._exists, 'exists', collection, id);
};

RigidDB.prototype.list = function(collection) {
    return this._execSingle(this._list, 'list', collection);
};

RigidDB.prototype.size = function(collection) {
    return this._execSingle(this._size, 'size', collection);
};

RigidDB.prototype.multi = function(cb) {
    return this._whenSchemaLoaded(() => this._execMultiNow(cb));
};

RigidDB.prototype.find = function(collection, searchAttrs) {
    return this._execSingle(this._find, 'find', collection, searchAttrs);
};

// Print is for debugging, doesn't scale currently
RigidDB.prototype.debugPrint = function(collection) {
    let data = [];

    return this.client.zrange(`${this.prefix}:${collection}:ids`, 0, -1).then(ids =>
        ids.reduce((sequence, id) => sequence.then(() =>
            this.client.hgetall(`${this.prefix}:${collection}:${id}`).then(result => {
                result = this._denormalizeAttrsForPrinting(collection, result);
                result.id = id;
                data.push(result);
            })), Promise.resolve())).then(() => {
                console.table(data); // eslint-disable-line no-console
            });
};

RigidDB.prototype._setSchema = function(revision, schema) {
    let srcSchemaJSON = '';

    if (this.schema) {
        return Promise.resolve({ val: false, reason: 'Schema already exists', method: 'setSchema'});
    }

    try {
        srcSchemaJSON = JSON.stringify(schema);
    } catch(e) {
        return Promise.resolve({ val: false, reason: 'Invalid schema.', method: 'setSchema' });
    }

    let ret = this._normalizeAndVerifySchema(schema);

    if (ret.err) {
        return Promise.resolve({ val: false, reason: ret.err, method: 'setSchema' });
    }

    this.srcSchema = schema;
    this.schema = ret.schema;

    return this.client.set(`${this.prefix}:_schema`, srcSchemaJSON)
        .then(() => this.client.set(`${this.prefix}:_schemaRevision`, revision))
        .then(() => ({ val: true }));
};

RigidDB.prototype._normalizeAndVerifySchema = function(schema) {
    schema = clone(schema);

    if (typeof(schema) !== 'object' || schema === null) {
        return { err: 'Invalid schema.' };
    }

    let collections = Object.keys(schema);

    if (collections.length === 0) {
        return { err: 'At least one collection must be defined.' };
    }

    for (let collectionName of collections) {
        let definition = schema[collectionName].definition;
        let indices =  schema[collectionName].indices || {};

        if (!definition) {
            return { err: 'Definition missing.' };
        }

        let fieldNames = Object.keys(definition);

        for (let fieldName of fieldNames) {
            if (!onlyLettersNumbersDashes(fieldName)) {
                return { err: `Invalid field name (letters, numbers, and dashes allowed): '${fieldName}'` };
            }

            if (typeof(definition[fieldName]) === 'string') {
                definition[fieldName] = { type: definition[fieldName] };
            }

            let type = definition[fieldName];

            if (!type || !type.type) {
                return { err: `Type definition missing.` };
            }

            if (!/^(string|int|boolean|date|timestamp)$/.test(type.type)) {
                return { err: `Invalid type: '${type.type}'` };
            }

            type.allowMulti = !!type.allowMulti;
        }

        for (let indexName in indices) {
            let index = indices[indexName];

            if (!(index.uniq === true || index.uniq === false)) {
                return { err: 'Invalid or missing index unique definition' };
            }

            if (!index.fields || !(index.fields instanceof Array) || index.fields.length == 0) {
                return { err: 'Invalid or missing index fields definition' };
            }

            let normalizedIndexFields = [];

            for (let field of index.fields) {
                if (typeof(field) === 'string') {
                    field = { name: field, caseInsensitive: false };
                }

                if (fieldNames.indexOf(field.name) === -1) {
                    return { err: `Invalid index field: '${field.name}'` };
                }

                for (let indexFieldProp of Object.keys(field)) {
                    if (indexFieldProp !== 'name' && indexFieldProp !== 'caseInsensitive') {
                        return { err: `Invalid index field property: '${indexFieldProp}'` };
                    }
                }

                field.caseInsensitive = !!field.caseInsensitive;
                normalizedIndexFields.push(field);
            }

            index.fields = normalizedIndexFields;
        }
    }

    return { err: false, schema: schema };
};

RigidDB.prototype._getSchema = function() {
    return Promise.resolve(this.schema ? { val: { revision: 1, schema: this.srcSchema } } :
        { val: false, err: 'schemaMissing', method: 'getSchema'});
};

RigidDB.prototype._execMultiNow = function(cb) {
    let ctx = newContext();

    if (this.invalidSavedSchema) {
        ctx.error = { method: 'multi', err: 'badSavedSchema' };
    } else if (!this.schema) {
        ctx.error = { method: 'multi', err: 'schemaMissing' };
    } else {
        const execute = (op, methodName, args) => {
            let collection = args[0];

            if (!this.schema[collection]) {
                ctx.error = { method: methodName, err: 'unknownCollection' };
            }

            if (!ctx.error) {
                this[op].apply(this, [ ctx ].concat(args));
            }
        };

        let api = {
            create: (collection, attrs) => execute('_create', 'create', [ collection, attrs ]),
            update: (collection, id, attrs) => execute('_update', 'update', [ collection, id, attrs ]),
            delete: (collection, id) => execute('_delete', 'delete', [ collection, id ]),
            get: (collection, id) => execute('_get', 'get', [ collection, id ]),
            exists: (collection, id) => execute('_exists', 'exists', [ collection, id ])
        };

        cb(api);
    }

    return this._exec(ctx);
};

RigidDB.prototype._execSingle = function() {
    let args = Array.prototype.slice.call(arguments);
    let method = args.shift();
    let methodName = args.shift();

    let ctx = newContext();

    return this._whenSchemaLoaded(() => this._execSingleNow(ctx, method, methodName, args));
};

RigidDB.prototype._execSingleNow = function(ctx, method, methodName, args) {
    let collection = args[0];

    if (this.invalidSavedSchema) {
        ctx.error = { method: methodName, err: 'badSavedSchema' };
    } else if (!this.schema) {
        ctx.error = { method: methodName, err: 'schemaMissing' };
    } else if (!this.schema[collection]) {
        ctx.error = { method: methodName, err: 'unknownCollection' };
    }

    if (!ctx.error) {
        args.unshift(ctx);
        method.apply(this, args);
    }

    return this._exec(ctx);
};

RigidDB.prototype._exec = function(ctx) {
    if (ctx.error) {
        return Promise.resolve({ val: false, err: ctx.error.err, method: ctx.error.method });
    }

    let code = `${utilityFuncs()}\n local ret = { 'none', 'noError' }\n ${ctx.script}\n return ret`;

    let sha1 = crypto.createHash('sha1').update(code).digest('hex');
    let evalParams = [ sha1, 0 ].concat(ctx.params);

    debug(`PARAMETERS : ${ctx.params}`);
    debug(code);

    const decodeResult = ret => {
        let method = ret[0];
        let err = ret[1];
        let val = ret[2];

        if (err != 'noError') {
            if (method === 'create' || method == 'update') {
                return { val: false, err: err, method: method, indices: val || [] };
            } else {
                return { val: false, err: err, method: method };
            }
        }

        if (method === 'get') {
            val = this._denormalizeAttrs(ret[3], val);
        } else if (method === 'exists') {
            val = !!val; // Lua returns 0 (not found) or 1 (found)
        } else if (method === 'list' || method === 'find') {
            val = val.map(item => parseInt(item));
        } else if (method === 'update' || method === 'delete' || method === 'none') {
            val = true;
        }

        return { val: val };
    };

    const redisEval = (failure) => this.client.evalsha(evalParams).then(decodeResult, failure);

    // Try to evaluate by SHA first. If that fails, load the script. If it still fails, give up and
    // do nothing.
    return redisEval(() => this.client.script('load', code).then(redisEval));
};

RigidDB.prototype._whenSchemaLoaded = function(cb) {
    return this.schemaLoading ? this.schemaPromise.then(cb) : cb();
};

RigidDB.prototype._create = function(ctx, collection, attrs) {
    let redisAttrs = this._normalizeAttrs(collection, attrs);

    if (redisAttrs.err) {
        ctx.error = { method: 'create', err: redisAttrs.err };
        return;
    }

    if (Object.keys(this.schema[collection].definition).sort().join(':') !==
        Object.keys(redisAttrs.val).sort().join(':')) {
        ctx.error = { method: 'create', err: 'badParameter' };
        return;
    }

    genCode(ctx, `local id = redis.call('INCR', '${this.prefix}:${collection}:nextid')`);
    genCode(ctx, `local key = '${this.prefix}:${collection}:' .. id`);
    this._addValuesVar(ctx, redisAttrs.val);

    this._addIndices(ctx, collection, 'create');

    genCode(ctx, `hmset(key, values)`);
    genCode(ctx, `redis.call('ZADD', '${this.prefix}:${collection}:ids', id, id)`);

    genCode(ctx, `ret = { 'create', 'noError', id }`);
};

RigidDB.prototype._update = function(ctx, collection, id, attrs) {
    let redisAttrs = this._normalizeAttrs(collection, attrs);

    if (redisAttrs.err) {
        ctx.error = { method: 'update', err: redisAttrs.err };
        return;
    }

    genCode(ctx, `local id = ARGV[${ctx.paramCounter++}]`);
    pushParams(ctx, id);

    genCode(ctx, `local key = '${this.prefix}:${collection}:' .. id`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'update', 'notFound' } end`);
    genCode(ctx, `local values = hgetall(key)`);

    for (let prop in redisAttrs.val) {
        genCode(ctx, `values['${prop}'] = ARGV[${ctx.paramCounter++}]`);
        pushParams(ctx, redisAttrs.val[prop]);
    }

    let indices = this._genAllIndices(ctx, collection);
    this._assertUniqIndicesFree(ctx, collection, indices, 'update');

    genCode(ctx, `values = hgetall(key)`);
    this._removeIndices(ctx, collection, 'update');

    for (let prop in redisAttrs.val) {
        genCode(ctx, `values['${prop}'] = ARGV[${ctx.paramCounter++}]`);
        pushParams(ctx, redisAttrs.val[prop]);
    }

    this._addIndices(ctx, collection, 'update');

    genCode(ctx, `hmset(key, values)`);
    genCode(ctx, `ret = { 'update', 'noError', true }`);
};

RigidDB.prototype._delete = function(ctx, collection, id) {
    genCode(ctx, `local id = ARGV[${ctx.paramCounter++}]`);
    genCode(ctx, `local key = '${this.prefix}:${collection}:' .. id`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'delete', 'notFound' } end`);
    genCode(ctx, `local values = hgetall(key)`);

    this._removeIndices(ctx, collection, 'delete');

    genCode(ctx, `redis.call('ZREM', '${this.prefix}:${collection}:ids', id)`);
    genCode(ctx, `redis.call('DEL', key)`);
    genCode(ctx, `ret = { 'delete', 'noError' }`);

    pushParams(ctx, id);
};

RigidDB.prototype._get = function(ctx, collection, id) {
    genCode(ctx, `local key = '${this.prefix}:${collection}:' .. ARGV[${ctx.paramCounter++}]`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'get', 'notFound' } end`);
    genCode(ctx, `ret = { 'get', 'noError', redis.call('HGETALL', key), '${collection}' }`);

    pushParams(ctx, id);
};

RigidDB.prototype._exists = function(ctx, collection, id) {
    genCode(ctx, `local key = '${this.prefix}:${collection}:' .. ARGV[${ctx.paramCounter++}]`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'exists', 'noError', 0 } end`);
    genCode(ctx, `ret = { 'exists', 'noError', 1 }`);

    pushParams(ctx, id);
};

RigidDB.prototype._size = function(ctx, collection) {
    genCode(ctx, `local key = '${this.prefix}:${collection}:ids'`);
    genCode(ctx, `if redis.call("EXISTS", key) == 0 then return { 'size', 'noError', 0 } end`);
    genCode(ctx, `ret = { 'size', 'noError', redis.call('ZCARD', key) }`);
};

RigidDB.prototype._list = function(ctx, collection) {
    genCode(ctx, `local key = '${this.prefix}:${collection}:ids'`);
    genCode(ctx, `ret = { 'list', 'noError', redis.call("ZRANGE", key, 0, -1) }`);
};

RigidDB.prototype._find = function(ctx, collection, attrs) {
    let indices = this.schema[collection].indices;
    let searchFields = Object.keys(attrs).sort().join();
    let index = false;

    for (let indexName in indices) {
        let candidateIndex = indices[indexName];

        if (candidateIndex.fields.map(field => field.name).sort().join() === searchFields) {
            index = candidateIndex;
            break;
        }
    }

    if (!index) {
        ctx.error = { method: 'find', err: 'unknownIndex' };
        return;
    }

    let redisAttrs = this._normalizeAttrs(collection, attrs);

    if (redisAttrs.err) {
        ctx.error = { method: 'find', err: redisAttrs.err };
        return;
    }

    this._addValuesVar(ctx, redisAttrs.val);

    let name = this._indexName(collection, index);
    let prop = this._indexValues(index);

    genCode(ctx, `local result = redis.call('HGET', '${name}', ${prop})`);
    genCode(ctx, `if result ~= false then`);
    genCode(ctx, `result = { result }`);
    genCode(ctx, `else`);
    genCode(ctx, `result = redis.call('SMEMBERS', '${name}:' .. ${prop})`);
    genCode(ctx, `end`);
    genCode(ctx, `ret = { 'find', 'noError', result }`);
};

RigidDB.prototype._genAllIndices = function(ctx, collection) {
    let indices = this.schema[collection].indices;
    let redisIndices = [];

    // { name: "color:mileage", value: 'red:423423', uniq: false }

    for (let indexName in indices) {
        let index = indices[indexName];

        redisIndices.push({
            name: indexName,
            redisKey: this._indexName(collection, index),
            redisValue: this._indexValues(index),
            fields: index.fields,
            uniq: index.uniq
        });
    }

    return redisIndices;
};

RigidDB.prototype._indexName = function(collection, index) {
    let fields = index.fields.map(field => field.name);

    return `${this.prefix}:${collection}:i:${fields.sort().join(':')}`;
};

RigidDB.prototype._indexValues = function(index) {
    return index.fields.sort((a, b) => (a.name < b.name) ? -1 : ((a.name > b.name) ? 1 : 0)).map(field => {
        let valueCode = `values["${field.name}"]`;

        if (field.caseInsensitive) {
            valueCode = `string.lower(${valueCode})`;
        }

        // Lua gsub returns two values. Extra parenthesis are used to discard the second value.
        return `(string.gsub(${valueCode}, ':', '::'))`;
    }).join(`..':'..`);
};

RigidDB.prototype._assertUniqIndicesFree = function(ctx, collection, indices, method) {
    genCode(ctx, `local nonUniqIndices, uniqError = {}, false`);

    for (let index of indices) {
        if (index.uniq) {
            let notNullCheck = index.fields.map(field => `values["${field.name}"] ~= '~'`).join(' and ');

            genCode(ctx, `local currentIndex = redis.call('HGET', '${index.redisKey}', ${index.redisValue})`);
            genCode(ctx, `if currentIndex and currentIndex ~= id and ${notNullCheck} then`);
            genCode(ctx, `table.insert(nonUniqIndices, '${index.name}')`);
            genCode(ctx, `uniqError = true`);
            genCode(ctx, `end`);
        }
    }

    genCode(ctx, `if uniqError then`);
    genCode(ctx, `return { '${method}', 'notUnique', nonUniqIndices }`);
    genCode(ctx, `end`);

    return indices;
};

RigidDB.prototype._addIndices = function(ctx, collection, method) {
    let indices = this._genAllIndices(ctx, collection);
    this._assertUniqIndicesFree(ctx, collection, indices, method);

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

        if (!propType) {
            continue;
        }

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

RigidDB.prototype._denormalizeAttrsForPrinting = function(collection, redisObject) {
    let ret = {};

    for (let prop of Object.keys(redisObject)) {
        let redisVal = redisObject[prop];
        let propType = this.schema[collection].definition[prop];

        if (redisVal === '~') {
            ret[prop] = '[NULL]';
        } else {
            switch (propType.type) {
                case 'int':
                    ret[prop] = parseInt(redisVal);
                    break;
                case 'string':
                    if (/^~+$/.test(redisVal)) {
                        redisVal = redisVal.substring(1);
                    }

                    ret[prop] = `"${redisVal}"`;
                    break;
                case 'date':
                    ret[prop] = new Date(redisVal).toString();
                    break;
                case 'timestamp':
                    ret[prop] = new Date(parseInt(redisVal)).toString();
                    break;
            }
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
    ctx.script += `${lua}\n`;
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
