var path = require('path');
var webpack = require('webpack');

module.exports = {
    entry: {
        BCIDevice: './ts_src/BCIDevice.ts',
    },
    resolve: {
        extensions: [".webpack.js", ".web.js", ".js", ".ts"]
    },
    output: {
        publicPath: '/packed/',
        path: path.join(__dirname, '/public/js'),
        filename: '[name].build.js',
        libraryTarget: 'var',
        library: 'Bluetooth'
    },
    module: {
        loaders: [
            {
                test: /\.ts$/,
                loader: 'ts-loader'
            }
        ]
    }
};