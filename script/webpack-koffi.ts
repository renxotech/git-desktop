import webpack from 'webpack'

/** Bundle only the target's native Koffi package, even during cross-compilation. */
export function getKoffiWebpackConfig(
  nodeModulesRoot: string,
  platform: NodeJS.Platform,
  arch: string
): webpack.Configuration {
  const targetPackage = `@koromix/koffi-${platform}-${arch}`
  // Koffi catches missing optional packages. Resolve eagerly so a missing target
  // fails the build instead of producing an app that cannot load the SDK.
  const entry = require.resolve(targetPackage, { paths: [nodeModulesRoot] })
  // Renderer chunks are classic scripts. Koffi's ESM entry uses
  // import.meta.dirname, which webpack does not lower for this output.
  const commonJSEntry = require.resolve('koffi', { paths: [nodeModulesRoot] })

  return {
    resolve: {
      alias: { koffi$: commonJSEntry, [`${targetPackage}$`]: entry },
    },
    plugins: [
      new webpack.IgnorePlugin({
        checkResource: request =>
          request.startsWith('@koromix/koffi-') && request !== targetPackage,
      }),
    ],
  }
}
