# fastredis

fast and simple cache using redis

[![npm version](https://badge.fury.io/js/%40fastcampus%2Ffastcache.svg)](https://badge.fury.io/js/%40fastcampus%2Ffastcache)

## Getting Started

```[js](js)
const { FastCache } = require('@fastcampus/fastcache');

const cache = FastCache.create({ redis: { host: 'localhost', port: 6379, db: 0 } });

await cache.set('foo', 'hello');
await cache.get('foo');
// hello

const list = cache.list('bar');
await list.unshift('one');
await list.push('two');
await list.getAll();
// [ one, two ]
await list.shift();
// one
await list.pop();
// two

const map = cache.map('baz');
await map.set('one', 'first');
await map.set('two', 'second');
await map.get('one');
// first
await map.getAll(['one', 'two']);
// [ first, second ]
```

## Contributing

### test

```console
$ npm run test
```

### build

```console
$ npm run build
```

### watch(continuous build)

```console
$ npm start
```

---
may the **SOURCE** be with you...
