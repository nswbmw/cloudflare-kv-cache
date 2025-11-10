## cloudflare-kv-cache

Cloudflare KV–based cache wrapper for function results.

## Installation

```bash
$ npm i cloudflare-kv-cache --save
```

## Quick Start

```js
import CloudflareKVCache from 'cloudflare-kv-cache'

const cache = CloudflareKVCache({
  binding: 'KV',
  ttl: 60
})

const cachedGetNow = cache(async function getNow () {
  return new Date().toISOString()
})

export default {
  async fetch (request, env) {
    const now = await cachedGetNow()
    return new Response(now)
  }
}
```

### Options

| Option     | Type              | Required | Default | Description                                                    |
|------------|-------------------|----------|---------|----------------------------------------------------------------|
| `binding`  | string            | No       | `'KV'`  | Cloudflare KV namespace binding name.                          |
| `prefix`   | string            | No       | `''`    | Key prefix for cache keys.                                     |
| `key`      | string\|Function  | No       | `fn.name` | Key generator; return `false` to skip caching.               |
| `ttl`      | number            | Yes      | -       | Time-to-live in seconds (must be ≥ 60).                        |
| `get`      | Function          | No       | -       | Custom getter `(KV, key) => value\|undefined`.                 |
| `set`      | Function          | No       | -       | Custom setter `(KV, key, value, ttl) => void`.                 |

## Example

```js
import CloudflareKVCache from 'cloudflare-kv-cache'

const cache = CloudflareKVCache({
  binding: 'KV',
  prefix: 'user:',
  ttl: 3600
})

const cachedFetchUserData = cache(async function fetchUserData(userId) {
  // Expensive database query
  return db.users.get(userId)
}, {
  key: (userId) => `${userId}`
})

export default {
  async fetch (request, env) {
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')
    
    const userData = await cachedFetchUserData(userId)
    
    return new Response(JSON.stringify(userData), {
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
```

## Test (100% coverage)

```sh
$ npm test
```

## License

MIT
