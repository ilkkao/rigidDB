# Queries

The examples use the `cars` schema from the [overview](./).

## Query options

`find()`, `findRecords()`, and `list()` accept these options:

| Option   | Description |
|----------|-------------|
| `limit`  | Maximum number of results, all by default. |
| `offset` | Number of results to skip, 0 by default. |
| `order`  | `'asc'` (default) or `'desc'`. Results are sorted by the field value when a range index is used, otherwise by id. |

Invalid options fail with `invalidQuery`.

## find()

```typescript
store.find(collection, query, options?): Promise<number[]>
```

Finds the ids of the records that match the query, using the index that has exactly the fields of the query.

A field of a [range index](../guide/schema#range-indexes) can be queried with bounds instead of a value: `{ gt, gte, lt, lte }`, any of them optional. Range indexes don't contain records whose value is `null`.

| Argument     | Description |
|--------------|-------------|
| `collection` | Name of the collection. |
| `query`      | The field values or range bounds to search for. |
| `options`    | Optional. See [query options](#query-options). |

Fails with `unknownIndex` if no index has exactly the fields of the query, and with `invalidQuery` if the options or the bounds are invalid.

### Examples

Find by an exact value:

```javascript
await store.find('cars', { color: 'blue' });
// [ 1, 3 ]
```

Find by several fields. `model` is case-insensitive in the index:

```javascript
await store.find('cars', { model: 'SEDAN', color: 'blue' });
// [ 1 ]
```

Find `null` values:

```javascript
await store.find('cars', { color: null });
```

Find with range bounds, highest mileage first, ten at a time:

```javascript
const page = await store.find('cars', { mileage: { gte: 1000, lt: 5000 } }, {
    order: 'desc',
    limit: 10,
    offset: 20
});
```

## findRecords()

```typescript
store.findRecords(collection, query, options?): Promise<{ id: number; record: Record }[]>
```

Like [`find()`](#find), but resolves to the matching records as `{ id, record }` objects. The ids and the records are read in one Lua script.

### Example

```javascript
const results = await store.findRecords('cars', { mileage: { gt: 100000 } }, { limit: 2 });
// [
//     { id: 4, record: { color: 'green', model: 'van', mileage: 120000, ... } },
//     { id: 7, record: { color: null, model: 'pickup', mileage: 150000, ... } }
// ]
```

## list()

```typescript
store.list(collection, options?): Promise<number[]>
```

Returns the ids of the records in a collection, sorted by id.

| Argument     | Description |
|--------------|-------------|
| `collection` | Name of the collection. |
| `options`    | Optional. See [query options](#query-options). |

### Example

Page through all cars, newest first:

```javascript
const pageSize = 50;

for (let offset = 0; ; offset += pageSize) {
    const ids = await store.list('cars', { order: 'desc', limit: pageSize, offset });

    if (ids.length === 0) {
        break;
    }

    const cars = await store.getMany('cars', ids);
    // ...
}
```

## count()

```typescript
store.count(collection): Promise<number>
```

Returns the number of records in a collection.

| Argument     | Description |
|--------------|-------------|
| `collection` | Name of the collection. |

### Example

```javascript
const total = await store.count('cars');
// total = 3
```

## currentId()

```typescript
store.currentId(collection): Promise<number>
```

Returns the id of the most recently created record in a collection, or 0 if no records have been created. Deleting records doesn't change it.

| Argument     | Description |
|--------------|-------------|
| `collection` | Name of the collection. |

### Example

```javascript
await store.currentId('cars'); // 0

await store.create('cars', { color: 'red', model: 'coupe', mileage: 0, convertible: true, purchaseDate: null });

await store.currentId('cars'); // 1
```
