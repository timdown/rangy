var fs = require("fs");
var path = require("path");
var util = require("util");
var exec = require("child_process").exec;
var uglifyJs = require("uglify-js");
var rimraf = require("rimraf");
var jshint = require("jshint");
var archiver = require("archiver");

var FILE_ENCODING = "utf-8";

var buildSpec = {
    baseVersion: "1.3alpha",
    gitUrl: "https://github.com/timdown/rangy.git",
    gitBranch: "master"
};

var buildDir = "build/";

var gitDir = buildDir + "repository/", srcDir = gitDir + "src/js/";
var zipDir;
var uncompressedBuildDir;
var coreFilename = "rangy-core.js";
var modules = [
    "rangy-classapplier.js",
    "rangy-serializer.js",
    "rangy-selectionsaverestore.js",
    "rangy-textrange.js",
    "rangy-highlighter.js"/*,
    "rangy-util.js"*/
];

var allScripts = [coreFilename].concat(modules);

var buildVersion;

function concat(fileList, destPath) {
    var out = fileList.map(function(filePath) {
        return fs.readFileSync(filePath, FILE_ENCODING);
    });
    fs.writeFileSync(destPath, out.join("\n"), FILE_ENCODING);
}

function copyFileSync(srcFile, destFile) {
    var BUF_LENGTH, buff, bytesRead, fdr, fdw, pos;
    BUF_LENGTH = 64 * 1024;
    buff = new Buffer(BUF_LENGTH);
    fdr = fs.openSync(srcFile, "r");
    fdw = fs.openSync(destFile, "w");
    bytesRead = 1;
    pos = 0;
    while (bytesRead > 0) {
        bytesRead = fs.readSync(fdr, buff, 0, BUF_LENGTH, pos);
        fs.writeSync(fdw, buff, 0, bytesRead);
        pos += bytesRead;
    }
    fs.closeSync(fdr);
    return fs.closeSync(fdw);
}

function deleteBuildDir() {
    // Delete the old build directory
    if (fs.existsSync(buildDir)) {
        var rimraf = require("rimraf");
        rimraf(buildDir, function() {
            console.log("Deleted old build directory");
            callback();
        });
    } else {
        console.log("No existing build directory");
        callback();
    }
}

function createBuildDir() {
    fs.mkdirSync(buildDir);
    fs.mkdirSync(gitDir);
    console.log("Created build directory " + path.resolve(buildDir));
    callback();
}

function cloneGitRepository() {
    var cloneCmd = "git clone " + buildSpec.gitUrl + " " + gitDir;
    console.log("Cloning Git repository: " + cloneCmd);
    exec(cloneCmd, function(error, stdout, stderr) {
        console.log("Cloned Git repository");
        callback();
    });
}

function getVersion() {
    console.log("Getting version from Git repo");
    exec("git describe", function(error, stdout, stderr) {
        console.log(error, stdout, stderr);
        var result = /^.*-([\d]+)-.*$/.exec( stdout.trim() );
        var commitNumber = parseInt(result[1]);
        var now = new Date();
        buildVersion = buildSpec.baseVersion + "." + [now.getFullYear(), ("" + (101 + now.getMonth())).slice(1), ("" + (100 + now.getDate())).slice(1)].join("");
        zipDir = buildDir + "rangy-" + buildVersion + "/";
        fs.mkdirSync(zipDir);
        uncompressedBuildDir = zipDir + "uncompressed/";
        fs.mkdirSync(uncompressedBuildDir);
        console.log("Got git version " + stdout);
        callback();
    });
}

function indent(str) {
    return str.split(/\r?\n/g).join("\n    ").replace(/\n    \n/g, "\n\n");
}

function assembleCoreScript() {
    // Read in the list of files to build
    var fileNames = ["core.js", "dom.js", "domrange.js", "wrappedrange.js", "wrappedselection.js"];
    var files = {};
    fileNames.forEach(function(fileName) {
        files[fileName] = fs.readFileSync(srcDir + "core/" + fileName, FILE_ENCODING);
    });

    // Substitute scripts for build directives
    var combinedScript = files["core.js"].replace(/\/\*\s?build:includeCoreModule\((.*?)\)\s?\*\//g, function(match, scriptName) {
        return indent(files[scriptName]);
    });

    fs.writeFileSync(uncompressedBuildDir + coreFilename, combinedScript, FILE_ENCODING);
    
    console.log("Assembled core script");
    callback();
}

function copyModuleScripts() {
    modules.forEach(function(moduleFile) {
        var moduleCode = fs.readFileSync(srcDir + "modules/" + moduleFile, FILE_ENCODING);

        // Run build directives
        moduleCode = moduleCode.replace(/\/\*\s?build:modularizeWithDependencies\((.*?)\)\s?\*\/([\s\S]*?)\/\*\s?build:modularizeEnd\s?\*\//gm, function(match, dependencies, code) {
            var dependenciesArray = eval(dependencies);
            return [
                '(function(factory, global) {',
                '    if (typeof define == "function" && define.amd) {',
                '        // AMD. Register as an anonymous module with a dependency on Rangy.',
                '        define(' + dependencies + ', factory);',
                '        /*',
                '         } else if (typeof exports == "object") {',
                '         // Node/CommonJS style for Browserify',
                '         module.exports = factory;',
                '         */',
                '    } else {',
                '        // No AMD or CommonJS support so we use the rangy global variable',
                '        factory(global.rangy);',
                '    }',
                '})(function(' + dependenciesArray.join(", ") + ') {'
            ].join("\n") + indent(code) + "\n}, this);";
        });

        fs.writeFileSync(uncompressedBuildDir + moduleFile, moduleCode, FILE_ENCODING);
    });
    console.log("Copied module scripts");
    callback();
}

