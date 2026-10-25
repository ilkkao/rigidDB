import { createHash } from 'node:crypto';
import createDebug from 'debug';
import { Redis, type RedisOptions } from 'ioredis';

const debug = createDebug('rigiddb');

export type FieldType = 'string' | 'int' | 'boolean' | 'date' | 'timestamp';

export interface FieldDefinition {
    type: FieldType;
    allowNull?: boolean;
}

export interface IndexField {
    name: string;
    caseInsensitive?: boolean;
}

export interface IndexDefinition {
    unique: boolean;
    fields: readonly (string | IndexField)[];
}

export interface CollectionDefinition {
    fields: Readonly<Record<string, FieldType | FieldDefinition>>;
    indexes?: Readonly<Record<string, IndexDefinition>>;
}

export type Schema = Readonly<Record<string, CollectionDefinition>>;

export type FieldValue = string | number | boolean | Date | null;
export type FieldValues = Record<string, FieldValue>;

// Returns the schema as it is. Lets TypeScript keep the literal types of the schema without
// `as const`, for use as the type argument of RigidDB: new RigidDB<typeof schema>(...)
export function defineSchema<const S extends Schema>(schema: S): S {
    return schema;
}

export type CollectionName<S extends Schema> = keyof S & string;

type FieldsOf<S extends Schema, C extends CollectionName<S>> = S[C]['fields'];

type TypeOf<F> = F extends FieldType ? F : F extends { type: infer T extends FieldType } ? T : never;

type ValueOf<T extends FieldType> =
    T extends 'string' ? string : T extends 'int' ? number : T extends 'boolean' ? boolean : Date;

type NullOf<F> = F extends { allowNull: false } ? never : null;

// The field values of a record in collection C
export type RecordOf<S extends Schema, C extends CollectionName<S>> = {
    -readonly [K in keyof FieldsOf<S, C>]: ValueOf<TypeOf<FieldsOf<S, C>[K]>> | NullOf<FieldsOf<S, C>[K]>;
};

type IndexFieldName<F> = F extends string ? F : F extends { name: infer N extends string } ? N : never;

type IndexesOf<S extends Schema, C extends CollectionName<S>> = NonNullable<S[C]['indexes']>;

type IndexFieldsOf<S extends Schema, C extends CollectionName<S>, I extends keyof IndexesOf<S, C>> =
    IndexFieldName<IndexesOf<S, C>[I]['fields'][number]> & keyof RecordOf<S, C>;

// A find() query: values for exactly the fields of one of the indexes of collection C. The other
// fields are typed never, so that a query can't mix the fields of two indexes.
export type IndexQuery<S extends Schema, C extends CollectionName<S>> = {
    [I in keyof IndexesOf<S, C>]: Pick<RecordOf<S, C>, IndexFieldsOf<S, C, I>> &
        { [K in Exclude<keyof RecordOf<S, C>, IndexFieldsOf<S, C, I>>]?: never };
}[keyof IndexesOf<S, C>];

export type Method =
    | 'setSchema'
    | 'getSchema'
    | 'create'
    | 'update'
    | 'delete'
    | 'get'
    | 'exists'
    | 'list'
    | 'count'
    | 'currentId'
    | 'find'
    | 'transaction';

export type ErrorCode =
    | 'invalidStoredSchema'
    | 'schemaMissing'
    | 'unknownCollection'
    | 'unknownIndex'
    | 'missingFields'
    | 'nullNotAllowed'
    | 'wrongType'
    | 'notFound'
    | 'notUnique'
    | 'invalidSchema'
    | 'schemaExists';

export interface RigidDBErrorDetails {
    // Names of the violated unique indexes, set for notUnique
    indexes?: string[];
    // Why the schema is invalid, set for invalidSchema
    reason?: string;
}

// Thrown by all API methods when an operation fails. Errors from Redis itself are thrown as they are.
export class RigidDBError extends Error {
    readonly code: ErrorCode;
    readonly method: Method;
    declare readonly indexes?: string[];
    declare readonly reason?: string;

    constructor(method: Method, code: ErrorCode, details: RigidDBErrorDetails = {}) {
        const detail = details.reason ?? details.indexes?.join(', ');

        super(`${method}() failed: ${code}${detail === undefined ? '' : ` (${detail})`}`);

        this.name = 'RigidDBError';
        this.code = code;
        this.method = method;
        Object.assign(this, details);
    }
}

// All ioredis options except keyPrefix, which the Lua scripts can't honor, and replyMapping
export type RedisConnectionOptions = Omit<RedisOptions, 'keyPrefix' | 'replyMapping'>;

