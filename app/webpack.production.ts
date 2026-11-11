import * as common from './webpack.common'

import * as webpack from 'webpack'
import merge from 'webpack-merge'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer'
import { createHash } from 'crypto'
import * as path from 'path'
import { getChannel, getDistArchitecture } from '../script/dist-info'

const analyzeBundle =
  process.env.DESKTOP_BUNDLE_ANALYZE?.trim().toLowerCase() === 'true'

// Include resolved replacements rather than just environment variables: version
// and SHA can also come from package.json and the current Git ref.
const cacheVersion = createHash('sha256')
  .update(
    JSON.stringify({
      replacements: common.replacements,
      platform: process.platform,
      architecture: getDistArchitecture(),
      target: process.env.DESKTOP_BUILD_TARGET,
      channel: getChannel(),
      node: process.version,
      analyzeBundle,
    })
  )
  .digest('hex')

const config: webpack.Configuration = {
  mode: 'production',
  devtool: 'source-map',
}

const mainConfig = merge({}, common.main, config)
const cliConfig = merge({}, common.cli, config)
const highlighterConfig = merge({}, common.highlighter, config)

const rendererConfig = merge({}, common.renderer, config, {
  module: {
    rules: [
      // This will cause the compiled CSS to be output to a
      // styles.css and a <link rel="stylesheet"> tag to be
      // appended to the index.html HEAD at compile time
      {
        test: /\.(scss|css)$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
      },
    ],
  },
  plugins: [
    // Necessary to be able to use MiniCssExtractPlugin as a loader.
    new MiniCssExtractPlugin({ filename: 'renderer.css' }),
    ...(analyzeBundle
      ? [
          new BundleAnalyzerPlugin({
            // this generates the static HTML file to view afterwards, rather
            // than disrupting the user
            analyzerMode: 'static',
            openAnalyzer: false,
            // we can't emit this directly to the dist directory because the
            // build script immediately blows away dist after webpack is done
            // compiling the source into bundles
            reportFilename: 'renderer.report.html',
          }),
        ]
      : []),
  ],
})

const crashConfig = merge({}, common.crash, config, {
  module: {
    rules: [
      // This will cause the compiled CSS to be output to a
      // styles.css and a <link rel="stylesheet"> tag to be
      // appended to the index.html HEAD at compile time
      {
        test: /\.(scss|css)$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
      },
    ],
  },
  plugins: [
    // Necessary to be able to use MiniCssExtractPlugin as a loader.
    new MiniCssExtractPlugin({ filename: 'crash.css' }),
  ],
})

// eslint-disable-next-line no-restricted-syntax
export default [
  mainConfig,
  rendererConfig,
  crashConfig,
  cliConfig,
  highlighterConfig,
].map(configuration => ({
  ...configuration,
  cache: {
    type: 'filesystem' as const,
    // Do not put this below node_modules, which may be shared by worktrees.
    cacheDirectory: path.resolve(__dirname, '..', '.webpack-cache'),
    name: `production-${Object.keys(configuration.entry ?? {}).join('-')}`,
    version: cacheVersion,
    buildDependencies: {
      config: [__filename, path.resolve(__dirname, 'webpack.common.ts')],
      dependencies: [
        path.resolve(__dirname, '..', 'package.json'),
        path.resolve(__dirname, '..', 'package-lock.json'),
        path.resolve(__dirname, 'package.json'),
        path.resolve(__dirname, 'package-lock.json'),
      ],
      typescript: [
        path.resolve(__dirname, '..', 'tsconfig.json'),
        path.resolve(__dirname, 'src/highlighter/tsconfig.json'),
        path.resolve(__dirname, '..', 'script/tsconfig.json'),
      ],
    },
  },
}))
