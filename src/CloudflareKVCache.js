/**
 * Cloudflare KV–based cache wrapper for function results.
 *
 * @param {Object} [options] - Default options merged into each cache instance.
 * @param {string} [options.binding] - Cloudflare KV namespace binding name, default: 'KV'.
 * @param {string} [options.prefix] - Key prefix for cache keys, default `''`.
 * @param {string|Function} [options.key] - Key generator; return `false` to skip caching, default: `fn.name`.
 * @param {number} options.ttl - Time-to-live in seconds (must be >= 60).
 * @param {Function} [options.get] - Custom getter `(KV, key) => value|undefined`.
 * @param {Function} [options.set] - Custom setter `(KV, key, value, ttl) => void`.
 * @returns {(fn: Function, fnOptions?: Object) => Function} Cache function with `raw/get/set/clear` methods.
 */
export function CloudflareKVCache (options = {}) {
  assert(typeof options === 'object', '`options` must be object!')

  return function kvCache (fn, fnOptions = {}) {
    const opts = Object.assign({}, options, fnOptions)

    const binding = opts.binding || 'KV'
    const prefix = typeof opts.prefix === 'string' ? opts.prefix : ''
    const ttl = opts.ttl
    const keyGenerator = opts.key || fn.name
    const getter = typeof opts.get === 'function' ? opts.get : defaultGet
    const setter = typeof opts.set === 'function' ? opts.set : defaultSet

    assert(typeof binding === 'string' && binding.length > 0, 'binding must be a non-empty string (KV binding name)')
    assert(typeof prefix === 'string', 'prefix must be a string')
    assert(keyGenerator && ((typeof keyGenerator === 'string') || (typeof keyGenerator === 'function')), '`key` must be string or function!')
    assert(Number.isFinite(ttl) && ttl >= 60, 'ttl must be a number of seconds >= 60')

    // Lazy resolve KV from Cloudflare runtime by binding name
    let runtimeCache = null
    async function resolveKV () {
      if (!runtimeCache) {
        runtimeCache = await import('cloudflare:workers')
      }
      const KV = runtimeCache.env[binding]
      assert(KV && typeof KV.get === 'function' && typeof KV.put === 'function' && typeof KV.delete === 'function', `KV binding not found or invalid for name: ${binding}`)
      return KV
    }

    async function computeKey (args) {
      if (typeof keyGenerator === 'string') {
        return prefix + keyGenerator
      }
      const key = await keyGenerator.apply(fn, args)
      if (key === false) return false
      assert(typeof key === 'string', 'key function must return a string or false')
      return prefix + key
    }

    async function raw (...args) {
      return fn.apply(this, args)
    }

    async function cache (...args) {
      const cacheKey = await computeKey(args)
      if (cacheKey === false) {
        return fn.apply(this, args)
      }
      const KV = await resolveKV()
      let result = await getter(KV, cacheKey)
      if (result !== undefined) {
        return result
      }
      result = await fn.apply(this, args)
      await setter(KV, cacheKey, result, ttl)
      return result
    }

    async function get (...args) {
      const cacheKey = await computeKey(args)
      if (cacheKey === false) {
        return
      }
      const KV = await resolveKV()
      return getter(KV, cacheKey)
    }

    async function set (...argsAndValue) {
      const value = argsAndValue[argsAndValue.length - 1]
      const args = argsAndValue.slice(0, -1)
      const cacheKey = await computeKey(args)
      if ((cacheKey === false) || (value === undefined)) {
        return
      }
      const KV = await resolveKV()
      return setter(KV, cacheKey, value, ttl)
    }

    async function clear (...args) {
      const cacheKey = await computeKey(args)
      if (cacheKey === false) {
        return
      }
      const KV = await resolveKV()
      return KV.delete(cacheKey)
    }

    cache.raw = raw
    cache.get = get
    cache.set = set
    cache.clear = clear

    return cache
  }
}

function assert (condition, message) {
  if (!condition) throw new TypeError(message)
}

async function defaultGet (KV, key) {
  try {
    const text = await KV.get(key)
    // KV miss returns null -> treat as undefined (cache miss)
    if (text == null) return
    return JSON.parse(text)
  } catch (_) {
    // If stored value isn't valid JSON, treat as miss
  }
}

async function defaultSet (KV, key, value, ttl) {
  // Do not save `undefined` value, `null` is ok
  if (value === undefined) return
  try {
    await KV.put(key, JSON.stringify(value), {
      expirationTtl: Math.floor(ttl)
    })
  } catch (_) {}
}

export default CloudflareKVCache
