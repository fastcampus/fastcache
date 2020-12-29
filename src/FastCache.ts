import Debug from 'debug';
import { ClientOpts, RedisClient, createClient } from 'redis';
import { promisify } from 'util';
import { createHash } from 'crypto';

const debug = Debug('fastcache');

export interface FastCacheOpts {
  prefix?: string;
  ttl?: number;
  redis?: ClientOpts;
  createRedisClient?: (ClientOpts) => RedisClient;
}

export interface ListOperations {
  key: string;
  push(value: string): Promise<void>;
  pop(): Promise<string>;
  unshift(value: string): Promise<void>;
  shift(): Promise<string>;
  setAll(values: Array<string>): Promise<void>;
  getAll(start: number, stop: number): Promise<string>;
  removeAll(start: number, stop: number): Promise<void>;
  length(): Promise<number>;
}

export interface MapOperations {
  key: string;
  set(field: string, value: string): Promise<void>;
  get(field: string): Promise<string>;
  remove(field: string): Promise<void>;
  setAll(obj: any): Promise<void>;
  getAll(fields: Array<string>): Promise<Array<string>>;
  removeAll(fields: Array<string>): Promise<void>;
  length(): Promise<number>;
}

export interface SetOperations {
  key: string;
  add(...values: Array<string>): Promise<void>;
  remove(...values: Array<string>): Promise<void>;
  contains(value: string): Promise<boolean>;
  length(): Promise<number>;
}

export class FastCache {
  static create(opts?: FastCacheOpts): FastCache {
    return new FastCache(opts);
  }

  private client: any;
  private prefix: string;
  private ttl: number;

  private constructor(opts?: FastCacheOpts) {
    this.init(opts);
  }

  public init(opts: FastCacheOpts) {
    const createRedisClient = opts.createRedisClient || createClient;
    const client = createRedisClient(opts.redis);
    debug(`connect redis: ${opts.redis.host}:${opts.redis.port}/${opts.redis.db}`);
    // wrap redis client with promisified functions
    this.client = new Proxy(client, {
      get(target, p) {
        const m = /^(\w+)Async$/.exec(String(p));
        if (m) {
          return promisify(target[m[1]]).bind(target);
        }
        return target[p];
      },
    });
    this.prefix = opts.prefix || '';
    this.ttl = opts.ttl || 60 * 5; // 5min
  }

  public destroy() {
    debug('destroy');
    this.client.end(true);
  }

  //---------------------------------------------------------

  public async set(key: string, value: string, ex?: number): Promise<void> {
    return this.client.setAsync(key, value, 'EX', ex || this.ttl);
  }

  public async get(key: string): Promise<string> {
    return this.client.getAsync(key);
  }

  public async remove(key: string): Promise<void> {
    return this.client.delAsync(key);
  }

  public async setAll(obj): Promise<void> {
    // mset doesn't support expire!
    // return msetAsync(obj);
    return new Promise((resolve, reject) => {
      const multi = this.client.multi();
      for (const [key, value] of Object.entries(obj)) {
        multi.set(key, value as string, 'EX', this.ttl);
      }
      multi.exec((err) => {
        err ? reject(err) : resolve();
      });
    });
  }

  public async getAll(keys: Array<string>): Promise<string> {
    return this.client.mgetAsync(keys);
  }

  public async removeAll(keys: Array<string>): Promise<void> {
    return this.client.delAsync(keys);
  }

  public async flush(pattern = '*'): Promise<void> {
    if (pattern === '*') {
      return this.client.flushdbAsync('ASYNC');
    }
    // XXX: partial flush
    const scanCallback = (err, result) => {
      if (err) {
        return debug('flush scan err', err);
      }
      const keys = result[1];
      if (keys && keys.length) {
        this.client.unlink(keys, (err) => {
          err ? debug('flush unlink err', err) : debug('flush unlink ok', result);
        });
      }
      if (result[0] !== '0') {
        this.client.scan(result[0], 'MATCH', pattern, 'COUNT', String(50), scanCallback);
      }
    };
    this.client.scan('0', 'MATCH', pattern, 'COUNT', String(50), scanCallback);
  }

  //---------------------------------------------------------
  // list

  public list(key: string): ListOperations {
    return {
      key,
      push: async (value: string): Promise<void> => this.client.rpushAsync(key, value),
      pop: async (): Promise<string> => this.client.rpopAsync(key),
      unshift: async (value: string): Promise<void> => this.client.lpushAsync(key, value),
      shift: async (): Promise<string> => this.client.lpopAsync(key),
      setAll: async (values: Array<string>): Promise<void> => this.client.lpushAsync(key, values),
      getAll: async (start = 0, stop = -1): Promise<string> => this.client.lrangeAsync(key, start, stop),
      removeAll: async (start = -1, stop = 0): Promise<void> => this.client.ltrimAsync(key, start, stop),
      length: async (): Promise<number> => this.client.llenAsync(key),
    };
  }

  //---------------------------------------------------------
  // map

  map(key: string): MapOperations {
    return {
      key,
      set: async (field: string, value: string): Promise<void> => this.client.hsetAsync(key, field, value),
      get: async (field: string): Promise<string> => this.client.hgetAsync(key, field),
      remove: async (field: string): Promise<void> => this.client.hdelAsync(key, field),
      setAll: async (obj: any): Promise<void> => this.client.hmsetAsync(key, obj),
      getAll: async (fields: Array<string>): Promise<Array<string>> => this.client.hmgetAsync(key, fields),
      removeAll: async (fields: Array<string>): Promise<void> => this.client.hdelAsync(key, fields),
      length: async (): Promise<number> => this.client.hlenAsync(key),
    };
  }

  //---------------------------------------------------------

  setOf(key: string): SetOperations {
    return {
      key,
      add: async (...values: Array<string>) => this.client.saddAsync(key, ...values),
      remove: async (...values: Array<string>) => this.client.sremAsync(key, ...values),
      contains: async (value: string): Promise<boolean> => this.client.sismemberAsync(key, value),
      length: async (): Promise<number> => this.client.scard(key),
    };
  }

  //---------------------------------------------------------

  public async withCache(key: string, executor: Promise<any>): Promise<any> {
    const cached = await this.get(key);
    if (cached) {
      return this.deserialize(cached);
    }
    return executor
      .then((result) => {
        setImmediate(() =>
          this.set(key, this.serialize(result))
            .then((result) => debug('set ok', result))
            .catch((err) => debug('set error', err))
        );
        return result;
      })
      .catch((err) => {
        setImmediate(() =>
          this.remove(key)
            .then((result) => debug('set ok', result))
            .catch((err) => debug('set error', err))
        );
        throw err;
      });
  }

  //---------------------------------------------------------

  public cacheKey(o: any) {
    return createHash('sha1').update(this.serialize(o)).digest('base64');
  }

  private serialize(o: any): string {
    try {
      return JSON.stringify(o);
    } catch (e) {
      // TODO: better error handling
      return null;
    }
  }

  private deserialize(s: string): any {
    try {
      return JSON.parse(s);
    } catch (e) {
      // TODO: better error handling
      return null;
    }
  }
}
