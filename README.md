
## Status:

[![Build Status](https://secure.travis-ci.org/ilkkao/object-store.png)](http://travis-ci.org/ilkkao/object-store)

[![Coverage Status](https://coveralls.io/repos/ilkkao/object-store/badge.svg?branch=master&service=github)](https://coveralls.io/github/ilkkao/object-store?branch=master)

## Example

```javascript
const ObjectStore = require('object-store');

let store = new ObjectStore('foo', {
    car: {
        definition: {
            color: 'string',
            mileage: 'int',
            convertible: 'boolean',
            purchaseDate: 'date'
        },
        indices: [{
            uniq: true,
            fields: [ 'purchaseDate', 'mileage' ]
        }, {
            uniq: false,
            fields: [ 'color', 'mileage' ]
        }]
    }
}, {
    db: 15
});

store.create('car', {
        color: 'blue',
        mileage: 12345,
        convertible: true,
        purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0000 (UTC)')
    })
}).then(function(id) {
    return store.get(id);
}).then(function(object) {
    // object = {
    //     color: 'blue',
    //     mileage: 12345,
    //     convertible: true,
    //     purchaseDate: new Date('Sun Nov 01 2015 17:41:24 GMT+0000 (UTC)')
    // }
});
```

## API

### new ObjectStore(prefix, definition, options)

### create(collection, attributes)

### update(collection, id, attributes)

### delete(collection, id)

### get(collection, id)

### exists(collection, id)

### list(collection)

### size(collection)

### multi(transaction)

### find(collection, searchAttributes)

### findAll(collection, searchAttributes)
