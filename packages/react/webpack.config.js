const path = require('path');

const config = {
    entry: './src/index.ts',
    experiments: {
        outputModule: true,
    },
    output: {
        path: path.resolve(__dirname, 'lib'),
        filename: 'index.js',
        globalObject: 'this',
        library: {
            type: 'module',
        },
    },
    externals: {
        react: 'react',
        reactDOM: 'react-dom',
        '@docstack/client': '@docstack/client',
    },
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.(ts|tsx)$/i,
                loader: 'ts-loader',
                exclude: ['/node_modules/'],
                options: {
                    projectReferences: true,
                }
            },
        ]
    },
    resolve: {
        extensions: [
            '.js',
            '.jsx',
            '.tsx',
            '.ts',
        ],
        alias: {
            'styles': path.resolve(__dirname, 'src/styles'),
            'components': path.resolve(__dirname, 'src/components'),
            'hooks': path.resolve(__dirname, 'src/hooks'),
            'utils': path.resolve(__dirname, 'src/utils'),
            // '@docstack/client': path.resolve(__dirname, "../client/src"),
            // '@docstack/react': path.resolve(__dirname, "../react/src"),
            // '@docstack/shared': path.resolve(__dirname, "../shared/src"),
        },
        fallback: {
            "os": require.resolve("os-browserify/browser"),
            "path": require.resolve("path-browserify"),
            "zlib": require.resolve("browserify-zlib"),
            "stream": require.resolve("stream-browserify"),
            "http": require.resolve("stream-http"),
            "https": require.resolve("https-browserify"),
            "fs": false
        }
    },
};

module.exports = () => {
    return config;
}