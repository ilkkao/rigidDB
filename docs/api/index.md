# API reference

All methods are on a `RigidDB` instance and return a promise. Failures reject with a [`RigidDBError`](../guide/errors).

The examples use this schema:

```javascript
import RigidDB from 'rigiddb';

const store = new RigidDB('mydb', 1);

await store.setSchema({
    cars: {
        fields: {
            color: { type: 'string', allowNull: true },
            model: { type: 'string', allowNull: false },
            mileage: 'int',
            convertible: 'boolean',
            purchaseDate: 'date'
        },
        indexes: {
            byModelAndColor: {
                unique: true,
                fields: [ { name: 'model', caseInsensitive: true }, 'color' ]
            },
            byColor: { unique: false, fields: [ 'color' ] },
            byMileage: { unique: false, range: true, fields: [ 'mileage' ] }
        }
    }
});
```

## Methods

| Method | Description |
|--------|-------------|
| [`new RigidDB()`](./connection#new-rigiddb) | Opens a connection to a database. |
| [`setSchema()`](./schema#setschema) | Defines the schema of a new database. |
| [`alterSchema()`](./schema#alterschema) | Changes the schema and migrates the existing records. |
| [`getSchema()`](./schema#getschema) | Returns the current schema. |
| [`create()`](./records#create) | Inserts a record. |
| [`update()`](./records#update) | Updates fields of a record. |
| [`delete()`](./records#delete) | Deletes a record. |
| [`get()`](./records#get) | Fetches a record by id. |
| [`getMany()`](./records#getmany) | Fetches several records by id. |
| [`exists()`](./records#exists) | Checks whether a record exists. |
| [`find()`](./queries#find) | Finds record ids through an index. |
| [`findRecords()`](./queries#findrecords) | Finds records through an index. |
| [`list()`](./queries#list) | Lists the ids of a collection. |
| [`count()`](./queries#count) | Counts the records of a collection. |
| [`currentId()`](./queries#currentid) | Returns the most recently created id. |
| [`transaction()`](./transactions#transaction) | Runs several operations atomically. |
| [`debugPrint()`](./utilities#debugprint) | Prints a collection as a table. |
| [`quit()`](./utilities#quit) | Closes the connection. |
| [`defineSchema()`](./utilities#defineschema) | Keeps the literal types of a schema for TypeScript. |
