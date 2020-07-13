import FastCache from '../src/fast-cache';

const main = async () => {
  const cache = FastCache.create({ redis: { host: 'localhost', port: 6379, db: 0 } });

  await cache.set('foo', 'hello');
  console.log(await cache.get('foo'));
  // hello

  const list = cache.list('bar');
  await list.unshift('one');
  await list.push('two');
  console.log(await list.getAll());
  // [ one, two ]
  console.log(await list.shift());
  // one
  console.log(await list.pop());
  // two

  const map = cache.map('baz');
  await map.set('one', 'first');
  await map.set('two', 'second');
  console.log(await map.get('one'));
  // first
  console.log(await map.getAll(['one', 'two']));
  // [ first, second ]

  cache.destroy();
};

main().then(console.info).catch(console.error);
