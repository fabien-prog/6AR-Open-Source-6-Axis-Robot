// craco.config.js

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // 1) Ensure resolve.extensions exists and add `.mjs`
      webpackConfig.resolve = webpackConfig.resolve || {};
      webpackConfig.resolve.extensions = webpackConfig.resolve.extensions || [
        '.js',
        '.jsx',
        '.ts',
        '.tsx',
        '.json',
      ];
      if (!webpackConfig.resolve.extensions.includes('.mjs')) {
        webpackConfig.resolve.extensions.push('.mjs');
      }

      // 2) Add a rule so `.mjs` files in node_modules are parsed as JS
      webpackConfig.module = webpackConfig.module || {};
      webpackConfig.module.rules = webpackConfig.module.rules || [];
      webpackConfig.module.rules.unshift({
        test: /\.mjs$/,
        include: /node_modules/,
        type: 'javascript/auto',
      });

      // 3) Keep your existing ignoreWarnings
      webpackConfig.ignoreWarnings = [
        {
          module: /@mediapipe\/tasks-vision/,
          message: /Failed to parse source map/,
        },
      ];

      return webpackConfig;
    },
  },
};
