# Schemas and data types

A schema defines the collections of a database, the fields of each collection, and its indexes. Set it once with [`setSchema()`](../api/schema#setschema) and change it later with [`alterSchema()`](../api/schema#alterschema).

Collection, field, and index names can contain letters, numbers, dashes, and underscores.

```javascript
await store.setSchema({
    cars: {
        fields: {
            color: { type: 'string', allowNull: true },
            model: { type: 'string', allowNull: false },
            mileage: 'int',
            purchaseDate: 'date'
        },
        indexes: {
            byModel: { unique: true, fields: [ { name: 'model', caseInsensitive: true } ] },
            byColor: { unique: false, fields: [ 'color' ] },
            byMileage: { unique: false, range: true, fields: [ 'mileage' ] }
        }
    }
});
```

## Fields

A field is defined with an object `{ type, allowNull }`, or with only the type name as a shorthand for `{ type, allowNull: true }`.

| Property    | Description |
|-------------|-------------|
| `type`      | One of the [data types](#data-types) below. |
| `allowNull` | Optional. Whether the value can be `null`. `true` by default. |

## Data types

| Type          | JavaScript value | Stored as |
|---------------|------------------|-----------|
| `'boolean'`   | `boolean`        | `true` or `false` |
| `'int'`       | `number`, integer or floating point | The number |
| `'string'`    | `string`         | The string |
| `'date'`      | `Date`           | ISO 8601 string |
| `'timestamp'` | `Date`           | Milliseconds since the epoch |

Values of both `date` and `timestamp` fields are passed in and returned as `Date` objects.

## Indexes

[`find()`](../api/queries#find) uses the index that has exactly the fields of the query, so define an index for every combination of fields you search by.

| Property | Description |
|----------|-------------|
| `unique` | Whether two records can have the same values for the fields of the index. A write that would violate a unique index fails with `notUnique`. |
| `range`  | Optional. Makes the index a [range index](#range-indexes). |
| `fields` | The fields of the index, as names or as `{ name, caseInsensitive }` objects. A name is a shorthand for `{ name, caseInsensitive: false }`. |

A case-insensitive field matches values regardless of their case, both in `find()` and when checking uniqueness:

```javascript
indexes: {
    byModel: { unique: true, fields: [ { name: 'model', caseInsensitive: true } ] }
}

await store.create('cars', { model: 'Sedan', /* ... */ });
await store.find('cars', { model: 'SEDAN' }); // [ 1 ]
```

## Range indexes

An index with `range: true` keeps the records sorted by one `int`, `date`, or `timestamp` field, so that `find()` can query it with the bounds `gt`, `gte`, `lt`, and `lte`. A range index can't be unique, and it doesn't contain records whose value is `null`.

```javascript
indexes: {
    byMileage: { unique: false, range: true, fields: [ 'mileage' ] }
}

await store.find('cars', { mileage: { gte: 1000, lt: 5000 } });
```

Results from a range index are sorted by the field value.
