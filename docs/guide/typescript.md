# TypeScript

Pass the type of the schema to `RigidDB` to check collection names, field values, and `find()` queries at compile time. [`defineSchema()`](../api/utilities#defineschema) keeps the literal types of the schema, so no `as const` is needed.

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

Without a type argument, the values are checked only at runtime.

## Record types

`RecordOf<typeof schema, 'cars'>` is the type of a `cars` record:

```typescript
import type { RecordOf } from 'rigiddb';

type Car = RecordOf<typeof schema, 'cars'>;

function describe(car: Car): string {
    return `${car.model}, ${car.mileage ?? 'unknown'} km`;
}
```

## Exported types

| Type | Description |
|------|-------------|
| `Schema` | Any schema definition. |
| `RecordOf<S, C>` | The record type of collection `C` in schema `S`. |
| `IndexQuery<S, C>` | The queries `find()` accepts for collection `C`. |
| `CollectionName<S>` | The collection names of schema `S`. |
| `FindOptions` | `{ limit, offset, order }` for `find()`, `findRecords()`, and `list()`. |
| `Range<V>` | `{ gt, gte, lt, lte }` bounds of a range query. |
| `FoundRecord<R>` | `{ id, record }`, a result of `findRecords()`. |
| `AlterSchemaOptions<S>` | The options of `alterSchema()`. |
| `Transaction<S>` | The transaction object passed to the `transaction()` callback. |
| `RecordRef` | A reference to a record created in a transaction. |
| `Connection` | An `ioredis` client, a URL, or `ioredis` options. |
| `ErrorCode`, `Method` | The `code` and `method` of a `RigidDBError`. |