// An existing ioredis client, a redis:// or rediss:// URL, or ioredis options
export type Connection = Redis | string | RedisConnectionOptions;

export interface Transaction<S extends Schema = Schema> {
    create<C extends CollectionName<S>>(collection: C, values: RecordOf<S, C>): void;
    update<C extends CollectionName<S>>(collection: C, id: RecordId, values: Partial<RecordOf<S, C>>): void;
    delete(collection: CollectionName<S>, id: RecordId): void;
    get(collection: CollectionName<S>, id: RecordId): void;
    exists(collection: CollectionName<S>, id: RecordId): void;
}

export type RecordId = number | string;

interface NormalizedField {
    type: FieldType;
    allowNull: boolean;
}

interface NormalizedIndexField {
    name: string;
    caseInsensitive: boolean;
}

interface NormalizedIndex {
    unique: boolean;
    fields: NormalizedIndexField[];
}

interface NormalizedCollection {
    fields: Record<string, NormalizedField>;
    indexes: Record<string, NormalizedIndex>;
}

type NormalizedSchema = Record<string, NormalizedCollection>;

interface RedisIndex {
    name: string;
    redisKey: string;
    redisValue: string;
    fields: NormalizedIndexField[];
    unique: boolean;
}

// Collects the Lua code and the parameters of a script
class Context {
    readonly params: string[] = [];
    script = '';
    error: { method: Method; err: ErrorCode } | null = null;
    inTransaction = false;
    private depth = 0;

    // Appends Lua code. The common indentation of the snippet is replaced with the indentation of
    // the current block, so the generated script is indented like hand-written Lua.
    lua(code: string): void {
        const prefix = '    '.repeat(this.depth);

        for (const line of dedent(code)) {
            this.script += `${`${prefix}${line}`.trimEnd()}\n`;
        }
    }

    // Lua code added by the callback is indented one level deeper
    indented(cb: () => void): void {
        this.depth++;
        cb();
        this.depth--;
    }

    // Passes the value to the script as a parameter and returns the Lua expression referring to it
    arg(value: RecordId): string {
        this.params.push(String(value));

        return `ARGV[${this.params.length}]`;
    }
}

type Op<A extends unknown[]> = (ctx: Context, collection: string, ...args: A) => void;

// Lua script return value: [ method, error code, value, collection ]
type ScriptReturn = [Method | 'none', ErrorCode | 'noError', unknown?, string?];

const FIELD_TYPES: readonly string[] = ['string', 'int', 'boolean', 'date', 'timestamp'];

// S is the type of the schema. Without it, collections and values are checked only at runtime.
export class RigidDB<S extends Schema = Schema> {
    readonly prefix: string;
    readonly revision: number;
    readonly client: Redis;

    // A client passed in by the caller is left open by quit()
    private readonly ownsClient: boolean;
    private invalidStoredSchema = false;
    private schema: NormalizedSchema | null = null;
    private srcSchema: S | null = null;
    private schemaPromise: Promise<void> | null = null;

    constructor(
        prefix: string,
        revision: number,
        connection: Connection = {},
        redisErrorHandler?: (err: Error) => void
    ) {
        if (typeof prefix !== 'string' || !onlyLetters(prefix)) {
            throw new Error('Invalid prefix.');
        }

        if (!Number.isInteger(revision)) {
            throw new Error('Invalid revision.');
        }

        this.prefix = prefix;
        this.revision = revision;

        // Duck typing instead of instanceof works also when the caller has another copy of ioredis
        if (isRedisClient(connection)) {
            this.client = connection;
            this.ownsClient = false;
        } else {
            this.client = typeof connection === 'string' ? new Redis(connection) : new Redis(connection);
            this.ownsClient = true;
        }

        if (this.client.options.keyPrefix) {
            if (this.ownsClient) {
                this.client.disconnect();
            }

            throw new Error('The keyPrefix option of ioredis is not supported, use the database name instead.');
        }

        if (redisErrorHandler) {
            this.client.on('error', redisErrorHandler);
        }

        // Start loading the schema right away. A failure is reported (and loading retried) by the
        // next API call.
        this.ensureSchema().catch(() => {});
    }

    // Closes the connection, unless the client was passed to the constructor
    async quit(): Promise<void> {
        if (this.ownsClient) {
            await this.client.quit();
        }
    }

    async setSchema(schema: S): Promise<void> {
        await this.ensureSchema();
        return this.setSchemaNow(schema);
    }

