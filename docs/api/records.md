# Records

The examples use the `cars` schema from the [overview](./).

## create()

```typescript
store.create(collection, values): Promise<number>
```

Inserts a new record into a collection.

| Argument     | Description |
|--------------|-------------|
| `collection` | Name of the collection. |
| `values`     | Values for all fields defined in the schema. Properties not in the schema are ignored. |

Resolves to the id of the new record, an integer. Fails with `missingFields`, `nullNotAllowed`, `wrongType`, or `notUnique` if the values aren't valid.

### Example

```javascript
const id = await store.create('cars', {
    color: 'blue',
    model: 'sedan',
    mileage: 12345,
    convertible: false,
    purchaseDate: new Date('2015-11-01T17:41:24Z')
});
// id = 1
```

## update()

```typescript
store.update(collection, id, values): Promise<number>
```

Updates an existing record. Fields not in `values` keep their value.

| Argument     | Description |
|--------------|-------------|
| `collection` | Name of the collection. |
| `id`         | Id of the record to update. |
| `values`     | Values of the fields to update. |

Resolves to the number of fields whose value changed. Fails with `notFound` if the record doesn't exist.

### Example

```javascript
const changed = await store.update('cars', id, { color: 'red', mileage: 12345 });
// changed = 1, only the color changed
```

## delete()

```typescript
store.delete(collection, id): Promise<void>
```

Deletes a record from a collection, together with its index entries.

| Argument     | Description |
|--------------|-------------|
| `collection` | Name of the collection. |
| `id`         | Id of the record to delete. |

Fails with `notFound` if the record doesn't exist.

### Example

```javascript
await store.delete('cars', id);

await store.exists('cars', id); // false
```

## get()

```typescript
store.get(collection, id): Promise<Record>
```

Fetches a record by id.

| Argument     | Description |
|--------------|-------------|
| `collection` | Name of the collection. |
| `id`         | Id of the record to fetch. |

Resolves to the record, with `date` and `timestamp` values as `Date` objects. Fails with `notFound` if the record doesn't exist.

### Example

```javascript
const car = await store.get('cars', 1);
// {
//     color: 'blue',
//     model: 'sedan',
//     mileage: 12345,
//     convertible: false,
//     purchaseDate: 2015-11-01T17:41:24.000Z
// }
```

## getMany()

```typescript
store.getMany(collection, ids): Promise<(Record | null)[]>
```

Fetches several records in one call.

| Argument     | Description |
|--------------|-------------|
| `collection` | Name of the collection. |
| `ids`        | Ids of the records to fetch. |

Resolves to the records in the order of `ids`, with `null` for an id that doesn't exist.

### Example

```javascript
const [ first, missing, second ] = await store.getMany('cars', [ 1, 999, 2 ]);
// missing = null
```

## exists()

```typescript
store.exists(collection, id): Promise<boolean>
```

Checks whether a record with the given id exists.

| Argument     | Description |
|--------------|-------------|
| `collection` | Name of the collection. |
| `id`         | Id of the record to check. |

### Example

```javascript
if (!await store.exists('cars', id)) {
    throw new Error(`No car ${id}`);
}
```

In a [transaction](./transactions), an `exists()` that finds no record fails with `notFound` instead.
