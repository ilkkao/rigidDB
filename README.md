# RigidDB

Typed, indexed records in Redis.

[![CI](https://github.com/ilkkao/rigidDB/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/ilkkao/rigidDB/actions/workflows/ci.yml) [![codecov](https://codecov.io/gh/ilkkao/rigidDB/branch/master/graph/badge.svg)](https://codecov.io/gh/ilkkao/rigidDB) [![npm](https://img.shields.io/npm/v/rigiddb.svg)](https://www.npmjs.com/package/rigiddb) [![Docs](https://img.shields.io/badge/docs-ilkkao.github.io%2FrigidDB-blue)](https://ilkkao.github.io/rigidDB/)

> **📖 Documentation: [ilkkao.github.io/rigidDB](https://ilkkao.github.io/rigidDB/)**

A promise-based Node.js library that stores plain JavaScript objects in Redis and makes them searchable through secondary indexes. Each operation runs as a single Lua script, so a record and its indexes are always updated together. Every write is validated against a predefined schema.

Requires Node.js 22 or later and Redis 6.2 or later. The package is an ES module and includes TypeScript type definitions.

## Installation

`npm install --save rigiddb`

## Example

```javascript
import RigidDB from 'rigiddb';

const store = new RigidDB('mydb', 42);

await store.setSchema({
    cars: {
        fields: {
            model: { type: 'string', allowNull: false },
            color: 'string',
            mileage: 'int'
        },
        indexes: {
            byModel: { unique: true, fields: [ { name: 'model', caseInsensitive: true } ] },
            byColor: { unique: false, fields: [ 'color' ] }
        }
    }
});

const id = await store.create('cars', { model: 'sedan', color: 'blue', mileage: 12345 });

await store.find('cars', { color: 'blue' }); // [ 1 ]
await store.get('cars', id); // { model: 'sedan', color: 'blue', mileage: 12345 }
```

See the **[documentation](https://ilkkao.github.io/rigidDB/)** for range indexes, paging, transactions, schema migrations, and the full API.

## Developing the documentation

The documentation site is built with [VitePress](https://vitepress.dev) from the [`docs`](docs) directory and deployed to GitHub Pages on every push to `master`.

```sh
npm run docs:dev
```

## License

MIT
