# RigidDB

[![CI](https://github.com/ilkkao/rigidDB/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/ilkkao/rigidDB/actions/workflows/ci.yml) [![codecov](https://codecov.io/gh/ilkkao/rigidDB/branch/master/graph/badge.svg)](https://codecov.io/gh/ilkkao/rigidDB) [![npm](https://img.shields.io/npm/v/rigiddb.svg)](https://www.npmjs.com/package/rigiddb)

A promise based node module for saving searchable plain JavaScript objects to Redis. API methods are executed as atomic Lua scripts to avoid data/index corruption. Inserted data
is type checked against a predefined schema.

Node.js v22 or later required. The package is an ES module and ships with TypeScript type definitions.

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
            mileage: 'int', // A shortcut for { type: 'int', allowNull: true }
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
                fields: [ 'color' ] // A shortcut for { name: 'color', caseInsensitive: false }
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

Create a new database connection.

| Argument          | Description                                                   |
|-------------------|---------------------------------------------------------------|
| databaseName      | New or existing database name, letters only. All Redis keys will be prefixed with the name. |
| revision          | Revision number of the schema, integer. |
| redisOptions      | Optional. An object containing arguments forwarded to `ioredis` node module. Supported properties are: `host`, `port`, `password`, `db`, and `retryStrategy`. |
| redisErrorHandler | Optional. A function that is called with Redis connection errors. |

Throws an `Error` if `databaseName` or `revision` is invalid.

## Database API

#### Return values

All database API methods return an JavaScript object.

In success case the object contains `method` (method name) and `val` (actual return value) properties.

In case of an error, the object contains `method` (method name) and `err` (error code, string) properties.

As an example, `delete` method can return:

```
{
    method: 'delete',
    err: 'notFound',
    val: false
}
```

A failed `create` or `update` also has an `indices` property that lists the unique indices that would have been violated.

| Error code          | Description                                                   |
|---------------------|---------------------------------------------------------------|
| `schemaMissing`     | `setSchema()` hasn't been called for this database. |
| `badSavedSchema`    | The schema saved in Redis is corrupted. |
| `unknownCollection` | The collection is not in the schema. |
| `unknownIndex`      | `find()` attributes don't match the fields of any index. |
| `badParameter`      | `create()` didn't get a value for every attribute in the schema. |
| `nullNotAllowed`    | Attribute value is `null` but the schema has `allowNull: false`. |
| `wrongType`         | Attribute value doesn't match the type in the schema. |
| `notFound`          | An object with the given id doesn't exist. |
| `notUnique`         | The change would break a unique index. |

### setSchema(schemaDefinition)

Set a schema for the database. Schema can be set once. Future versions of this library will support schema changes and data migration. Validity of a schema is checked before it is activated and persisted. Any other API call is possible only after the schema is set.

Collection, field, and index names can contain letters, numbers, dashes, and underscores.

Unlike other methods, an invalid schema is reported with a `reason` property (a human readable message) instead of `err`.

| Argument         | Description                                                   |
|------------------|---------------------------------------------------------------|
| schemaDefinition | An object that specifies the collections, including the format of collection data. See the example above for supported data type and index definitions. |

### getSchema()

Get the previously set schema definition. Returns `{ revision, schema }`.

### create(collection, attributes)

Add a new object to collection.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |
| attributes   | An object that includes values for all attributes listed in the schema. |

##### Return value

Id of the newly created object, integer.

### update(collection, id, attributes)

Update an existing object in collection.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |
| id           | Id of the object to be updated.
| attributes   | An object that includes values for attributes to be updated. |

##### Return value

Number of attributes whose value changed.

### delete(collection, id)

Remove an object from collection.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |
| id           | Id of the object to be removed.

### get(collection, id)

Get an object from collection

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |
| id           | Id of the object to be fetched.

### exists(collection, id)

Check if an object with an id exists

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |
| id           | Id of the object to be searched.

### list(collection)

Get ids of all object in a collection.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |

### size(collection)

Get the amount of objects in a collection.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |

### currentId(collection)

Get the id of the most recently created object in a collection, or 0 if nothing has been created.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |

### multi(transaction)

Execute several API methods in an atomic transaction. Note that the return value of a method call inside the transaction function can't be used as an argument in the following method calls.

Transaction is terminated if any of the methods return an error value or if `exists()` returns false. In a typical case transaction contains one or more exists() calls to make sure that the some object still exists before creating an object that points to those objects.

Redis doesn't roll back a Lua script. When a method fails in Redis (for example `notFound` or `notUnique`), the changes made by the methods before it in the same transaction are kept. Put the checks first.

The return value is the return value of the last method in the transaction.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| transaction  | Transaction function. |

### find(collection, searchAttributes)

Find an object using one of the specified indices.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |
| searchAttributes | An object that includes values to be searched. |

### debugPrint(collection)

Print the contents of a collection.

Only usable with small collections during development.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |

### quit()

Terminate the database connection.

## Supported data types

- Boolean ('boolean')
- Integer and float ('int')
- String ('string')
- Date ('date', stored as an ISO 8601 string)
- Unix timestamp ('timestamp', stored as milliseconds since epoch)

Both `date` and `timestamp` values are given and returned as `Date` objects.
