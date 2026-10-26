# Getting started

RigidDB is a promise-based Node.js library that stores plain JavaScript objects in Redis and makes them searchable through secondary indexes. Each operation runs as a single Lua script, so a record and its indexes are always updated together. Every write is validated against a predefined schema.

## Requirements

- Node.js 22 or later
- Redis 6.2 or later

The package is an ES module and includes TypeScript type definitions.

## Installation

```sh
npm install --save rigiddb
```

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

await store.quit();
```

## CommonJS

CommonJS code can load the module with `require()`:

```javascript
const RigidDB = require('rigiddb').default;
```

## Next steps

- [Schemas and data types](./schema) explains fields, indexes, and range indexes.
- [TypeScript](./typescript) shows how to type records and queries from the schema.
- The [API reference](../api/) has an example for every method.
