// Jest ESM mock for the virtual module 'cloudflare:worker'
// Tests can set global.__CF_RUNTIME_ENV__ before importing the module under test.
export const env = global.__CF_RUNTIME_ENV__ || {}
