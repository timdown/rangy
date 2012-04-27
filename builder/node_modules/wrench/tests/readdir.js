var testCase = require('nodeunit').testCase;
var fs = require('fs');
var wrench = require('../lib/wrench');
var path = require('path');
var _und = require("underscore");


function checkResult(test, files) {
    var check = [
            'bar.txt',
            'foo',
            'foo/bar',
            'foo/dolor.md',
            'foo/lorem.txt',
            'foo/bar/ipsum.js'
        ];

    test.equals(files.length, check.length, 'number of paths is correct');

    _und.each(check, function(it) {
        test.ok(_und.include(files, it), 'path ' + it + ' should be returned');
    });

    test.done();
}

module.exports = testCase({
    test_readdirSyncRecursive: function(test) {
        var dir = __dirname + '/readdir';

        test.ok(path.existsSync(dir), 'Folders should exist');

        var files = wrench.readdirSyncRecursive(dir);

        checkResult(test, files);
    },

    test_readdirRecursive: function(test) {
        var dir = __dirname + '/readdir';

        test.ok(path.existsSync(dir), 'Folders should exist');

        var allFiles = [];

        wrench.readdirRecursive(dir, function(e, files) {
            if (e) throw e;

            if (files) {
                allFiles = allFiles.concat(files);
            } else {
                checkResult(test, allFiles);
            }
        });
    }
});

// vim: et ts=4 sw=4
