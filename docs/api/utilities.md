# Utilities

## debugPrint()

```typescript
store.debugPrint(collection): Promise<void>
```

Prints the records of a collection as a table with `console.table()`.

Use only with small collections during development.

| Argument     | Description |
|--------------|-------------|
| `collection` | Name of the collection. |

### Example

```javascript
await store.debugPrint('cars');
// ┌─────────┬─────────┬───────────┬──────────┬────────────────────────────┬─────────────┬─────┐
// │ (index) │ mileage │ model     │ color    │ purchaseDate               │ convertible │ id  │
// ├─────────┼─────────┼───────────┼──────────┼────────────────────────────┼─────────────┼─────┤
// │ 0       │ '12345' │ '"sedan"' │ '"blue"' │ '2015-11-01T17:41:24.000Z' │ 'false'     │ '1' │
// └─────────┴─────────┴───────────┴──────────┴────────────────────────────┴─────────────┴─────┘
```

## quit()

```typescript
store.quit(): Promise<void>
```

Closes the database connection. A client passed to the constructor is left open.

### Example

```javascript
process.on('SIGTERM', async () => {
    await store.quit();
    process.exit(0);
});
```

## defineSchema()

```typescript
defineSchema(schema): Schema
```

Returns the schema as it is. Lets TypeScript keep the literal types of the schema without `as const`, for use as the type argument of `RigidDB`. See [TypeScript](../guide/typescript).

### Example

```typescript
import RigidDB, { defineSchema, type RecordOf } from 'rigiddb';

const schema = defineSchema({
    cars: {
        fields: { model: { type: 'string', allowNull: false }, mileage: 'int' },
        indexes: { byModel: { unique: true, fields: [ 'model' ] } }
    }
});

type Car = RecordOf<typeof schema, 'cars'>; // { model: string; mileage: number | null }

const store = new RigidDB<typeof schema>('mydb', 1);
```
