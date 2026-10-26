# Transactions

## transaction()

```typescript
store.transaction(callback): Promise<unknown[]>
```

Runs several operations as one atomic transaction. The callback queues `create()`, `update()`, `delete()`, `get()`, and `exists()` operations on the transaction object it receives, and they run together in a single Lua script.

| Argument   | Description |
|------------|-------------|
| `callback` | A function that queues the operations on the transaction object it receives. Called again if another process changes the schema before the transaction runs. |

Resolves to an array with the result of each operation, in order.

The transaction is all or nothing. If an operation fails, for example with `notFound` or `notUnique`, or Redis returns an error, the changes made by the operations before it are rolled back and the promise is rejected. The `method` of the error is the operation that failed.

In a transaction, an `exists()` that finds no record fails with `notFound`, so it can check that the records a new record refers to still exist.

`create()` returns a reference to the new record, which later operations of the same transaction can use as the id.

### Transaction operations

| Operation | Result in the resolved array |
|-----------|------------------------------|
| `tr.create(collection, values)` | Id of the new record. Returns a `RecordRef` in the callback. |
| `tr.update(collection, id, values)` | Number of fields whose value changed. |
| `tr.delete(collection, id)` | `undefined` |
| `tr.get(collection, id)` | The record. |
| `tr.exists(collection, id)` | `true`. Fails the transaction if the record doesn't exist. |

### Examples

Create a record, update it, and read it back:

```javascript
const [ id, changed, car ] = await store.transaction(tr => {
    const ref = tr.create('cars', {
        color: 'red',
        model: 'coupe',
        mileage: 0,
        convertible: true,
        purchaseDate: null
    });

    tr.update('cars', ref, { mileage: 10 });
    tr.get('cars', ref);
});
// id is the id of the new car, changed = 1, car.mileage = 10
```

Create a record only if the record it refers to still exists:

```javascript
await store.transaction(tr => {
    tr.exists('owners', ownerId);
    tr.create('cars', { ownerId, model: 'sedan', /* ... */ });
});
```

Move a unique value from one record to another. If the second update fails, the first one is rolled back:

```javascript
import { RigidDBError } from 'rigiddb';

try {
    await store.transaction(tr => {
        tr.update('users', oldUserId, { email: null });
        tr.update('users', newUserId, { email: 'jane@example.com' });
    });
} catch (err) {
    if (err instanceof RigidDBError && err.code === 'notUnique') {
        // Neither user was changed
    } else {
        throw err;
    }
}
```
