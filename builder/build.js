var http = require("http");
var fs = require("fs");
var wrench = require("wrench");
var path = require("path");
var util = require("util");
var exec = require("child_process").exec;

var FILE_ENCODING = "utf-8";

var buildSpec = {
    baseVersion: "1.3",
    svnUrl: "http://rangy.googlecode.com/svn/trunk/src/js/"
};

var buildDir = "build/";

var svnDir = buildDir + "repository/", srcDir = svnDir + "js/";
var distDir = buildDir + "dist/";
var uncompressedBuildDir = buildDir + "uncompressed/";
var coreFilename = "rangy-core.js";
var modules = [
    "rangy-cssclassapplier.js",
    "rangy-serializer.js",
    "rangy-selectionsaverestore.js",
    "rangy-textrange.js"
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
    fs.mkdirSync(uncompressedBuildDir);
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
    exec("svnversion", { cwd: svnDir }, function(error, stdout, stderr) {
        buildVersion = buildSpec.baseVersion + "." + stdout.trim();
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
    console.dir(jshint);

    var buf = fs.readFileSync(concatenatedInsiteOnlySriptFileName, FILE_ENCODING);
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
        console.log("JSHint had 'errors'. Continuing");
        callback();
    } else {
        console.log("JSHint passed");
        callback();
    }
}

function getLicence(srcFile) {
    var contents = fs.readFileSync(srcFile, FILE_ENCODING);
    var result = /^\s*\/\*\*(.*?)\*/.exec(contents);
    return result ? result.replace("@license ", "") : "";
}


function minify() {
    // Uglify
    function uglify(src, dest) {
        var uglify = require("uglify-js");
        var jsp = uglify.parser;
        var pro = uglify.uglify;

        var ast = jsp.parse(fs.readFileSync(src, FILE_ENCODING)); // parse code and get the initial AST
        ast = pro.ast_mangle(ast); // get a new AST with mangled names
        ast = pro.ast_squeeze(ast); // get an AST with compression optimizations
        var final_code = pro.gen_code(ast, {
            ascii_only: true
        }); // compressed code here

        fs.writeFileSync(dest, final_code, FILE_ENCODING);
    }

    uglify(concatenatedSriptFileName, concatenatedMinScriptFileName);
    console.log("Minified script");
    callback();
}

function appendScriptHeader() {
    // Append header to script files
    var headerFileName = jsDir + "license.js";
    concat([headerFileName, concatenatedSriptFileName], concatenatedSriptFileName);
    concat([headerFileName, concatenatedMinScriptFileName], concatenatedMinScriptFileName);
    console.log("Added script license");
    callback();
}

function createDist() {
    fs.mkdirSync(distDir);
    var jsDistDir = distDir + "js/";
    fs.mkdirSync(jsDistDir);

    copyFileSync(concatenatedSriptFileName, jsDistDir + "insite.js");
    copyFileSync(concatenatedMinScriptFileName, jsDistDir + "insite.min.js");
    wrench.copyDirSyncRecursive(svnDir + "editor/js/libs", jsDistDir + "libs");

    wrench.copyDirSyncRecursive(svnDir + "editor/images", distDir + "images");
    wrench.copyDirSyncRecursive(svnDir + "editor/css", distDir + "css");
    wrench.copyDirSyncRecursive(svnDir + "editor/themes", distDir + "themes");

    console.log("Created editor dist directory");
    callback();
}

function createDemo() {
    // Create the demo directory
    var demoDir = buildDir + buildSpec.target + "/";
    fs.mkdirSync(demoDir);

    // Copy in the dist directory into the demo root
    wrench.copyDirSyncRecursive(distDir, demoDir + "insite", {
        preserve: true
    });

    // Copy server files
    wrench.copyDirSyncRecursive(svnDir + "server/", demoDir + "server",  {
        preserve: true
    });

    // Copy over demos and overrides
    wrench.copyDirSyncRecursive(svnDir + "builder/targets/" + buildSpec.target + "/files/", demoDir, {
        preserve: true
    });

    console.log("Created demo");
    callback();
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
    substituteBuildVars
    //clean,

    /*
        removeLoggingFromScripts,
        lint,
        minify,
        appendScriptHeader,
        substituteBuildVars,
        createDist,
        createDemo
    */
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
