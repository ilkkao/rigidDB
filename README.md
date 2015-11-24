# RigidDB

A promise based node module for saving searchable plain JavaScript objects to Redis. API methods are executed as atomic Lua transactions to avoid data corruption. Inserted data
is type checked against a predefined schema.

## Installation

`npm install --save rigiddb`

## Status:

[![Build Status](https://secure.travis-ci.org/ilkkao/rigidDB.png)](http://travis-ci.org/ilkkao/rigidDB)

[![Coverage Status](https://coveralls.io/repos/ilkkao/rigidDB/badge.svg?branch=master&service=github)](https://coveralls.io/github/ilkkao/rigidDB?branch=master)

## Example

```javascript
const RigidDB = require('rigiddb');

let store = new RigidDB('mydb');

store.setSchema({
    cars: {
        definition: {
            color: 'string',
            mileage: 'int',
            convertible: 'boolean',
            purchaseDate: 'date'
        },
        indices: {
            first: {
                uniq: true,
                fields: [ 'purchaseDate', 'mileage' ]
            },
            second: {
                uniq: false,
                fields: [ 'color', 'mileage' ]
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
    return store.find('cars', id);
}).then(function(object) {
    // object = {
    //     color: 'blue',
    //     mileage: 12345,
    //     convertible: true,
    //     purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0000 (UTC)')
    // }
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

### quit()

## Supported data types

- Boolean
- Integer
- String
- Date
- Unix timestamp
