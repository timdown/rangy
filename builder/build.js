var http = require("http");
var fs = require("fs");
var wrench = require("wrench");
var path = require("path");
var util = require("util");
var exec = require("child_process").exec;

var FILE_ENCODING = "utf-8";

var buildSpec = {
    baseVersion: "1.3alpha",
    svnUrl: "http://rangy.googlecode.com/svn/trunk/src/js/"
};

var buildDir = "build/";

var svnDir = buildDir + "checkout/", srcDir = svnDir + "js/";
var zipDir;
var uncompressedBuildDir;
var coreFilename = "rangy-core.js";
var modules = [
    "rangy-cssclassapplier.js",
    "rangy-serializer.js",
    "rangy-selectionsaverestore.js",
    "rangy-textrange.js",
    "rangy-util.js"
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
    if (path.existsSync(buildDir)) {
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
    fs.mkdirSync(svnDir);
    console.log("Created build directory " + path.resolve(buildDir));
    callback();
}

function checkoutSvnRepository() {
    exec("svn checkout " + buildSpec.svnUrl, { cwd: svnDir }, function(error, stdout, stderr) {
        console.log("Checked out SVN repository ", stdout, stderr);
        callback();
    });
}

function getVersion() {
    exec("svnversion", function(error, stdout, stderr) {
        buildVersion = buildSpec.baseVersion + "." + stdout.trim().replace(/:/g, "_");
        zipDir = buildDir + "rangy-" + buildVersion + "/";
        fs.mkdirSync(zipDir);
        uncompressedBuildDir = zipDir + "uncompressed/";
        fs.mkdirSync(uncompressedBuildDir);
        console.log("Got SVN version ", stdout, stderr);
        callback();
    });
}

function concatCoreScripts() {
    function prependJsPath(fileList) {
        return fileList.map(function(filePath) {
            return srcDir + "core/" + filePath;
        });
    }

    // Read in the list of files to build
    var files = ["core.js", "dom.js", "domrange.js", "wrappedrange.js", "wrappedselection.js"];

    // Append js directory path to scripts
    var scripts = prependJsPath(files);
    console.log("Obtained list of scripts", files);

    // Build a single concatenated JS file
    concat(scripts, uncompressedBuildDir + coreFilename);

    console.log("Concatenated core scripts");
    callback();
}

function copyModuleScripts() {
    modules.forEach(function(moduleFile) {
        copyFileSync(srcDir + "modules/" + moduleFile, uncompressedBuildDir + moduleFile);
    });
    console.log("Copied module scripts");
    callback();
}

function clean() {
    var rimraf = require("rimraf");
    rimraf(svnDir, function() {
        console.log("Deleted SVN directory");
        callback();
    });
}

function removeLoggingFromScripts() {
    var logCallRegex = /^\s*log\.(trace|debug|info|warn|error|fatal|time|timeEnd|group|groupEnd)/;
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
    function substituteBuildVars(file, buildVars) {
        var contents = fs.readFileSync(file, FILE_ENCODING);
        contents = contents.replace(/%%build:([^%]+)%%/g, function(matched, buildVarName) {
            return buildVars[buildVarName];
        });
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
        substituteBuildVars(uncompressedBuildDir + fileName, buildVars);
    });

    console.log("Substituted build vars in scripts");
    callback();
}

function lint() {
    // Run JSHint only on non-library code
    var jshint = require("jshint");

    function doLint(file) {
        var buf = fs.readFileSync(file, FILE_ENCODING);
        // Remove Byte Order Mark
        buf = buf.replace(/^\uFEFF/g, "");

        jshint.JSHINT(buf, {
            boss: true,
            loopfunc: true,
            scripturl: true
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
        var uglify = require("uglify-js");
        var jsp = uglify.parser;
        var pro = uglify.uglify;

        try {
            var ast = jsp.parse(fs.readFileSync(src, FILE_ENCODING)); // parse code and get the initial AST
            ast = pro.ast_mangle(ast); // get a new AST with mangled names
            ast = pro.ast_squeeze(ast); // get an AST with compression optimizations
            var final_code = pro.gen_code(ast, {
                ascii_only: true
            });

            fs.writeFileSync(dest, licence + "\r\n" + final_code, FILE_ENCODING);
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

function zip() {
    var zipFileName = "rangy-" + buildVersion + ".zip";
    var tarName = "rangy-" + buildVersion + ".tar";
    var tarGzName = "rangy-" + buildVersion + ".tar.gz";
    var zipExe = "..\\builder\\tools\\7za";
    var dir = "rangy-" + buildVersion + "/";

    exec(zipExe + " a -tzip " + zipFileName + " " + dir, { cwd: buildDir }, function(error, stdout, stderr) {
        console.log("Zipped", stdout, stderr);

        exec(zipExe + " a -ttar " + tarName + " " + dir, { cwd: buildDir }, function(error, stdout, stderr) {
            console.log("Tarred", stdout, stderr);
            exec(zipExe + " a -tgzip " + tarGzName + " " + tarName, { cwd: buildDir }, function(error, stdout, stderr) {
                console.log("Gzipped", stdout, stderr);
                fs.unlinkSync(buildDir + tarName);
                callback();
            });
        });
    });
}

/*--------------------------------------------------------------------------------------------------------------------*/

// Start the build

var actions = [
    deleteBuildDir,
    createBuildDir,
    checkoutSvnRepository,
    getVersion,
    concatCoreScripts,
    copyModuleScripts,
    clean,
    removeLoggingFromScripts,
    substituteBuildVars,
    lint,
    minify,
    zip
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
