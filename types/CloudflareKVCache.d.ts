export interface KVStore {
  get(key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<any | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

type CacheableFunction = (...args: any[]) => any

export type KeyGenerator<T extends CacheableFunction = CacheableFunction> = (
  this: T,
  ...args: Parameters<T>
) => string | false | Promise<string | false>

export interface CloudflareKVCacheOptions<T extends CacheableFunction = CacheableFunction> {
  binding?: string
  prefix?: string
  key?: string | KeyGenerator<T>
  ttl: number
  get?: (KV: KVStore, cacheKey: string) => any | Promise<any>
  set?: (KV: KVStore, cacheKey: string, value: any, ttl?: number) => void | Promise<void>
}

export interface CacheInstance<T extends CacheableFunction> {
  (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>>
  raw: (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>
  get: (...args: Parameters<T>) => Promise<any>
  set: (...args: [...Parameters<T>, any]) => Promise<any>
  clear: (...args: Parameters<T>) => Promise<any>
}

export type CacheFactory = <T extends CacheableFunction>(fn: T, options?: Partial<CloudflareKVCacheOptions<T>>) => CacheInstance<T>

export function CloudflareKVCache (defaultConfig?: Partial<CloudflareKVCacheOptions>): CacheFactory
export default CloudflareKVCache
