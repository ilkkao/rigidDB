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
            mileage: 'int', // A shortcut for { type: 'int', allowNull: false }
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

## API

### new RigidDB(options, redisOptions)

### setSchema(schemaDefinition)

### getSchema()

### create(collection, attributes)

### update(collection, id, attributes)

### delete(collection, id)

### get(collection, id)

### exists(collection, id)

### list(collection)

### size(collection)

### multi(transaction)

### find(collection, searchAttributes)

### debugPrint(collection)

### quit()

## Supported data types

- Boolean
- Integer
- String
- Date
- Unix timestamp