    async getSchema(): Promise<{ revision: number; schema: S }> {
        await this.ensureSchema();

        if (!this.schema || !this.srcSchema) {
            throw new RigidDBError('getSchema', 'schemaMissing');
        }

        return { revision: this.revision, schema: this.srcSchema };
    }

    // Resolves to the id of the new record
    create<C extends CollectionName<S>>(collection: C, values: RecordOf<S, C>): Promise<number> {
        return this.execSingle(this.createOp, 'create', collection, values);
    }

    // Resolves to the number of fields that changed
    update<C extends CollectionName<S>>(collection: C, id: RecordId, values: Partial<RecordOf<S, C>>): Promise<number> {
        return this.execSingle(this.updateOp, 'update', collection, id, values as FieldValues);
    }

    delete(collection: CollectionName<S>, id: RecordId): Promise<void> {
        return this.execSingle(this.deleteOp, 'delete', collection, id);
    }

    get<C extends CollectionName<S>>(collection: C, id: RecordId): Promise<RecordOf<S, C>> {
        return this.execSingle(this.getOp, 'get', collection, id);
    }

    exists(collection: CollectionName<S>, id: RecordId): Promise<boolean> {
        return this.execSingle(this.existsOp, 'exists', collection, id);
    }

    list(collection: CollectionName<S>): Promise<number[]> {
        return this.execSingle(this.listOp, 'list', collection);
    }

    count(collection: CollectionName<S>): Promise<number> {
        return this.execSingle(this.countOp, 'count', collection);
    }

    currentId(collection: CollectionName<S>): Promise<number> {
        return this.execSingle(this.currentIdOp, 'currentId', collection);
    }

    find<C extends CollectionName<S>>(collection: C, query: IndexQuery<S, C>): Promise<number[]> {
        return this.execSingle(this.findOp, 'find', collection, query);
    }

    // Resolves to the return value of the last operation in the transaction. An exists() that
    // finds no record aborts the transaction with notFound.
    async transaction(cb: (tr: Transaction<S>) => void): Promise<unknown> {
        await this.ensureSchema();

        const ctx = new Context();

        ctx.inTransaction = true;

        if (this.invalidStoredSchema) {
            ctx.error = { method: 'transaction', err: 'invalidStoredSchema' };
        } else if (!this.schema) {
            ctx.error = { method: 'transaction', err: 'schemaMissing' };
        } else {
            const execute = <A extends unknown[]>(op: Op<A>, method: Method, collection: string, ...args: A) => {
                if (!ctx.error) {
                    this.runOp(ctx, op, method, collection, args);
                }
            };

            cb({
                create: (collection, values) => execute(this.createOp, 'create', collection, values),
                update: (collection, id, values) => execute(this.updateOp, 'update', collection, id, values as FieldValues),
                delete: (collection, id) => execute(this.deleteOp, 'delete', collection, id),
                get: (collection, id) => execute(this.getOp, 'get', collection, id),
                exists: (collection, id) => execute(this.existsOp, 'exists', collection, id)
            });
        }

        return this.exec(ctx);
    }

    // Print is for debugging, doesn't scale currently
    async debugPrint(collection: CollectionName<S>): Promise<void> {
        await this.ensureSchema();

        const data: Record<string, string>[] = [];

        if (this.collectionSchema(collection)) {
            const ids = await this.client.zrange(`${this.keyPrefix}:${collection}:ids`, 0, '-1');

            for (const id of ids) {
                const result = await this.client.hgetall(`${this.keyPrefix}:${collection}:${id}`);
                data.push({ ...this.printableValues(collection, result), id });
            }
        }

        console.table(data);
    }

    private get keyPrefix(): string {
        return `${this.prefix}-${this.revision}`;
    }

    private ensureSchema(): Promise<void> {
        this.schemaPromise ??= this.loadSchema().catch((err: unknown) => {
            this.schemaPromise = null;
            throw err;
        });

        return this.schemaPromise;
    }

    private async loadSchema(): Promise<void> {
        const result = await this.client.get(`${this.keyPrefix}:_schema`);

        if (!result) {
            return;
        }

        let srcSchema: unknown;

        try {
            srcSchema = upgradeLegacySchema(JSON.parse(result));
        } catch {
            this.invalidStoredSchema = true;
            return;
        }

        const ret = normalizeAndVerifySchema(srcSchema);

        if ('err' in ret) {
            this.invalidStoredSchema = true;
        } else {
            this.srcSchema = srcSchema as S;
            this.schema = ret.schema;
        }
    }

