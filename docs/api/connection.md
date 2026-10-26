# Connection

## new RigidDB()

```typescript
new RigidDB(databaseName, revision, connection?, redisErrorHandler?)
```

Opens a connection to a database.

| Argument            | Description |
|---------------------|-------------|
| `databaseName`      | Name of a new or existing database, letters only. Used as the prefix of all Redis keys. |
| `revision`          | Schema revision number, an integer. |
| `connection`        | Optional. An existing `ioredis` client, a `redis://` or `rediss://` URL, or [`ioredis` options](https://github.com/redis/ioredis). All options are supported except `keyPrefix`; use `databaseName` instead. Defaults to `localhost:6379`. |
| `redisErrorHandler` | Optional. A function that is called with Redis connection errors. |

Throws an `Error` if `databaseName` or `revision` is invalid, or if the connection uses the `keyPrefix` option.

### Examples

Connect to Redis on `localhost:6379`:

```javascript
import RigidDB from 'rigiddb';

const store = new RigidDB('mydb', 1);
```

Connect with a URL:

```javascript
const store = new RigidDB('mydb', 1, 'rediss://:password@redis.example.com:6380/0');
```

Connect with `ioredis` options and log connection errors:

```javascript
const store = new RigidDB('mydb', 1, { host: 'redis.internal', port: 6379, db: 2 }, err => {
    console.error('Redis error', err);
});
```

Share an existing `ioredis` client. [`quit()`](./utilities#quit) leaves it open:

```javascript
import { Redis } from 'ioredis';

const redis = new Redis();
const store = new RigidDB('mydb', 1, redis);
```
