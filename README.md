# RigidDB

[![Build Status](https://secure.travis-ci.org/ilkkao/rigidDB.png)](http://travis-ci.org/ilkkao/rigidDB) [![Coverage Status](https://coveralls.io/repos/ilkkao/rigidDB/badge.svg?branch=master&service=github)](https://coveralls.io/github/ilkkao/rigidDB?branch=master) [![Dependency Status](https://david-dm.org/ilkkao/rigiddb.svg)](https://david-dm.org/ilkkao/rigiddb) [![devDependency Status](https://david-dm.org/ilkkao/rigiddb/dev-status.svg)](https://david-dm.org/ilkkao/rigiddb#info=devDependencies)

A promise based node module for saving searchable plain JavaScript objects to Redis. API methods are executed as atomic Lua scripts to avoid data/index corruption. Inserted data
is type checked against a predefined schema.

Node.js v4.0.0 or later required.

## Installation

`npm install --save rigiddb`

## Example

```javascript
const RigidDB = require('rigiddb');

let store = new RigidDB('mydb');

store.setSchema({
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
}).then(function(schemaId) {
    return store.create('cars', {
        color: 'blue',
        mileage: 12345,
        convertible: true,
        purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0000 (UTC)')
    })
}).then(function(id) {
    // id = 1

    return store.find('cars', {
        color: 'blue',
        mileage: 12345
    });
}).then(function(results) {
    // results = [ 1 ]
});
```

## Connection API

### new RigidDB(databaseName, redisOptions)

Create a new database connection.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| dataBaseName | New or existing database name. All Redis keys will be prefixed with the name. |
| redisOptions | An object containing arguments forwarded to `ioredis` node module. Supported properties are: `host`, `port`, `password`, and `db`. |

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
}
```

TODO: list all error codes.

### setSchema(revision, schemaDefinition)

Set a schema for the database. Schema can be set once. Future versions of this library will allow schema changes and data migration. Validity of a schema is checked before it is activated and persisted. Any other API call is possible only after the schema is set.

| Argument         | Description                                                   |
|------------------|---------------------------------------------------------------|
| revision         | Revision number of the schema, integer. |
| schemaDefinition | An object that specifies the collections, including the format of collection data. See the example above for supported data type and index definitions. |

### getSchema()

Get the previously set schema definition.

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

Get an object from collection

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

### multi(transaction)

Execute several API methods in an atomic transaction. Note that the return value of a method call inside the transaction function can't be used as an argument in the following method calls.

Transaction is terminated if any of the methods return an error value. In a typical case transaction contains one or more exists() calls to make sure that the some object still exists before creating an object that points to those objects.

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

Only usable with smalle collections during development.

| Argument     | Description                                                   |
|--------------|---------------------------------------------------------------|
| collection   | Name of the collection. |

### quit()

Terminate the database connection.

## Supported data types

- Boolean ('boolean')
- Integer and float ('int')
- String ('string')
- Date ('date')
- Unix timestamp ('timestamp')