    private async setSchemaNow(schema: S): Promise<void> {
        if (this.schema) {
            throw new RigidDBError('setSchema', 'schemaExists');
        }

        let srcSchemaJSON: string | undefined;

        try {
            srcSchemaJSON = JSON.stringify(schema);
        } catch {
            // Circular reference
        }

        if (srcSchemaJSON === undefined) {
            throw new RigidDBError('setSchema', 'invalidSchema', { reason: 'Invalid schema.' });
        }

        // Work with a copy so that later changes to the caller's object don't leak in.
        const srcSchema: unknown = JSON.parse(srcSchemaJSON);
        const ret = normalizeAndVerifySchema(srcSchema);

        if ('err' in ret) {
            throw new RigidDBError('setSchema', 'invalidSchema', { reason: ret.err });
        }

        this.srcSchema = srcSchema as S;
        this.schema = ret.schema;

        await this.client.set(`${this.keyPrefix}:_schema`, srcSchemaJSON);
    }

    private async execSingle<T, A extends unknown[]>(
        op: Op<A>,
        method: Method,
        collection: string,
        ...args: A
    ): Promise<T> {
        await this.ensureSchema();

        const ctx = new Context();

        if (this.invalidStoredSchema) {
            ctx.error = { method, err: 'invalidStoredSchema' };
        } else if (!this.schema) {
            ctx.error = { method, err: 'schemaMissing' };
        } else {
            this.runOp(ctx, op, method, collection, args);
        }

        return this.exec(ctx) as Promise<T>;
    }

    private runOp<A extends unknown[]>(ctx: Context, op: Op<A>, method: Method, collection: string, args: A): void {
        if (!this.collectionSchema(collection)) {
            ctx.error = { method, err: 'unknownCollection' };
            return;
        }

        // Every operation gets its own Lua block. Lua allows max 200 local variables per function,
        // a long transaction() would otherwise run out of them.
        ctx.lua('do');
        ctx.indented(() => op.call(this, ctx, collection, ...args));
        ctx.lua('end');
    }

    private async exec(ctx: Context): Promise<unknown> {
        if (ctx.error) {
            throw new RigidDBError(ctx.error.method, ctx.error.err);
        }

        const code = `${utilityFuncs()}\n\nlocal ret = { 'none', 'noError' }\n${ctx.script}return ret\n`;
        const sha1 = createHash('sha1').update(code).digest('hex');

        debug(`PARAMETERS : ${ctx.params.join(', ')}`);
        debug(code);

        let ret: unknown;

        try {
            ret = await this.client.evalsha(sha1, 0, ...ctx.params);
        } catch (err) {
            // Only a missing script is retried. Any other failure may have happened after
            // the script had already modified the data.
            if (!(err instanceof Error) || !err.message.startsWith('NOSCRIPT')) {
                throw err;
            }

            ret = await this.client.eval(code, 0, ...ctx.params);
        }

        return this.decodeResult(ret as ScriptReturn);
    }

    private decodeResult([method, err, val, collection]: ScriptReturn): unknown {
        if (method === 'none') {
            return undefined;
        }

        if (err !== 'noError') {
            throw new RigidDBError(method, err, err === 'notUnique' ? { indexes: val as string[] } : {});
        }

        switch (method) {
            case 'get':
                return this.processRedisGetReturnValue(collection as string, val as string[]);
            case 'exists':
                return val === 1; // Lua returns 0 (not found) or 1 (found)
            case 'currentId':
                return parseInt(String(val), 10);
            case 'list':
            case 'find':
                return (val as string[]).map(item => parseInt(item, 10));
            case 'delete':
                return undefined;
            default:
                return val;
        }
    }

    private collectionSchema(collection: string): NormalizedCollection | undefined {
        return this.schema && Object.hasOwn(this.schema, collection) ? this.schema[collection] : undefined;
    }

    // Only called after runOp() or debugPrint() has checked that the collection exists
    private requireCollectionSchema(collection: string): NormalizedCollection {
        return this.collectionSchema(collection)!;
    }