function clean() {
    rimraf(gitDir, function() {
        console.log("Deleted Git directory");
        callback();
    });
}

function removeLoggingFromScripts() {
    var logCallRegex = /^\s*(\/\/\s*)?log\.(trace|debug|info|warn|error|fatal|time|timeEnd|group|groupEnd)/;
    var loggerRegex = /^\s*var\s+log\s*=/;

    function removeLogging(file) {
        var contents = fs.readFileSync(file, FILE_ENCODING);
        var lines = contents.split("\n");
        var logLineCount = 0;
        var nonLoggingLines = contents.split("\n").filter(function(line) {
            if (logCallRegex.test(line) || loggerRegex.test(line)) {
                logLineCount++;
                return false;
            }
            return true;
        });
        console.log("Removed %d logging lines from %s", logLineCount, file);
        fs.writeFileSync(file, nonLoggingLines.join("\n"), FILE_ENCODING);
    }

    allScripts.forEach(function(fileName) {
        removeLogging(uncompressedBuildDir + fileName);
    });

    console.log("Removed logging from scripts");
    callback();
}

function substituteBuildVars() {
    // Substitute build vars in scripts
    function doSubstituteBuildVars(file, buildVars) {
        var contents = fs.readFileSync(file, FILE_ENCODING);
        contents = contents.replace(/%%build:([^%]+)%%/g, function(matched, buildVarName) {
            return buildVars[buildVarName];
        });
        
        // Now do replacements specified by build directives
        contents = contents.replace(/\/\*\s?build:replaceWith\((.*?)\)\s?\*\/.*?\*\s?build:replaceEnd\s?\*\//g, "$1");
        
        fs.writeFileSync(file, contents, FILE_ENCODING);
    }

    var date = new Date();
    var month = "January,February,March,April,May,June,July,August,September,October,November,December".split(",")[date.getMonth()];

    var buildVars = {
        version: buildVersion,
        date: date.getDate() + " " + month + " " + date.getFullYear(),
        year: date.getFullYear()
    };

    allScripts.forEach(function(fileName) {
        doSubstituteBuildVars(uncompressedBuildDir + fileName, buildVars);
    });

    console.log("Substituted build vars in scripts");
    callback();
}

function lint() {
    // Run JSHint only on non-library code
    function doLint(file) {
        var buf = fs.readFileSync(file, FILE_ENCODING);
        // Remove Byte Order Mark
        buf = buf.replace(/^\uFEFF/g, "");

        jshint.JSHINT(buf, {
            boss: true,
            loopfunc: true,
            scripturl: true,
            eqeqeq: false,
            browser: true,
            plusplus: false,
            '-W041': true,
            '-W018': true
        });

        var errors = jshint.JSHINT.errors;
        if (errors && errors.length) {
            console.log("Found " + errors.length + " JSHint errors");
            errors.forEach(function(error) {
                if (error) {
                    console.log("%s at %d on line %d: %s\n%s", error.id, error.character, error.line, error.reason, error.evidence);
                }
            });
        }
    }

    allScripts.forEach(function(fileName) {
        doLint(uncompressedBuildDir + fileName);
    });

    console.log("JSHint done");
    callback();
}

function minify() {
    var error = false;

    function getLicence(srcFile) {
        var contents = fs.readFileSync(srcFile, FILE_ENCODING);
        var result = /^\s*\/\*\*[\s\S]*?\*\//.exec(contents);
        return result ? result[0] : "";
    }

    // Uglify
    function uglify(src, dest) {
        var licence = getLicence(src);

        try {
            var final_code = uglifyJs.minify(src, {
                ascii_only: true
            });

            fs.writeFileSync(dest, licence + "\r\n" + final_code.code, FILE_ENCODING);
        } catch (ex) {
            console.log(ex, ex.stack);
            error = true;
        }
    }

    allScripts.forEach(function(fileName) {
        uglify(uncompressedBuildDir + fileName, zipDir + fileName);
    });

    if (error) {
        console.log("Uglify failed");
    } else {
        console.log("Minified scripts");
        callback();
    }
}

function createArchiver(fileExtension, archiveCreatorFunc) {
    return function() {
        var compressedFileName = "rangy-" + buildVersion + "." + fileExtension;

        var output = fs.createWriteStream(buildDir + compressedFileName);
        var archive = archiveCreatorFunc();

        output.on("close", function () {
            console.log("Compressed " + archive.pointer() + " total bytes to " + compressedFileName);
            callback();
        });

        archive.on("error", function(err){
            throw err;
        });

        archive.pipe(output);
        archive.bulk([
            {
                expand: true,
                cwd: buildDir,
                src: ["**", "!*.tar", "!*.gz", "!*.tgz", "!*.zip"]
            }
        ]);
        archive.finalize();
    }
}

var zip = createArchiver("zip", function() {
    return archiver.create("zip");
});

var tarGz = createArchiver("tar.gz", function() {
    return archiver.create("tar", {
        gzip: true,
        gzipOptions: {
            level: 1
        }
    });
});

/*--------------------------------------------------------------------------------------------------------------------*/

// Start the build

var actions = [
    deleteBuildDir,
    createBuildDir,
    cloneGitRepository,
    getVersion,
    assembleCoreScript,
    copyModuleScripts,
    clean,
    removeLoggingFromScripts,
    substituteBuildVars,
    lint,
    minify,
    zip,
    tarGz
];


function callback() {
    if (actions.length) {
        actions.shift()();
    } else {
        console.log("Done");
    }
}

console.log("Starting build...");
callback();
