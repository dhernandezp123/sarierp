import path from 'node:path'
import { fileURLToPath } from 'node:url'
const directory = path.dirname(fileURLToPath(import.meta.url))
const config = {
  webpack(config) {
    config.resolve.alias = { ...config.resolve.alias, '@': path.resolve(directory, '../../..') }
    return config
  },
  distDir: '../../../.ua/intermediate/browser-fixture-next',
}
export default config