    private createOp(ctx: Context, collection: string, values: FieldValues): void {
        const redisValues = this.toRedisValues(collection, values);

        if ('err' in redisValues) {
            ctx.error = { method: 'create', err: redisValues.err };
            return;
        }

        const fields = this.requireCollectionSchema(collection).fields;

        if (Object.keys(fields).toSorted().join(':') !== Object.keys(redisValues.val).toSorted().join(':')) {
            ctx.error = { method: 'create', err: 'missingFields' };
            return;
        }

        ctx.lua(`
            local id = redis.call('INCR', '${this.keyPrefix}:${collection}:nextid')
            local key = '${this.keyPrefix}:${collection}:' .. id
        `);
        this.addValuesVar(ctx, redisValues.val);

        this.addIndexes(ctx, collection, 'create', true);

        ctx.lua(`
            hset(key, values)
            redis.call('ZADD', '${this.keyPrefix}:${collection}:ids', id, id)
            ret = { 'create', 'noError', id }
        `);
    }

    private updateOp(ctx: Context, collection: string, id: RecordId, values: FieldValues): void {
        const redisValues = this.toRedisValues(collection, values);

        if ('err' in redisValues) {
            ctx.error = { method: 'update', err: redisValues.err };
            return;
        }

        ctx.lua(`
            local id = ${ctx.arg(id)}
            local key = '${this.keyPrefix}:${collection}:' .. id
            if redis.call("EXISTS", key) == 0 then return { 'update', 'notFound' } end
            local values = hgetall(key)
            local chg = 0
        `);

        const argRefs = Object.entries(redisValues.val).map(([prop, val]) => [prop, ctx.arg(val)] as const);

        for (const [prop, ref] of argRefs) {
            ctx.lua(`
                if values['${prop}'] ~= ${ref} then chg = chg + 1 end
                values['${prop}'] = ${ref}
            `);
        }

        this.assertUniqueIndexesFree(ctx, this.genAllIndexes(collection), 'update');

        ctx.lua(`values = hgetall(key)`);
        this.removeIndexes(ctx, collection);

        for (const [prop, ref] of argRefs) {
            ctx.lua(`values['${prop}'] = ${ref}`);
        }

        // Uniqueness was verified above, before anything was modified
        this.addIndexes(ctx, collection, 'update', false);

        ctx.lua(`
            hset(key, values)
            ret = { 'update', 'noError', chg }
        `);
    }

    private deleteOp(ctx: Context, collection: string, id: RecordId): void {
        ctx.lua(`
            local id = ${ctx.arg(id)}
            local key = '${this.keyPrefix}:${collection}:' .. id
            if redis.call("EXISTS", key) == 0 then return { 'delete', 'notFound' } end
            local values = hgetall(key)
        `);

        this.removeIndexes(ctx, collection);

        ctx.lua(`
            redis.call('ZREM', '${this.keyPrefix}:${collection}:ids', id)
            redis.call('DEL', key)
            ret = { 'delete', 'noError' }
        `);
    }

    private getOp(ctx: Context, collection: string, id: RecordId): void {
        ctx.lua(`
            local key = '${this.keyPrefix}:${collection}:' .. ${ctx.arg(id)}
            if redis.call("EXISTS", key) == 0 then return { 'get', 'notFound' } end
            ret = { 'get', 'noError', redis.call('HGETALL', key), '${collection}' }
        `);
    }

    private existsOp(ctx: Context, collection: string, id: RecordId): void {
        // In a transaction, a missing record aborts the transaction
        const missing = ctx.inTransaction ? `{ 'exists', 'notFound' }` : `{ 'exists', 'noError', 0 }`;

        ctx.lua(`
            local key = '${this.keyPrefix}:${collection}:' .. ${ctx.arg(id)}
            if redis.call("EXISTS", key) == 0 then return ${missing} end
            ret = { 'exists', 'noError', 1 }
        `);
    }

    private countOp(ctx: Context, collection: string): void {
        ctx.lua(`ret = { 'count', 'noError', redis.call('ZCARD', '${this.keyPrefix}:${collection}:ids') }`);
    }

    private currentIdOp(ctx: Context, collection: string): void {
        ctx.lua(`ret = { 'currentId', 'noError', redis.call('GET', '${this.keyPrefix}:${collection}:nextid') or 0 }`);
    }

    private listOp(ctx: Context, collection: string): void {
        ctx.lua(`ret = { 'list', 'noError', redis.call('ZRANGE', '${this.keyPrefix}:${collection}:ids', 0, -1) }`);
    }

