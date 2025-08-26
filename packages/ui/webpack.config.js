// Generated using webpack-cli https://github.com/webpack/webpack-cli

const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const WorkboxWebpackPlugin = require("workbox-webpack-plugin");
require('dotenv').config({ path: '../../.env' }); 

const isProduction = process.env.NODE_ENV == "production";

const stylesHandler = isProduction
  ? MiniCssExtractPlugin.loader
  : "style-loader";

const config = {
  entry: "./src/index.tsx",
  output: {
    path: path.resolve(__dirname, "lib"),
    filename: '[name].[contenthash].js',
    clean: true,
  },
  devServer: {
    host: "localhost",
    open: true,
    hot: true,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./src/index.html",
    }),
    new webpack.ProvidePlugin({
      process: 'process/browser',
    }),
    new webpack.EnvironmentPlugin({
      PSW_PUBLIC_KEY: JSON.stringify(process.env.PSW_PUBLIC_KEY),
      NODE_ENV: JSON.stringify(process.env.NODE_ENV),
    })
  ],
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/i,
        loader: "ts-loader",
        exclude: ["/node_modules/"],
      },
      {
        test: /\.css$/i,
        use: [stylesHandler, "css-loader"],
      },
      {
        test: /\.s[ac]ss$/i,
        use: [stylesHandler, "css-loader", "sass-loader"],
      },
      {
        test: /\.(eot|svg|ttf|woff|woff2|png|jpg|gif)$/i,
        type: "asset",
      },
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react']
          }
        }
      },
      // Add your rules for custom modules here
      // Learn more about loaders from https://webpack.js.org/loaders/
    ],
  },
  optimization: {
    runtimeChunk: 'single',
    splitChunks: {
      maxSize: 300000,
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all'
        }
      }
    }
  },
  resolve: {
    fallback: {
      "os": require.resolve("os-browserify/browser"),
      "stream": require.resolve("stream-browserify"),
      "path": require.resolve("path-browserify"),
      "https": require.resolve("https-browserify"),
      "http": require.resolve("stream-http"),
      "zlib": require.resolve("browserify-zlib"),
      "timers": require.resolve("setimmediate"),
      "fs": false
    },
    extensions: [
      '.js',
      '.jsx',
      '.css', ".tsx", ".ts"
    ],
    alias: {
      'pouchdb-promise$': "pouchdb-promise/lib/index.js",
      'styles': path.resolve(__dirname, "src/styles"),
      'components': path.resolve(__dirname, "src/components"),
      'hooks': path.resolve(__dirname, "src/hooks"),
      'views': path.resolve(__dirname, "src/views"),
      'assets': path.resolve(__dirname, "src/assets"),
      'features': path.resolve(__dirname, "src/features"),
      'store': path.resolve(__dirname, "src/store"),
      'utils': path.resolve(__dirname, "src/utils"),
      '@docstack/client': path.resolve(__dirname, "../client/src"),
      '@docstack/react': path.resolve(__dirname, "../react/src"),
      '@docstack/shared': path.resolve(__dirname, "../shared/src"),
    }
  },
};

module.exports = () => {
  if (isProduction) {
    config.mode = "production";

    config.plugins.push(new MiniCssExtractPlugin());

    config.plugins.push(new WorkboxWebpackPlugin.GenerateSW());
  } else {
    config.mode = "development";
  }
  return config;
};
