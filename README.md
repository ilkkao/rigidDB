# RigidDB

Typed, indexed records in Redis.

[![CI](https://github.com/ilkkao/rigidDB/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/ilkkao/rigidDB/actions/workflows/ci.yml) [![codecov](https://codecov.io/gh/ilkkao/rigidDB/branch/master/graph/badge.svg)](https://codecov.io/gh/ilkkao/rigidDB) [![npm](https://img.shields.io/npm/v/rigiddb.svg)](https://www.npmjs.com/package/rigiddb)

A promise-based Node.js library that stores plain JavaScript objects in Redis and makes them searchable through secondary indexes. Each operation runs as a single Lua script, so a record and its indexes are always updated together. Every write is validated against a predefined schema.

Requires Node.js 22 or later and Redis 6.2 or later. The package is an ES module and includes TypeScript type definitions.

## Installation

`npm install --save rigiddb`

## Example

```javascript
import RigidDB, { RigidDBError } from 'rigiddb';

const store = new RigidDB('mydb', 42);

await store.setSchema({
    cars: {
        fields: {
            color: { type: 'string', allowNull: true },
            model: { type: 'string', allowNull: false },
            mileage: 'int', // Shorthand for { type: 'int', allowNull: true }
            convertible: 'boolean',
            purchaseDate: 'date'
        },
        indexes: {
            first: {
                unique: true,
                fields: [
                    { name: 'model', caseInsensitive: true },
                    { name: 'color', caseInsensitive: false }
                ]
            },
            second: {
                unique: false,
                fields: [ 'color' ] // Shorthand for { name: 'color', caseInsensitive: false }
            }
        }
    }
});

const id = await store.create('cars', {
    color: 'blue',
    model: 'sedan',
    mileage: 12345,
    convertible: true,
    purchaseDate: new Date('2015-11-01T17:41:24Z')
});
// id = 1

const results = await store.find('cars', { color: 'blue' });
// results = [ 1 ]

try {
    await store.create('cars', {
        color: 'blue',
        model: 'SEDAN',
        mileage: 1,
        convertible: false,
        purchaseDate: null
    });
} catch (err) {
    if (err instanceof RigidDBError && err.code === 'notUnique') {
        // err.indexes = [ 'first' ], the model and color are already taken
    } else {
        throw err;
    }
}
```

CommonJS code can load the module with `require('rigiddb').default`.

## TypeScript

Pass the type of the schema to `RigidDB` to check collection names, field values, and `find()` queries at compile time. `defineSchema()` keeps the literal types of the schema, so no `as const` is needed.

```typescript
import RigidDB, { defineSchema } from 'rigiddb';

const schema = defineSchema({
    cars: {
        fields: {
            model: { type: 'string', allowNull: false },
            mileage: 'int'
        },
        indexes: {
            byModel: { unique: true, fields: [ 'model' ] }
        }
    }
});

const store = new RigidDB<typeof schema>('mydb', 42);

await store.setSchema(schema);

const id = await store.create('cars', { model: 'sedan', mileage: 12345 });
const car = await store.get('cars', id); // { model: string; mileage: number | null }

await store.find('cars', { model: 'sedan' });
await store.find('cars', { mileage: 1 }); // Type error: no index has only the field mileage
```

`RecordOf<typeof schema, 'cars'>` is the type of a `cars` record. Without a type argument, the values are checked only at runtime.

## Connection API

### new RigidDB(databaseName, revision, connection, redisErrorHandler)

Opens a connection to a database.

| Argument          | Description                                                   |
|-------------------|---------------------------------------------------------------|
| databaseName      | Name of a new or existing database, letters only. Used as the prefix of all Redis keys. |
| revision          | Schema revision number, an integer. |
| connection        | Optional. An existing `ioredis` client, a `redis://` or `rediss://` URL, or [`ioredis` options](https://github.com/redis/ioredis). All options are supported except `keyPrefix`; use `databaseName` instead. Defaults to `localhost:6379`. |
| redisErrorHandler | Optional. A function that is called with Redis connection errors. |

Throws an `Error` if `databaseName` or `revision` is invalid, or if the connection uses the `keyPrefix` option.

```javascript
const store = new RigidDB('mydb', 42, 'rediss://:password@redis.example.com:6380/0');
```

## Database API

#### Errors

Every method returns a promise. When an operation fails, the promise is rejected with a `RigidDBError` that has these properties:

| Property  | Description                                                   |
|-----------|---------------------------------------------------------------|
| `code`    | Error code, see the table below. |
| `method`  | Name of the method that failed. In a transaction, the operation that failed. |
| `indexes` | Names of the violated unique indexes. Set for `notUnique`. |
| `reason`  | Why the schema is invalid. Set for `invalidSchema`. |

Errors from Redis itself, such as a lost connection, are passed through as they are.

| Error code          | Description                                                   |
|---------------------|---------------------------------------------------------------|
| `invalidSchema`     | The schema given to `setSchema()` is invalid. |
| `schemaExists`      | `setSchema()` was called for a database that already has a schema. |
| `schemaMissing`     | No schema has been set for the database with `setSchema()`. |
| `invalidStoredSchema` | The schema stored in Redis is invalid. |
| `unknownCollection` | The collection isn't defined in the schema. |
| `unknownIndex`      | No index has exactly the fields given to `find()`. |
| `missingFields`     | `create()` didn't get a value for every field in the schema. |
| `nullNotAllowed`    | A field value is `null`, but the field is defined with `allowNull: false`. |
| `wrongType`         | A field value doesn't match the field type in the schema. |
| `notFound`          | No record with the given id exists. |
| `notUnique`         | The write would violate a unique index. |
| `invalidQuery`      | The options or range bounds given to `find()`, `findRecords()`, or `list()` are invalid. |
| `schemaChanged`     | Another instance changed the schema twice while the operation was running. Try again. |

### setSchema(schemaDefinition)

Defines the schema of a new database. The schema is validated before it's activated and persisted. All other methods require a schema. Use `alterSchema()` to change it later.

Collection, field, and index names can contain letters, numbers, dashes, and underscores.

| Argument         | Description                                                   |
|------------------|---------------------------------------------------------------|
| schemaDefinition | The collections with their field definitions and indexes. See the example above for the supported field types and index definitions. |

### alterSchema(schemaDefinition, options)

Changes the schema of a database and migrates the existing records. The migration and the new schema are written in one Lua script, so a failure, such as a duplicate value for a new unique index, leaves the database as it was. The script blocks Redis while it runs, which takes time with large collections.

Supported changes:

- Adding a collection. Removing a collection deletes its records.
- Adding a field. Existing records get the default value from `options`, or `null`. A field that doesn't allow `null` needs a default.
- Removing a field deletes its values.
- Changing a field to `allowNull: false`. Existing `null` values are replaced with the default, or the migration fails with `nullNotAllowed`.
- Adding, removing, and changing indexes. New and changed indexes are built from the existing records.

Changing the type of a field fails with `invalidSchema`.

Other `RigidDB` instances that use the same database load the new schema the next time they run an operation.

```javascript
await store.alterSchema({
    cars: {
        fields: { ...oldFields, fuel: { type: 'string', allowNull: false } },
        indexes: { ...oldIndexes, byFuel: { unique: false, fields: [ 'fuel' ] } }
    }
}, { defaults: { cars: { fuel: 'petrol' } } });
```

| Argument         | Description                                                   |
|------------------|---------------------------------------------------------------|
| schemaDefinition | The complete new schema. |
| options          | Optional. `defaults`: values per collection and field for the migrated records. |

### getSchema()

Returns the schema definition set with `setSchema()`, as `{ revision, schema }`.

### create(collection, values)

Inserts a new record into a collection.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |
| values       | Values for all fields defined in the schema. |

##### Return value

Id of the new record, an integer.

### update(collection, id, values)

Updates an existing record.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |
| id           | Id of the record to update. |
| values       | Values of the fields to update. |

##### Return value

Number of fields whose value changed.

### delete(collection, id)

Deletes a record from a collection.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |
| id           | Id of the record to delete. |

### get(collection, id)

Fetches a record by id.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |
| id           | Id of the record to fetch. |

### exists(collection, id)

Checks whether a record with the given id exists.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |
| id           | Id of the record to check. |

### getMany(collection, ids)

Fetches several records in one call. Resolves to the records in the order of `ids`, with `null` for an id that doesn't exist.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |
| ids          | Ids of the records to fetch. |

### list(collection, options)

Returns the ids of the records in a collection, sorted by id.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |
| options      | Optional. `limit`, `offset`, and `order`, see `find()`. |

### count(collection)

Returns the number of records in a collection.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |

### currentId(collection)

Returns the id of the most recently created record in a collection, or 0 if no records have been created.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |

### transaction(callback)

Runs several operations as one atomic transaction. The callback queues `create()`, `update()`, `delete()`, `get()`, and `exists()` operations on the transaction object it receives, and they run together in a single Lua script.

The transaction is all or nothing. If an operation fails, for example with `notFound` or `notUnique`, or Redis returns an error, the changes made by the operations before it are rolled back and the promise is rejected. In a transaction, an `exists()` that finds no record fails with `notFound`, so it can check that the records a new record refers to still exist.

`create()` returns a reference to the new record, which later operations of the same transaction can use as the id.

Resolves to an array with the result of each operation, in order.

```javascript
const [ id, changed, car ] = await store.transaction(tr => {
    const ref = tr.create('cars', {
        color: 'red',
        model: 'coupe',
        mileage: 0,
        convertible: true,
        purchaseDate: null
    });

    tr.update('cars', ref, { mileage: 10 });
    tr.get('cars', ref);
});
// id is the id of the new car, changed = 1, car.mileage = 10
```

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| callback     | A function that queues the operations on the transaction object it receives. |

### find(collection, query, options)

Finds the ids of the records that match the query, using the index that has exactly the fields of the query.

A field of a range index can be queried with bounds instead of a value: `{ gt, gte, lt, lte }`, any of them optional. Range indexes don't contain records whose value is `null`.

```javascript
await store.find('cars', { color: 'blue' });
await store.find('cars', { mileage: { gte: 1000, lt: 5000 } }, { order: 'desc', limit: 10 });
```

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |
| query        | The field values or range bounds to search for. |
| options      | Optional. `limit`: maximum number of results, all by default. `offset`: number of results to skip, 0 by default. `order`: `'asc'` (default) or `'desc'`. Results are sorted by the field value when a range index is used, otherwise by id. |

Fails with `invalidQuery` if the options or the bounds are invalid.

### findRecords(collection, query, options)

Like `find()`, but resolves to the matching records as `{ id, record }` objects. The ids and the records are read in one Lua script.

### debugPrint(collection)

Prints the records of a collection as a table.

Use only with small collections during development.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |

### quit()

Closes the database connection. A client passed to the constructor is left open.

## Range indexes

An index with `range: true` keeps the records sorted by one `int`, `date`, or `timestamp` field, so that `find()` can query it with bounds. A range index can't be unique.

```javascript
indexes: {
    byMileage: { unique: false, range: true, fields: [ 'mileage' ] }
}
```

## Supported data types

- Boolean (`'boolean'`)
- Number, integer or floating point (`'int'`)
- String (`'string'`)
- Date (`'date'`, stored as an ISO 8601 string)
- Unix timestamp (`'timestamp'`, stored as milliseconds since the epoch)

Values of both `date` and `timestamp` fields are passed in and returned as `Date` objects.