    private findOp(ctx: Context, collection: string, values: FieldValues): void {
        const indexes = this.requireCollectionSchema(collection).indexes;
        const searchFields = Object.keys(values).toSorted().join();
        const index = Object.values(indexes).find(candidate =>
            candidate.fields.map(field => field.name).toSorted().join() === searchFields);

        if (!index) {
            ctx.error = { method: 'find', err: 'unknownIndex' };
            return;
        }

        const redisValues = this.toRedisValues(collection, values);

        if ('err' in redisValues) {
            ctx.error = { method: 'find', err: redisValues.err };
            return;
        }

        this.addValuesVar(ctx, redisValues.val);

        const name = this.indexName(collection, index);
        const prop = indexValues(index);

        ctx.lua(`
            local result = redis.call('HGET', '${name}', ${prop})
            if result ~= false then
                result = { result }
            else
                result = redis.call('SMEMBERS', '${name}:' .. ${prop})
            end
            ret = { 'find', 'noError', result }
        `);
    }

    private genAllIndexes(collection: string): RedisIndex[] {
        const indexes = this.requireCollectionSchema(collection).indexes;

        // { name: "color:mileage", value: 'red:423423', unique: false }
        return Object.entries(indexes).map(([name, index]) => ({
            name,
            redisKey: this.indexName(collection, index),
            redisValue: indexValues(index),
            fields: index.fields,
            unique: index.unique
        }));
    }

    private indexName(collection: string, index: NormalizedIndex): string {
        const fields = index.fields.map(field => field.name).toSorted().join(':');

        return `${this.keyPrefix}:${collection}:i:${fields}`;
    }

    private assertUniqueIndexesFree(ctx: Context, indexes: RedisIndex[], method: Method): void {
        ctx.lua(`local nonUniqueIndexes, uniqueError = {}, false`);

        for (const index of indexes.filter(candidate => candidate.unique)) {
            const notNullCheck = index.fields.map(field => `values["${field.name}"] ~= '~'`).join(' and ');

            ctx.lua(`
                do
                    local currentIndex = redis.call('HGET', '${index.redisKey}', ${index.redisValue})
                    if currentIndex and currentIndex ~= tostring(id) and ${notNullCheck} then
                        table.insert(nonUniqueIndexes, '${index.name}')
                        uniqueError = true
                    end
                end
            `);
        }

        ctx.lua(`if uniqueError then return { '${method}', 'notUnique', nonUniqueIndexes } end`);
    }

    private addIndexes(ctx: Context, collection: string, method: Method, assertUniq: boolean): void {
        const indexes = this.genAllIndexes(collection);

        if (assertUniq) {
            this.assertUniqueIndexesFree(ctx, indexes, method);
        }

        for (const { redisKey, redisValue } of indexes) {
            ctx.lua(`
                do
                    local hashId = redis.call('HGET', '${redisKey}', ${redisValue})
                    local isSet = redis.call('EXISTS', '${redisKey}:' .. ${redisValue})
                    if not hashId and isSet == 0 then
                        redis.call('HSET', '${redisKey}', ${redisValue}, id)
                    elseif isSet == 0 then
                        redis.call('HDEL', '${redisKey}', ${redisValue})
                        redis.call('SADD', '${redisKey}:' .. ${redisValue}, id, hashId)
                    else
                        redis.call('SADD', '${redisKey}:' .. ${redisValue}, id)
                    end
                end
            `);
        }
    }

    private removeIndexes(ctx: Context, collection: string): void {
        for (const { redisKey, redisValue } of this.genAllIndexes(collection)) {
            ctx.lua(`
                do
                    local removed = redis.call('HDEL', '${redisKey}', ${redisValue})
                    if removed == 0 then
                        redis.call('SREM', '${redisKey}:' .. ${redisValue}, id)
                        local remaining = redis.call('SCARD', '${redisKey}:' .. ${redisValue})
                        if remaining == 1 then
                            local last = redis.call('SMEMBERS', '${redisKey}:' .. ${redisValue})
                            redis.call('DEL', '${redisKey}:' .. ${redisValue})
                            redis.call('HSET', '${redisKey}', ${redisValue}, last[1])
                        end
                    end
                end
            `);
        }
    }

    private addValuesVar(ctx: Context, values: Record<string, string>): void {
        const entries = Object.entries(values).map(([prop, val]) => `['${prop}'] = ${ctx.arg(val)}`);

        ctx.lua(`local values = { ${entries.join(', ')} }`);
    }

    private processRedisGetReturnValue(collection: string, redisRetVal: string[]): FieldValues {
        const redisObject: Record<string, string> = {};

        for (let i = 0; i + 1 < redisRetVal.length; i += 2) {
            redisObject[redisRetVal[i] as string] = redisRetVal[i + 1] as string;
        }

        return this.fromRedisValues(collection, redisObject);
    }

