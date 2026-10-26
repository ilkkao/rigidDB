# Schema

See [Schemas and data types](../guide/schema) for the format of a schema definition.

## setSchema()

```typescript
store.setSchema(schemaDefinition): Promise<void>
```

Defines the schema of a new database. The schema is validated before it's activated and persisted. All other methods require a schema. Use [`alterSchema()`](#alterschema) to change it later.

| Argument           | Description |
|--------------------|-------------|
| `schemaDefinition` | The collections with their field definitions and indexes. |

Fails with `invalidSchema` if the schema is invalid, and with `schemaExists` if the database already has a schema.

### Example

```javascript
await store.setSchema({
    users: {
        fields: {
            email: { type: 'string', allowNull: false },
            name: 'string',
            createdAt: 'timestamp'
        },
        indexes: {
            byEmail: { unique: true, fields: [ { name: 'email', caseInsensitive: true } ] }
        }
    }
});
```

Setting a schema only on the first start:

```javascript
import { RigidDBError } from 'rigiddb';

try {
    await store.setSchema(schema);
} catch (err) {
    if (!(err instanceof RigidDBError && err.code === 'schemaExists')) {
        throw err;
    }
}
```

## alterSchema()

```typescript
store.alterSchema(schemaDefinition, options?): Promise<void>
```

Changes the schema of a database and migrates the existing records. The migration and the new schema are written in one Lua script, so a failure, such as a duplicate value for a new unique index, leaves the database as it was. The script blocks Redis while it runs, which takes time with large collections.

| Argument           | Description |
|--------------------|-------------|
| `schemaDefinition` | The complete new schema. |
| `options`          | Optional. `defaults`: values per collection and field for the migrated records. |

Supported changes:

- Adding a collection. Removing a collection deletes its records.
- Adding a field. Existing records get the default value from `options`, or `null`. A field that doesn't allow `null` needs a default.
- Removing a field deletes its values.
- Changing a field to `allowNull: false`. Existing `null` values are replaced with the default, or the migration fails with `nullNotAllowed`.
- Adding, removing, and changing indexes. New and changed indexes are built from the existing records.

Changing the type of a field fails with `invalidSchema`.

Other `RigidDB` instances that use the same database load the new schema the next time they run an operation.

### Example

Add a required `fuel` field with an index, filling in `'petrol'` for the existing cars:

```javascript
const { schema } = await store.getSchema();

await store.alterSchema({
    cars: {
        fields: { ...schema.cars.fields, fuel: { type: 'string', allowNull: false } },
        indexes: { ...schema.cars.indexes, byFuel: { unique: false, fields: [ 'fuel' ] } }
    }
}, { defaults: { cars: { fuel: 'petrol' } } });
```

## getSchema()

```typescript
store.getSchema(): Promise<{ revision: number; schema: Schema }>
```

Returns the schema definition set with `setSchema()` or `alterSchema()`, and the revision given to the constructor.

Fails with `schemaMissing` if no schema has been set.

### Example

```javascript
const { revision, schema } = await store.getSchema();

console.log(revision); // 1
console.log(Object.keys(schema.cars.fields)); // [ 'color', 'model', 'mileage', 'convertible', 'purchaseDate' ]
```
