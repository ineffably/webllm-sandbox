const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    entry: './src/index.tsx',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProduction ? 'bundle.js' : '[name].[contenthash].js',
      publicPath: isProduction ? '/dist/' : '/',
      clean: true,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      fallback: {
        'buffer': require.resolve('buffer/'),
        'module': false,
        'fs': false,
        'path': false,
        'crypto': false,
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    plugins: [
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
      }),
      new HtmlWebpackPlugin({
        template: './index.html',
        inject: !isProduction, // Only inject in dev mode
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: 'public', to: '' },
        ],
      }),
    ],
    devServer: {
      static: [
        {
          directory: path.join(__dirname, 'dist'),
        },
        {
          directory: path.join(__dirname, 'public'),
          publicPath: '/',
        },
      ],
      port: 4004,
      hot: true,
      open: false,
      // Note: COOP/COEP disabled for dev to allow WebSocket logging
      // WebLLM will use fallback mode without SharedArrayBuffer (slightly slower)
      // headers: {
      //   'Cross-Origin-Opener-Policy': 'same-origin',
      //   'Cross-Origin-Embedder-Policy': 'require-corp',
      // },
      proxy: [
        {
          context: ['/logs'],
          target: 'ws://localhost:9100',
          ws: true,
        },
      ],
    },
    experiments: {
      asyncWebAssembly: true,
    },
  };
};