    private printableValues(collection: string, redisObject: Record<string, string>): Record<string, string> {
        const values = this.fromRedisValues(collection, redisObject);
        const fields = this.requireCollectionSchema(collection).fields;
        const printable: Record<string, string> = {};

        for (const [prop, val] of Object.entries(values)) {
            if (val === null) {
                printable[prop] = '[NULL]';
            } else if (fields[prop]?.type === 'string') {
                printable[prop] = `"${String(val)}"`;
            } else if (val instanceof Date) {
                printable[prop] = val.toISOString();
            } else {
                printable[prop] = String(val);
            }
        }

        return printable;
    }

    private toRedisValues(collection: string, values: FieldValues): { val: Record<string, string> } | { err: ErrorCode } {
        const redisValues: Record<string, string> = {};
        const fields = this.requireCollectionSchema(collection).fields;

        for (const [prop, propVal] of Object.entries(values)) {
            const field = Object.hasOwn(fields, prop) ? fields[prop] : undefined;

            if (!field) {
                continue;
            }

            if (propVal === null) {
                if (!field.allowNull) {
                    return { err: 'nullNotAllowed' };
                }

                redisValues[prop] = '~';
                continue;
            }

            const redisVal = toRedisValue(field.type, propVal);

            if (redisVal === null) {
                return { err: 'wrongType' };
            }

            redisValues[prop] = redisVal;
        }

        return { val: redisValues };
    }

    private fromRedisValues(collection: string, redisObject: Record<string, string>): FieldValues {
        const fields = this.requireCollectionSchema(collection).fields;
        const values: FieldValues = {};

        for (const [prop, redisVal] of Object.entries(redisObject)) {
            const type = fields[prop]?.type;

            values[prop] = redisVal === '~' || !type ? null : fromRedisValue(type, redisVal);
        }

        return values;
    }
}

export default RigidDB;

function toRedisValue(type: FieldType, val: Exclude<FieldValue, null>): string | null {
    switch (type) {
        case 'boolean':
            return typeof val === 'boolean' ? String(val) : null;
        case 'int':
            return typeof val === 'number' && Number.isFinite(val) ? String(val) : null;
        case 'string':
            if (typeof val !== 'string') {
                return null;
            }

            // '~' denotes null, strings consisting only of tildes are escaped with one extra tilde
            return /^~+$/.test(val) ? `~${val}` : val;
        case 'date':
            return isValidDate(val) ? val.toISOString() : null;
        case 'timestamp':
            return isValidDate(val) ? String(val.getTime()) : null;
    }
}

function fromRedisValue(type: FieldType, redisVal: string): FieldValue {
    switch (type) {
        case 'boolean':
            return redisVal === 'true';
        case 'int':
            return Number(redisVal);
        case 'string':
            return /^~+$/.test(redisVal) ? redisVal.substring(1) : redisVal;
        case 'date':
            // Also parses the Date.prototype.toString() format used by rigiddb <= 0.11
            return new Date(redisVal);
        case 'timestamp':
            return new Date(parseInt(redisVal, 10));
    }
}

function isValidDate(val: unknown): val is Date {
    return val instanceof Date && !Number.isNaN(val.getTime());
}

