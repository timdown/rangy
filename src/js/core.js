var rangy = (function() {
    var log = log4javascript.getLogger("rangy.core");

    var NUMBER = "number", BOOLEAN = "boolean", OBJECT = "object", FUNCTION = "function", UNDEFINED = "undefined",
            STRING = "string";

    var domRangeProperties = ["startContainer", "startOffset", "endContainer", "endOffset", "collapsed",
        "commonAncestorContainer", "START_TO_START", "START_TO_END", "END_TO_START", "END_TO_END"];

    var domRangeMethods = ["setStart", "setStartBefore", "setStartAfter", "setEnd", "setEndBefore",
        "setEndAfter", "collapse", "selectNode", "selectNodeContents", "compareBoundaryPoints", "deleteContents",
        "extractContents", "cloneContents", "insertNode", "surroundContents", "cloneRange", "toString", "detach"];

    var textRangeProperties = ["boundingHeight", "boundingLeft", "boundingTop", "boundingWidth", "htmlText", "text"];

    // Subset of TextRange's full set of methods that we're interested in
    var textRangeMethods = ["collapse", "compareEndPoints", "duplicate", "getBookmark", "moveToBookmark",
        "moveToElementText", "parentElement", "pasteHTML", "select", "setEndPoint"];

    /*----------------------------------------------------------------------------------------------------------------*/

    // Trio of functions taken from Peter Michaux's article:
    // http://peter.michaux.ca/articles/feature-detection-state-of-the-art-browser-scripting
    function isHostMethod(object, property) {
        var t = typeof object[property];
        return t == FUNCTION || (!!(t == OBJECT && object[property])) || t == "unknown";
    }

    function isHostObject(object, property) {
        return !!(typeof(object[property]) == OBJECT && object[property]);
    }

    function isHostProperty(object, property) {
        return typeof(object[property]) != UNDEFINED;
    }

    // Next trio of functions are a convenience to save verbose repeated calls to previous two functions
    function areHostMethods(object, properties) {
        var i = properties.length;
        while (i--) {
            if (!isHostMethod(object, properties[i])) {
                return false;
            }
        }
        return true;
    }

    function areHostObjects(object, properties) {
        for (var i = properties.length; i--; ) {
            if (!isHostObject(object, properties[i])) {
                return false;
            }
        }
        return true;
    }

    function areHostProperties(object, properties) {
        for (var i = properties.length; i--; ) {
            if (!isHostProperty(object, properties[i])) {
                return false;
            }
        }
        return true;
    }


    var api = {
        initialized: false,
        util: {
            isHostMethod: isHostMethod,
            isHostObject: isHostObject,
            isHostProperty: isHostProperty,
            areHostMethods: areHostMethods,
            areHostObjects: areHostObjects,
            areHostProperties: areHostProperties
        },
        fail: fail
    };

    function fail(reason) {
        alert("Rangy not supported in your browser. Reason: " + reason);
        api.initialized = true;
        api.supported = false;
    }

    // Initialization
    function init() {
        var testRange;
        var implementsDomRange = false, implementsTextRange = false;

        if (typeof document == UNDEFINED) {
            fail("No document found")
        }

        if (isHostMethod(document, "createRange")) {
            testRange = document.createRange();
            if (areHostMethods(testRange, domRangeMethods) && areHostProperties(testRange, domRangeProperties)) {
                implementsDomRange = true;
            }
            testRange.detach();
        }

        if (isHostObject(document, "body") && isHostMethod(document.body, "createTextRange")) {
            testRange = document.body.createTextRange();
            if (areHostMethods(testRange, textRangeMethods) && !areHostProperties(testRange, textRangeProperties)) {
                implementsTextRange = true;
            }
        }

        if (!implementsDomRange && !implementsTextRange) {
            fail("Neither Range nor TextRange are implemented");
        }

        api.initialized = true;
        api.feature = {
            implementsDomRange: implementsDomRange,
            implementsTextRange: implementsTextRange
        };

        // Notify listeners
        for (var i = 0, len = initListeners.length; i < len; ++i) {
            try {
                initListeners[i](api);
            } catch (ex) {
                log.error("Init listener threw an exception. Continuing.", ex);
            }
        }
    }

    // Allow external scripts to initialize this library in case it's loaded after the document has loaded
    api.init = init;

    var initListeners = [];
    api.addInitListener = function(listener) {
        initListeners.push(listener);
    };

    /*----------------------------------------------------------------------------------------------------------------*/

    // Wait for document to load before running tests

    var docReady = false;
    var oldOnload;

    var loadHandler = function(e) {
        log.info("loadHandler, event is " + e.type);
        if (!docReady) {
            docReady = true;
            if (!api.initialized) {
                init();
            }
        }
    };

    if (isHostMethod(doc, "addEventListener")) {
        doc.addEventListener("DOMContentLoaded", loadHandler, false);
    }

    // Add a fallback in case the DOMContentLoaded event isn't supported
    if (isHostMethod(win, "addEventListener")) {
        win.addEventListener("load", loadHandler, false);
    } else if (isHostMethod(win, "attachEvent")) {
        win.attachEvent("onload", loadHandler);
    } else {
        oldOnload = win.onload;
        win.onload = function(evt) {
            loadHandler(evt);
            if (oldOnload) {
                oldOnload.call(win, evt);
            }
        };
    }

    return api;
})();