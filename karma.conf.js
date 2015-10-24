module.exports = function(config) {
    config.set({
        frameworks: [ 'mocha', 'chai' ],
        files: [ 'test/*-test.js' ],
        reporters: [ 'progress' ],

        colors: true,
        //logLevel: 'LOG_INFO',
        autoWatch: true,
        browsers: [ 'Chrome' ],
        reportSlowerThan: 500,

        plugins: [
           'karma-mocha',
           'karma-chai',
           'karma-chrome-launcher'
        ]
    });
};