function normalizeAndVerifySchema(schema: unknown): { schema: NormalizedSchema } | { err: string } {
    if (!isObject(schema)) {
        return { err: 'Invalid schema.' };
    }

    const collections = Object.entries(schema);

    if (collections.length === 0) {
        return { err: 'At least one collection must be defined.' };
    }

    const normalized: NormalizedSchema = {};

    for (const [collectionName, collection] of collections) {
        if (!onlyLettersNumbersDashes(collectionName)) {
            return { err: `Invalid collection name (letters, numbers, and dashes allowed): '${collectionName}'` };
        }

        const fields = isObject(collection) ? collection['fields'] : undefined;
        const indexes = isObject(collection) ? collection['indexes'] ?? {} : {};

        if (!isObject(fields)) {
            return { err: 'Fields missing.' };
        }

        if (!isObject(indexes)) {
            return { err: 'Invalid indexes definition.' };
        }

        const normalizedFields: Record<string, NormalizedField> = {};

        for (const [fieldName, fieldDefinition] of Object.entries(fields)) {
            if (!onlyLettersNumbersDashes(fieldName)) {
                return { err: `Invalid field name (letters, numbers, and dashes allowed): '${fieldName}'` };
            }

            const field = typeof fieldDefinition === 'string' ? { type: fieldDefinition } : fieldDefinition;

            if (!isObject(field) || !field['type']) {
                return { err: `Type definition missing.` };
            }

            const type = field['type'];

            if (typeof type !== 'string' || !FIELD_TYPES.includes(type)) {
                return { err: `Invalid type: '${String(type)}'` };
            }

            normalizedFields[fieldName] = {
                type: type as FieldType,
                allowNull: field['allowNull'] === undefined ? true : !!field['allowNull']
            };
        }

        const normalizedIndexes: Record<string, NormalizedIndex> = {};

        for (const [indexName, index] of Object.entries(indexes)) {
            if (!onlyLettersNumbersDashes(indexName)) {
                return { err: `Invalid index name (letters, numbers, and dashes allowed): '${indexName}'` };
            }

            if (!isObject(index) || !(index['unique'] === true || index['unique'] === false)) {
                return { err: 'Invalid or missing index unique definition' };
            }

            const indexFields = index['fields'];

            if (!Array.isArray(indexFields) || indexFields.length === 0) {
                return { err: 'Invalid or missing index fields definition' };
            }

            const normalizedIndexFields: NormalizedIndexField[] = [];

            for (const indexField of indexFields as unknown[]) {
                const field = typeof indexField === 'string' ? { name: indexField, caseInsensitive: false } : indexField;

                if (!isObject(field)) {
                    return { err: 'Invalid or missing index fields definition' };
                }

                const name = field['name'];

                if (typeof name !== 'string' || !Object.hasOwn(normalizedFields, name)) {
                    return { err: `Invalid index field name: '${String(name)}'` };
                }

                for (const indexFieldProp of Object.keys(field)) {
                    if (indexFieldProp !== 'name' && indexFieldProp !== 'caseInsensitive') {
                        return { err: `Invalid index field property: '${indexFieldProp}'` };
                    }
                }

                normalizedIndexFields.push({ name, caseInsensitive: !!field['caseInsensitive'] });
            }

            normalizedIndexes[indexName] = { unique: index['unique'], fields: normalizedIndexFields };
        }

        normalized[collectionName] = { fields: normalizedFields, indexes: normalizedIndexes };
    }

    return { schema: normalized };
}

type LegacySchema = Record<string, { definition: unknown; indices?: Record<string, { uniq: unknown }> }>;

// Schemas stored by rigiddb 0.x use the keys definition, indices, and uniq
function upgradeLegacySchema(schema: unknown): unknown {
    if (!isObject(schema) || !Object.values(schema).every(collection => isObject(collection) && 'definition' in collection)) {
        return schema;
    }

    return Object.fromEntries(Object.entries(schema as LegacySchema).map(([name, { definition, indices, ...rest }]) => [name, {
        ...rest,
        fields: definition,
        indexes: Object.fromEntries(Object.entries(indices ?? {}).map(([indexName, { uniq, ...index }]) =>
            [indexName, { ...index, unique: uniq }]))
    }]));
}

function indexValues(index: NormalizedIndex): string {
    return index.fields
        // Same order as the default sort in indexName(). Duplicate names produce identical code.
        .toSorted((a, b) => (a.name < b.name ? -1 : 1))
        .map(field => {
            let valueCode = `values["${field.name}"]`;

            if (field.caseInsensitive) {
                valueCode = `string.lower(${valueCode})`;
            }

            // Lua gsub returns two values. Extra parenthesis are used to discard the second value.
            return `(string.gsub(${valueCode}, ':', '::'))`;
        })
        .join(`..':'..`);
}

function isRedisClient(connection: Connection): connection is Redis {
    return typeof connection === 'object' && typeof (connection as Partial<Redis>).evalsha === 'function';
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function onlyLetters(str: string): boolean {
    return /^[a-zA-Z]+$/.test(str);
}

function onlyLettersNumbersDashes(str: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(str);
}

// Removes the leading empty lines, trailing whitespace, and the indentation common to all lines
function dedent(code: string): string[] {
    const lines = code.replace(/^\n+/, '').trimEnd().split('\n');
    const indent = Math.min(...lines.filter(line => line.trim() !== '').map(line => line.length - line.trimStart().length));

    return lines.map(line => line.slice(indent).trimEnd());
}

function utilityFuncs(): string {
    return dedent(`
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

        local hset = function (key, dict)
            if next(dict) == nil then return nil end
            local bulk = {}
            for k, v in pairs(dict) do
                table.insert(bulk, k)
                table.insert(bulk, v)
            end
            return redis.call('HSET', key, unpack(bulk))
        end
    `).join('\n');
}
