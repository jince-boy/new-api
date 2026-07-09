import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { defineConfig, loadEnv } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const semiUiDir = path.resolve(
  path.dirname(require.resolve('@douyinfe/semi-ui')),
  '../..',
)
const semiFoundationRequire = createRequire(
  require.resolve('@douyinfe/semi-foundation'),
)
const dateFnsDir = path.dirname(
  semiFoundationRequire.resolve('date-fns/package.json'),
)
const vchartDir = path.dirname(require.resolve('@visactor/vchart/package.json'))
const visactorRuntimeDir = path.resolve(vchartDir, 'node_modules/@visactor')

export default defineConfig(({ envMode }) => {
  const env = loadEnv({ mode: envMode, prefixes: ['VITE_'] })
  const clientServerUrl =
    process.env.VITE_REACT_APP_SERVER_URL ||
    env.rawPublicVars.VITE_REACT_APP_SERVER_URL ||
    ''
  const proxyServerUrl = clientServerUrl || 'http://localhost:3000'
  const isProd = envMode === 'production'
  const devProxy = Object.fromEntries(
    (['/api', '/mj', '/pg'] as const).map((key) => [
      key,
      { target: proxyServerUrl, changeOrigin: true },
    ]),
  ) as Record<string, { target: string; changeOrigin: boolean }>

  return {
    plugins: [pluginReact()],
    source: {
      entry: {
        index: './src/index.jsx',
      },
      define: {
        'import.meta.env.VITE_REACT_APP_SERVER_URL': JSON.stringify(
          clientServerUrl,
        ),
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        'date-fns': dateFnsDir,
        '@douyinfe/semi-ui/dist/css/semi.css': path.resolve(
          semiUiDir,
          'dist/css/semi.css',
        ),
        '@visactor/vchart': vchartDir,
        '@visactor/vdataset': path.resolve(visactorRuntimeDir, 'vdataset'),
        '@visactor/vrender-components': path.resolve(
          visactorRuntimeDir,
          'vrender-components',
        ),
        '@visactor/vrender-core': path.resolve(
          visactorRuntimeDir,
          'vrender-core',
        ),
        '@visactor/vrender-kits': path.resolve(
          visactorRuntimeDir,
          'vrender-kits',
        ),
        '@visactor/vscale': path.resolve(visactorRuntimeDir, 'vscale'),
        '@visactor/vutils': path.resolve(visactorRuntimeDir, 'vutils'),
        '@visactor/vutils-extension': path.resolve(
          visactorRuntimeDir,
          'vutils-extension',
        ),
      },
    },
    html: {
      template: './index.html',
    },
    server: {
      host: '0.0.0.0',
      port: 3002,
      strictPort: false,
      proxy: devProxy,
    },
    output: {
      minify: isProd,
      target: 'web',
      distPath: {
        root: 'dist',
      },
    },
    performance: {
      removeConsole: isProd ? ['log'] : false,
      buildCache: {
        cacheDigest: [process.env.VITE_REACT_APP_VERSION],
      },
    },
    tools: {
      rspack: {
        module: {
          rules: [
            {
              test: /src[\\/].*\.js$/,
              type: 'javascript/auto',
              use: [
                {
                  loader: 'builtin:swc-loader',
                  options: {
                    jsc: {
                      parser: {
                        syntax: 'ecmascript',
                        jsx: true,
                      },
                      transform: {
                        react: {
                          runtime: 'automatic',
                          development: !isProd,
                          refresh: !isProd,
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    },
  }
})
