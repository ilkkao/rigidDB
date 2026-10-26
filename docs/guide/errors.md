# Errors

Every method returns a promise. When an operation fails, the promise is rejected with a `RigidDBError` that has these properties:

| Property  | Description |
|-----------|-------------|
| `code`    | Error code, see the table below. |
| `method`  | Name of the method that failed. In a transaction, the operation that failed. |
| `indexes` | Names of the violated unique indexes. Set for `notUnique`. |
| `reason`  | Why the schema is invalid. Set for `invalidSchema`. |

Errors from Redis itself, such as a lost connection, are passed through as they are.

```javascript
import { RigidDBError } from 'rigiddb';

try {
    await store.update('cars', 999, { mileage: 1 });
} catch (err) {
    if (err instanceof RigidDBError) {
        console.log(err.method, err.code); // 'update' 'notFound'
    } else {
        throw err; // A Redis error
    }
}
```

## Error codes

| Error code            | Description |
|-----------------------|-------------|
| `invalidSchema`       | The schema given to `setSchema()` or `alterSchema()` is invalid. |
| `schemaExists`        | `setSchema()` was called for a database that already has a schema. |
| `schemaMissing`       | No schema has been set for the database with `setSchema()`. |
| `invalidStoredSchema` | The schema stored in Redis is invalid. |
| `unknownCollection`   | The collection isn't defined in the schema. |
| `unknownIndex`        | No index has exactly the fields given to `find()`. |
| `missingFields`       | `create()` didn't get a value for every field in the schema. |
| `nullNotAllowed`      | A field value is `null`, but the field is defined with `allowNull: false`. |
| `wrongType`           | A field value doesn't match the field type in the schema. |
| `notFound`            | No record with the given id exists. |
| `notUnique`           | The write would violate a unique index. |
| `invalidQuery`        | The options or range bounds given to `find()`, `findRecords()`, or `list()` are invalid. |
| `schemaChanged`       | Another instance changed the schema twice while the operation was running. Try again. |
