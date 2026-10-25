# RigidDB

[![CI](https://github.com/ilkkao/rigidDB/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/ilkkao/rigidDB/actions/workflows/ci.yml) [![codecov](https://codecov.io/gh/ilkkao/rigidDB/branch/master/graph/badge.svg)](https://codecov.io/gh/ilkkao/rigidDB) [![npm](https://img.shields.io/npm/v/rigiddb.svg)](https://www.npmjs.com/package/rigiddb)

A promise-based Node.js library that stores plain JavaScript objects in Redis and makes them searchable through secondary indexes. Each operation runs as a single Lua script, so a record and its indexes are always updated together. Every write is validated against a predefined schema.

Requires Node.js 22 or later. The package is an ES module and includes TypeScript type definitions.

## Installation

`npm install --save rigiddb`

## Example

```javascript
import RigidDB from 'rigiddb';

const store = new RigidDB('mydb', 42);

await store.setSchema({
    cars: {
        definition: {
            color: { type: 'string', allowNull: true },
            model: { type: 'string', allowNull: false },
            mileage: 'int', // Shorthand for { type: 'int', allowNull: true }
            convertible: 'boolean',
            purchaseDate: 'date'
        },
        indices: {
            first: {
                uniq: true,
                fields: [
                    { name: 'model', caseInsensitive: true },
                    { name: 'color', caseInsensitive: false }
                ]
            },
            second: {
                uniq: false,
                fields: [ 'color' ] // Shorthand for { name: 'color', caseInsensitive: false }
            }
        }
    }
});

const { val: id } = await store.create('cars', {
    color: 'blue',
    model: 'sedan',
    mileage: 12345,
    convertible: true,
    purchaseDate: new Date('2015-11-01T17:41:24Z')
});
// id = 1

const { val: results } = await store.find('cars', { color: 'blue' });
// results = [ 1 ]
```

CommonJS code can load the module with `require('rigiddb').default`.

## Connection API

### new RigidDB(databaseName, revision, redisOptions, redisErrorHandler)

Opens a connection to a database.

| Argument          | Description                                                   |
|-------------------|---------------------------------------------------------------|
| databaseName      | Name of a new or existing database, letters only. Used as the prefix of all Redis keys. |
| revision          | Schema revision number, an integer. |
| redisOptions      | Optional. Connection options passed to `ioredis`. Supported options: `host`, `port`, `password`, `db`, and `retryStrategy`. |
| redisErrorHandler | Optional. A function that is called with Redis connection errors. |

Throws an `Error` if `databaseName` or `revision` is invalid.

## Database API

#### Return values

Every method returns a promise that resolves to a result object.

On success, the result object has a `val` property that holds the return value.

On failure, the result object has `val: false`, `method` (the method name), and `err` (an error code string).

For example, `delete` can resolve to:

```
{
    method: 'delete',
    err: 'notFound',
    val: false
}
```

When `create` or `update` fails in Redis, the result object also has an `indices` property with the names of the violated unique indexes.

| Error code          | Description                                                   |
|---------------------|---------------------------------------------------------------|
| `schemaMissing`     | No schema has been set for the database with `setSchema()`. |
| `badSavedSchema`    | The schema stored in Redis is invalid. |
| `unknownCollection` | The collection isn't defined in the schema. |
| `unknownIndex`      | No index has exactly the fields given to `find()`. |
| `badParameter`      | `create()` didn't get a value for every field in the schema. |
| `nullNotAllowed`    | A field value is `null`, but the field is defined with `allowNull: false`. |
| `wrongType`         | A field value doesn't match the field type in the schema. |
| `notFound`          | No record with the given id exists. |
| `notUnique`         | The write would violate a unique index. |

### setSchema(schemaDefinition)

Defines the schema of the database. The schema can be set only once; future versions of this library will support schema changes and data migrations. The schema is validated before it's activated and persisted. All other methods require a schema.

Collection, field, and index names can contain letters, numbers, dashes, and underscores.

Unlike other methods, `setSchema()` reports an invalid schema with a `reason` property (a human-readable message) instead of `err`.

| Argument         | Description                                                   |
|------------------|---------------------------------------------------------------|
| schemaDefinition | The collections with their field definitions and indexes. See the example above for the supported field types and index definitions. |

### getSchema()

Returns the schema definition set with `setSchema()`, as `{ revision, schema }`.

### create(collection, attributes)

Inserts a new record into a collection.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |
| attributes   | Values for all fields defined in the schema. |

##### Return value

Id of the new record, an integer.

### update(collection, id, attributes)

Updates an existing record.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |
| id           | Id of the record to update. |
| attributes   | Values of the fields to update. |

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

### list(collection)

Returns the ids of all records in a collection.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |

### size(collection)

Returns the number of records in a collection.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |

### currentId(collection)

Returns the id of the most recently created record in a collection, or 0 if no records have been created.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |

### multi(transaction)

Runs several operations as one transaction. The transaction function queues the operations, and they run together in a single Lua script, so the return value of one operation can't be used as an argument of the next.

The transaction is aborted at the first operation that fails, or at an `exists()` call that returns false. A typical transaction starts with `exists()` calls that check that the records a new record refers to still exist.

Aborting doesn't roll back. Redis doesn't undo the writes of a Lua script, so when an operation fails in Redis (for example with `notFound` or `notUnique`), the changes made by the operations before it are kept. Put the checks first.

Resolves to the result of the last operation in the transaction.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| transaction  | A function that queues the operations on the transaction object it receives. |

### find(collection, searchAttributes)

Finds the ids of the records that match the given field values, using the index that has exactly those fields.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |
| searchAttributes | The field values to search for. |

### debugPrint(collection)

Prints the records of a collection as a table.

Use only with small collections during development.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |

### quit()

Closes the database connection.

## Supported data types

- Boolean (`'boolean'`)
- Number, integer or floating point (`'int'`)
- String (`'string'`)
- Date (`'date'`, stored as an ISO 8601 string)
- Unix timestamp (`'timestamp'`, stored as milliseconds since the epoch)

Values of both `date` and `timestamp` fields are passed in and returned as `Date` objects.
