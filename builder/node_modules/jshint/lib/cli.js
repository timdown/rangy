var fs = require('fs'),
    path = require('path'),
    argsparser = require('argsparser'),
    hint = require('./hint');

var rootPath = path.resolve("/");

function existsSync() {
    var obj = fs.existsSync ? fs : path;
    return obj.existsSync.apply(obj, arguments);
}

function _help() {
    process.stdout.write(fs.readFileSync(__dirname + "/../HELP", "utf-8"));
}

function _version() {
    process.stdout.write(JSON.parse(fs.readFileSync(__dirname + "/../package.json", "utf-8")).version + "\n");
}

function _removeJsComments(str) {
    str = str || '';
    str = str.replace(/\/\*[\s\S]*(?:\*\/)/g, ''); //everything between "/* */"
    str = str.replace(/\/\/[^\n\r]*/g, ''); //everything after "//"
    return str;
}

function _loadAndParseConfig(filePath) {
    return filePath && existsSync(filePath) ?
            JSON.parse(_removeJsComments(fs.readFileSync(filePath, "utf-8"))) : {};
}

/**
 * This function searches for a file with a specified name, it starts
 * with the dir passed, and traverses up the filesystem until it either
 * finds the file, or hits the root
 *
 * @param {String} name  Filename to search for (.jshintrc, .jshintignore)
 * @param {String} dir   Defaults to process.cwd()
 */
function _searchFile(name, dir) {
    dir = dir || process.cwd();

    var filename = path.normalize(path.join(dir, name));

    if (existsSync(filename)) {
        return filename;
    }

    return dir === rootPath ?
        null : _searchFile(name, path.normalize(path.join(dir, "..")));
}

function _findConfig(target) {
    var name = ".jshintrc",
        projectConfig = _searchFile(name),
        homeConfig = path.normalize(path.join(process.env.HOME, name));

    if (projectConfig) {
        return projectConfig;
    }

    // if no project config, check $HOME
    if (existsSync(homeConfig)) {
        return homeConfig;
    }

    return false;
}

function _print(results) {
    function exit() {
        process.exit(results.length > 0 ? 1 : 0);
    }

    // avoid stdout cutoff in node 0.4.x, also supports 0.5.x
    // see https://github.com/joyent/node/issues/1669
    try {
        if (!process.stdout.flush()) {
            process.stdout.once("drain", exit);
        } else {
            exit();
        }
    } catch (e) {
        exit();
    }
}

module.exports = {
    interpret: function (args) {
        var config, reporter,
            options = argsparser.parse(args),
            customConfig = options["--config"],
            customReporter = options["--reporter"] ? path.resolve(process.cwd(), options["--reporter"]) : null,
            targets = options.node,
            ignoreFile, ignores;

        //could be on Windows which we are looking for an attribute ending in 'node.exe'
        if (targets === undefined) {
            (function () {
                var arg;

                for (arg in options) {
                    if (path.basename(arg) === 'node.exe') {
                        targets = options[arg];
                        break;
                    }
                }
            }());
        }

        targets = typeof targets === "string" ? null : targets.slice(1);

        if (options["--version"]) {
            _version();
            return;
        }

        if (!targets || options["--help"]) {
            _help();
            return;
        }

        if (options["--jslint-reporter"]) {
            customReporter = "./reporters/jslint_xml.js";
        }

        if (options["--show-non-errors"]) {
            customReporter = "./reporters/non_error.js";
        }

        config = _loadAndParseConfig(customConfig ? customConfig : _findConfig());

        if (customReporter) {
            try {
                reporter = require(customReporter).reporter;
            } catch (r) {
                process.stdout.write("Error opening reporter file: " + customReporter);
                process.stdout.write(r + "\n");
                process.exit(1);
            }
        }

        ignoreFile = _searchFile(".jshintignore");

        if (ignoreFile) {
            ignores = fs.readFileSync(ignoreFile, "utf8").split("\n")
                .filter(function (line) {
                    return !!line.trim();
                })
                .map(function (line) {
                    return path.resolve(path.dirname(ignoreFile), line.trim());
                });
        }

        _print(hint.hint(targets, config, reporter, ignores));
    }
};
