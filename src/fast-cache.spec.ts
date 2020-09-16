import redis from 'redis';
import { FastCache } from './fast-cache';

describe('FastCache', () => {
  let client;
  let cache;

  beforeEach((done) => {
    const redisConfig = { host: 'localhost', port: 6379, db: 0 };
    cache = FastCache.create({ redis: redisConfig, createRedisClient: redis.createClient });
    client = redis.createClient(redisConfig);
    client.flushdb(done);
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('set', () => {
    test('should work', (done) => {
      const test = 'test' + Math.random();
      cache.set('hello', test).then(() => {
        client.get('hello', (err, result) => {
          expect(err).toBeNull();
          expect(result).toBe(test);
          done();
        });
      });
    });
  });

  describe('get', () => {
    test('should work', (done) => {
      const test = 'test' + Math.random();
      client.set('hello', test);
      cache.get('hello').then((value) => {
        expect(value).toBe(test);
        client.del('hello', () => {
          cache.get('hello').then((value) => {
            expect(value).toBeNull();
            done();
          });
        });
      });
    });
  });

  describe('remove', () => {
    test('should work', (done) => {
      const test = 'test' + Math.random();
      client.set('hello', test);
      cache.get('hello').then((value) => {
        expect(value).toBe(test);
        cache.remove('hello').then((value) => {
          cache.get('hello').then((value) => {
            expect(value).toBeNull();
            done();
          });
        });
      });
    });
  });

  describe('list', () => {
    describe('push', () => {
      test('should work', (done) => {
        const list = cache.list('hello');
        list
          .push('foo')
          .then(() => {
            return list.push('bar');
          })
          .then(() => {
            client.lrange('hello', 0, -1, (err, result) => {
              expect(err).toBeNull();
              expect(result).toEqual(['foo', 'bar']);
              done();
            });
          });
      });
    });
    describe('pop', () => {
      test('should work', (done) => {
        client.lpush('hello', 'foo', 'bar');
        const list = cache.list('hello');
        list
          .pop()
          .then((result) => {
            expect(result).toBe('foo');
            return list.pop();
          })
          .then((result) => {
            expect(result).toBe('bar');
            return list.pop();
          })
          .then((result) => {
            expect(result).toBeNull();
            done();
          });
      });
    });
  });

  describe('map', () => {
    describe('set', () => {
      test('should work', (done) => {
        const map = cache.map('hello');
        map
          .set('foo', 'bar')
          .then(() => {
            return map.set('baz', 'qux');
          })
          .then(() => {
            client.hmget('hello', 'foo', 'baz', '__not_found__', (err, result) => {
              expect(err).toBeNull();
              expect(result).toEqual(['bar', 'qux', null]);
              done();
            });
          });
      });
    });
    describe('get', () => {
      test('should work', (done) => {
        client.hmset('hello', 'foo', 'bar', 'baz', 'qux', () => {
          const map = cache.map('hello');
          map
            .get('foo')
            .then((result) => {
              expect(result).toBe('bar');
              return map.get('baz');
            })
            .then((result) => {
              expect(result).toBe('qux');
              return map.get('__not_found__');
            })
            .then((result) => {
              // FIXME: why undefined?
              // SOLVE: redis-mock undefined, real redis is null
              //expect(result).toBeUndefined();
              expect(result).toBeNull();
              done();
            });
        });
      });
    });
  });

  describe('withLock', () => {
    test('should work', async () => {
      cache.turnOnLock(client);
      const lockKey = 'locks:hello-lock';
      const test = 'test' + Math.random();
      await cache.set(lockKey, test);
      await cache.lock(lockKey);
      const r1 = await cache.get(lockKey);
      expect(r1).toBe(test);
      await cache.set(lockKey, 'anything');
      const r2 = await cache.get(lockKey);
      expect(r2).toBe(test);
      await cache.unlock();
    });
  });

  describe.skip('withCache', () => {
    test('should be tested', (done) => {
      done();
    });
  });

  describe('cacheKey', () => {
    test('should generate same hash for same obj', async () => {
      for (let i = 0; i < 1000; i += 1) {
        const x = Math.random();
        const r1 = cache.cacheKey({ test: x });
        const r2 = cache.cacheKey({ test: x });
        expect(r1).toBe(r2);
      }
    });
  });
});
