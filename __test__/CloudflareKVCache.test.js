import { jest, describe, it, expect, beforeEach } from '@jest/globals'

function createFakeKV () {
  const store = {
    data: new Map(),
    lastOptions: undefined,
    getCalls: [],
    putCalls: [],
    deleteCalls: [],
    async get (key, type) {
      this.getCalls.push({ key, type })
      const text = this.data.get(key)
      if (text === undefined) return null
      if (type === 'text') return text
      if (type === 'json') return JSON.parse(text)
      return text
    },
    async put (key, value, options) {
      this.putCalls.push({ key, value, options })
      this.lastOptions = options
      this.data.set(key, value)
    },
    async delete (key) {
      this.deleteCalls.push({ key })
      this.data.delete(key)
    }
  }
  return store
}

async function loadFactoryWithEnv (env) {
  jest.resetModules()
  global.__CF_RUNTIME_ENV__ = env
  const mod = await import('../src/CloudflareKVCache.js')
  return mod.CloudflareKVCache
}

describe('CloudflareKVCache', () => {
  let KV
  let CloudflareKVCache

  beforeEach(async () => {
    KV = createFakeKV()
    CloudflareKVCache = await loadFactoryWithEnv({ KV })
  })

  it('asserts factory options must be an object', async () => {
    const { CloudflareKVCache: Factory } = await import('../src/CloudflareKVCache.js')
    expect(() => Factory(123)).toThrow(TypeError)
    expect(() => Factory('x')).toThrow(TypeError)
  })

  it('works when factory is called without options (default parameter)', async () => {
    const factory = CloudflareKVCache()
    const cache = factory(async () => 'test', { ttl: 60, key: 'test' })
    const result = await cache()
    expect(result).toBe('test')
  })

  it('validates ttl, binding, and key; prefix non-string falls back to empty', async () => {
    const factory = CloudflareKVCache({ ttl: 60 })
    expect(() => factory(() => 1, { ttl: 59 })).toThrow(TypeError)
    expect(() => factory(() => 1, { binding: '' })).toThrow(TypeError)
    expect(() => factory(() => 1, { key: 123 })).toThrow(TypeError)
    // prefix number -> treated as '' and not thrown
    const cache = factory(async () => 'ok', { prefix: 123, key: 'fixed' })
    await cache()
    expect(KV.putCalls[0].key).toBe('fixed')
  })

  it('throws when ttl is missing (undefined)', async () => {
    const factory = CloudflareKVCache({})
    expect(() => factory(() => 1, { key: 'fixed' })).toThrow(TypeError)
  })

  it('uses string key generator and prefix, caches miss then sets', async () => {
    const ttl = 61.8
    const fn = jest.fn(async (x) => x * 2)
    const cache = CloudflareKVCache({ ttl, prefix: 'p:' })(fn, { key: 'fixed' })
    const value = await cache(5)
    expect(value).toBe(10)
    // defaultSet writes JSON string and TTL floored
    expect(KV.putCalls.length).toBe(1)
    expect(KV.putCalls[0].key).toBe('p:fixed')
    expect(KV.lastOptions).toEqual({ expirationTtl: Math.floor(ttl) })
  })

  it('hits cache when present using defaultGet', async () => {
    // Seed stored JSON text
    KV.data.set('p:fixed', JSON.stringify({ ok: true }))
    const fn = jest.fn(async () => ({ ok: false }))
    const cache = CloudflareKVCache({ ttl: 60, prefix: 'p:' })(fn, { key: 'fixed' })
    const value = await cache(0)
    expect(value).toEqual({ ok: true })
    expect(fn).not.toHaveBeenCalled()
  })

  it('skip caching when key function returns false', async () => {
    const fn = jest.fn(async (x) => x + 1)
    const cache = CloudflareKVCache({ ttl: 60 })(fn, { key: () => false })
    const value = await cache(1)
    expect(value).toBe(2)
    expect(KV.putCalls.length).toBe(0)
    expect(KV.getCalls.length).toBe(0)
  })

  it('throws when key function returns non-string', async () => {
    const cache = CloudflareKVCache({ ttl: 60 })(() => 1, { key: () => 123 })
    await expect(cache()).rejects.toThrow(TypeError)
  })

  it('get returns undefined on miss, set stores value, clear deletes', async () => {
    const fn = jest.fn(async (x) => x)
    const cache = CloudflareKVCache({ ttl: 60, prefix: 'p:' })(fn, { key: (x) => `k:${x}` })
    const v = await cache.get(7)
    expect(v).toBeUndefined()
    await cache.set(7, 777)
    expect(KV.putCalls.length).toBe(1)
    const hit = await cache.get(7)
    expect(hit).toBe(777)
    await cache.clear(7)
    expect(KV.deleteCalls.length).toBe(1)
    const after = await cache.get(7)
    expect(after).toBeUndefined()
  })

  it('clear skips when key function returns false', async () => {
    const cache = CloudflareKVCache({ ttl: 60 })(async () => 0, { key: () => false })
    await cache.clear('anything')
    expect(KV.deleteCalls.length).toBe(0)
  })

  it('get skips when key function returns false', async () => {
    const cache = CloudflareKVCache({ ttl: 60 })(async () => 0, { key: () => false })
    const v = await cache.get('anything')
    expect(v).toBeUndefined()
    expect(KV.getCalls.length).toBe(0)
  })

  it('set skips undefined values', async () => {
    const fn = jest.fn()
    const cache = CloudflareKVCache({ ttl: 60 })(fn, { key: 'fixed' })
    await cache.set(undefined)
    expect(KV.putCalls.length).toBe(0)
    await cache.set('value')
    expect(KV.putCalls.length).toBe(1)
  })

  it('raw bypasses cache and calls original fn', async () => {
    const fn = jest.fn(async (x, y) => x + y)
    const cache = CloudflareKVCache({ ttl: 60 })(fn)
    const res = await cache.raw(3, 4)
    expect(res).toBe(7)
    expect(fn).toHaveBeenCalledWith(3, 4)
  })

  it('defaultGet returns undefined on invalid JSON and on KV miss, returns null correctly', async () => {
    // KV miss
    const cache = CloudflareKVCache({ ttl: 60, prefix: '' })(async () => null, { key: 'bad' })
    const miss = await cache.get()
    expect(miss).toBeUndefined()
    // invalid JSON stored
    KV.data.set('bad', 'not-json')
    const invalid = await cache.get()
    expect(invalid).toBeUndefined()
    // explicit null stored
    KV.data.set('bad', 'null')
    const isNull = await cache.get()
    expect(isNull).toBeNull()
  })

  it('custom getter/setter are used when provided', async () => {
    const customGet = jest.fn(async (KV, key) => KV.data.get(key) === '1' ? 1 : undefined)
    const customSet = jest.fn(async (KV, key, value) => KV.data.set(key, String(value)))
    const fn = jest.fn(async () => 1)
    const cache = CloudflareKVCache({ ttl: 60 })(fn, { key: 'fixed', get: customGet, set: customSet })
    // miss -> compute -> set
    const res = await cache()
    expect(res).toBe(1)
    expect(customSet).toHaveBeenCalled()
    // hit
    KV.data.set('fixed', '1')
    const hit = await cache()
    expect(hit).toBe(1)
    expect(customGet).toHaveBeenCalled()
  })

  it('binding resolution asserts when missing binding', async () => {
    const OTHER = createFakeKV()
    CloudflareKVCache = await loadFactoryWithEnv({ OTHER })
    const factory = CloudflareKVCache({ ttl: 60, binding: 'MISSING' })
    await expect(factory(async function test () { return 1 }, { key: 'fixed' })()).rejects.toThrow(TypeError)
  })

  it('resolveKV lazy loads only once', async () => {
    // Call two methods to hit both branches of `if (!runtimeCache)`
    const cache = CloudflareKVCache({ ttl: 60 })(async function one () { return 1 }, { key: 'fixed' })
    await cache.get()
    await cache.set(1)
    // Both operations succeed using same KV
    expect(KV.getCalls.length).toBeGreaterThan(0)
    expect(KV.putCalls.length).toBeGreaterThan(0)
  })

  it('defaultGet catches KV.get errors and treats as miss', async () => {
    KV.get = jest.fn(async () => { throw new Error('boom') })
    const cache = CloudflareKVCache({ ttl: 60 })(async () => 42, { key: 'err' })
    const v = await cache.get()
    expect(v).toBeUndefined()
  })

  it('defaultSet catches KV.put errors and does not throw', async () => {
    KV.put = jest.fn(async () => { throw new Error('boom') })
    const cache = CloudflareKVCache({ ttl: 60 })(async () => 42, { key: 'err2' })
    await expect(cache.set(123)).resolves.toBeUndefined()
  })

  it('defaultSet handles undefined value from cached function', async () => {
    // When the wrapped function returns undefined, defaultSet is called with undefined
    const fn = jest.fn(async () => undefined)
    const cache = CloudflareKVCache({ ttl: 60 })(fn, { key: 'undef-test' })
    await cache()
    expect(fn).toHaveBeenCalled()
    // defaultSet should be called but should not actually put undefined to KV
    expect(KV.putCalls.length).toBe(0)
  })
})
