export interface KVStore {
  get(key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<any | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

export type KeyGenerator = (
  fn: Function,
  args: any[]
) => string | false | Promise<string | false>

export interface CloudflareKVCacheOptions {
  binding?: string
  prefix?: string
  key?: string | KeyGenerator
  ttl: number
  get?: (KV: KVStore, cacheKey: string) => any | Promise<any>
  set?: (KV: KVStore, cacheKey: string, value: any, ttl?: number) => void | Promise<void>
}

export interface CacheInstance<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>>
  raw: (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>
  get: (...args: Parameters<T>) => Promise<any>
  set: (...args: [...Parameters<T>, any]) => Promise<any>
  clear: (...args: Parameters<T>) => Promise<any>
}

export type CacheFactory = <T extends (...args: any[]) => any>(fn: T, options?: Partial<CloudflareKVCacheOptions>) => CacheInstance<T>

export function CloudflareKVCache (defaultConfig?: Partial<CloudflareKVCacheOptions>): CacheFactory
export default CloudflareKVCache