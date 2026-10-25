# Changelog

## 2.0.0 (unreleased)

### Breaking changes

- Methods resolve to their value directly instead of a `{ val }` result object, and failures reject the promise with a `RigidDBError` that has `code`, `method`, and, when they apply, `indexes` and `reason`. `delete()` and `setSchema()` resolve to nothing.
- `setSchema()` fails with the error codes `invalidSchema` (with the message in `reason`) and `schemaExists` instead of a `reason` result.
- In a transaction, an `exists()` that finds no record fails the transaction with `notFound` instead of resolving to `false`.
- The `Result`, `Success`, `Failure`, and `SetSchemaResult` types are removed.
- `quit()` resolves to nothing, and leaves a client passed to the constructor open.

### New features

- The third constructor argument can be an existing ioredis client, a `redis://` or `rediss://` URL, or any ioredis options, such as `username`, `tls`, or `sentinels`. The `keyPrefix` option is rejected, because the Lua scripts can't honor it.

## 1.0.0

The API now uses the same terms as the documentation: records with fields, stored in collections and found through indexes.

### Breaking changes

- Schema keys are renamed: `definition` is `fields`, `indices` is `indexes`, and `uniq` is `unique`.
- `multi()` is renamed to `transaction()`, and `size()` to `count()`. The `method` of their failed results is `'transaction'` and `'count'`.
- The `indices` property of a failed `create` or `update` result is renamed to `indexes`.
- Error code `badParameter` is renamed to `missingFields`, and `badSavedSchema` to `invalidStoredSchema`.
- TypeScript types `Attributes`, `Value`, and `Id` are renamed to `FieldValues`, `FieldValue`, and `RecordId`.

Databases created with 0.x keep working: the stored schema is read with the old key names, and `getSchema()` returns it with the new ones. The Redis key layout is unchanged.

### Other changes

- The generated Lua scripts are built from indented multi-line blocks and are indented like hand-written Lua in the debug log.
- README uses database terminology.

## 0.12.1

### Fixes

- `rigiddb/package.json` can be imported. It was missing from `exports`, which broke tools that read the package version that way.

### Other changes

- Test coverage is 100%, and CI fails if it drops.
- Coverage is reported to Codecov instead of Coveralls.

## 0.12.0

### Breaking changes

- Node.js 22 or later is required.
- The package is now an ES module (`import RigidDB from 'rigiddb'`). CommonJS code can use `require('rigiddb').default` (Node.js 22.12+).
- `date` values are stored as ISO 8601 strings instead of `Date.prototype.toString()` output. Old values are still read correctly, but `find()` doesn't match `date` index entries written by older versions.
- The constructor throws `Error` objects instead of strings.
- `setSchema()` rejects collection and index names that contain characters other than letters, numbers, dashes, and underscores. A saved schema with such names is reported as `badSavedSchema`.
- `getSchema()` returns the real schema revision instead of always `1`.

### Fixes

- `int` values with decimals were truncated when read back (`1.5` became `1`).
- `date` values lost their milliseconds, and their stored form depended on the time zone of the Node.js process, so the same date got different index keys on different servers.
- An invalid `Date` (`new Date('foo')`) was accepted for `date` and `timestamp` fields.
- `multi()` with more than about a dozen operations failed with a Lua "more than 200 local variables" error.
- A Lua script that failed for any reason was run a second time. Now only a script missing from the Redis script cache is retried.
- If Redis couldn't be reached when the schema was loaded, the rejected promise was unhandled (which crashes Node.js), and every API call after that failed for good. Now the error is returned to the next API call, which loads the schema again.
- Collection names like `constructor` or `__proto__` were treated as existing collections.
- `setSchema()` crashed on a schema with `null` collection, field, or index definitions instead of returning an error.
- Changing the object passed to `setSchema()` afterwards changed what `getSchema()` returned.
- `debugPrint()` crashed when called before the schema was loaded.
- The `debug` namespace is now `rigiddb` (was `code`).

### Other changes

- Rewritten in strict TypeScript, type definitions are included.
- Updated `ioredis` to 6 and `debug` to 4. Dropped the `clone` and `console.table` dependencies.
- Uses `HSET` instead of the deprecated `HMSET`.
- CI moved from Travis CI to GitHub Actions.
