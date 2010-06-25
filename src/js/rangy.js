var rangy = (function() {
    var log = log4javascript.getLogger("rangy");

    var getSelection, getSelectionInfo, insertRangeBoundaryMarker, setRangeBoundary, removeMarkerElement;
    var createRange, selectRange, createSelectionInfo, testSelection, testRange, testNode;

    var selectionsHaveAnchorAndFocus;

    var win = window, doc = document;

    var api = {
        initialized: false
    };


    /*----------------------------------------------------------------------------------------------------------------*/

    // Pair of functions taken from Peter Michaux's article:
    // http://peter.michaux.ca/articles/feature-detection-state-of-the-art-browser-scripting
    function isHostMethod(object, property) {
        var t = typeof object[property];
        return t === "function" || (!!(t === "object" && object[property])) || t === "unknown";
    }

    function isHostObject(object, property) {
        return !!(typeof(object[property]) === "object" && object[property]);
    }

    // Next pair of functions are a convenience to save verbose repeated calls to previous two functions
    function areHostMethods(object, properties) {
        for (var i = properties.length; i--; ) {
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

    /*----------------------------------------------------------------------------------------------------------------*/

    function WrappedSelection(sel) {
        this.nativeSelection = sel;
    }

    WrappedSelection.prototype = {
    };

    /*----------------------------------------------------------------------------------------------------------------*/

    function WrappedRange(range, isTextRange) {
        this.nativeRange = range;
        this.isTextRange = isTextRange;
    }

    WrappedRange.prototype = {
    };

    /*----------------------------------------------------------------------------------------------------------------*/

    function fail(reason) {
        alert("Rangy not supported in your browser. Reason: " + reason);
    }

    // Initialization
    function init() {
        var selectionPrototype = WrappedSelection.prototype, rangePrototype = WrappedRange.prototype;

        // Test for the Range/TextRange and Selection features required
        // Test for ability to retrieve selection
        if (isHostMethod(win, "getSelection")) {
            getSelection = function() { return new WrappedSelection(win.getSelection()); };
        } else if (isHostObject(doc, "selection")) {
            getSelection = function() { return new WrappedSelection(doc.selection); };
        }

        if (!getSelection) {
            fail("No means of obtaining selection was found");
            return false;
        }

        api.getSelection = getSelection;

        // Test creation of ranges
        if (isHostMethod(doc, "createRange")) {
            createRange = function() { return new WrappedRange(doc.createRange(), false); };
        } else if ( isHostMethod(doc.body, "createTextRange") ) {
            createRange = function() { return new WrappedRange(doc.body.createTextRange(), true); };
        }

        if (!createRange) {
            fail("No means of obtaining a Range or TextRange from the user's selection was found");
            return false;
        }

        api.createRange = createRange;

        testSelection = getSelection();
        testRange = createRange();


        // Test selection of ranges
        if (areHostMethods(testSelection, ["removeAllRanges", "addRange"])) {
            selectionPrototype.empty = function(range) {
                this.nativeSelection.removeAllRanges();
            };

            selectionPrototype.selectSingleRange = function(range) {
                this.nativeSelection.removeAllRanges();
                this.nativeSelection.addRange(range);
            };
        } else if ( isHostMethod(testSelection, ["empty"]) && isHostMethod(testRange, ["select"]) ) {
            selectionPrototype.empty = function(range) {
                this.nativeSelection.empty();
            };

            selectionPrototype.selectSingleRange = function(range) {
                this.nativeSelection.empty();
                range.select();
            };
        }

        if (!selectRange) {
            fail("selectRange");
            return false;
        }
        api.selectRange = selectRange;

        selectionsHaveAnchorAndFocus = areHostObjects(testSelection, [
            "anchorNode", "focusNode", "anchorOffset", "focusOffset"
        ]);

        if (selectionsHaveAnchorAndFocus) {
            selectionPrototype.isBackwards = function() {

            };

        } else {
            selectionPrototype.isBackwards = function() {
                return false;
            };
        }


        if (isHostMethod(testSelection, "getRangeAt") && typeof testSelection.rangeCount == "number") {
            selectionPrototype.getRangeAt = function(index) {
                return (this.nativeSelection.rangeCount == 0) ? null : this.nativeSelection.getRangeAt(index);
            };
        } else if (isHostMethod(testSelection, "createRange")) {
            selectionPrototype.getRangeAt = function(index) {
                if (index == 0) {
                    return this.nativeSelection.createRange();
                } else {
                    throw new Error("Range index out of bounds (range count: 1)");
                }
            };
        } else if (selectionsHaveAnchorAndFocus && isHostObject(testRange, "collapsed")) {
            selectionPrototype.getRangeAt = function(index) {
                if (index == 0) {
                    return this.nativeSelection.createRange();
                } else {
                    throw new Error("Range index out of bounds (range count: 1)");
                }
            };

            // Old WebKit
            getSelectionInfo = function(selection) {
                var range = doc.createRange();
                range.setStart(selection.anchorNode, selection.anchorOffset);
                range.setEnd(selection.focusNode, selection.focusOffset);

                // Handle the case when the selection was selected backwards (from the end to the start in the
                // document)
                if (range.collapsed !== selection.isCollapsed) {
                    range.setStart(selection.focusNode, selection.focusOffset);
                    range.setEnd(selection.anchorNode, selection.anchorOffset);
                }

                return createSelectionInfo(range, true);
            };
        }

        if (!getSelectionInfo) {
            fail("Selection info");
        }

        api.getSelectionInfo = getSelectionInfo;


        if (selectRange) {
            api.selectRange = selectRange;

            // Create the save and restore API

            // Test document for DOM methods
            if ( areHostMethods(doc, ["getElementById", "createElement", "createTextNode"]) ) {
                testNode = doc.createElement("span");

                // Test DOM node for required methods
                if ( areHostMethods(testNode, ["appendChild", "removeChild"]) ) {

                    // Test Range/TextRange has required methods
                    if ( areHostMethods(testRange, ["collapse", "insertNode", "setStartAfter", "setEndBefore", "cloneRange", "detach"])
                            || areHostMethods(testRange, ["collapse", "pasteHTML", "setEndPoint", "moveToElementText", "duplicate"]) ) {

                        insertRangeBoundaryMarker = function(selectionInfo, atStart) {
                            var markerId = "selectionBoundary_" + new Date().getTime() + "_" + Math.random().toString().substr(2);
                            var range, markerEl;

                            if (selectionInfo.isDomRange) {
                                // Clone the Range and collapse to the appropriate boundary point
                                range = selectionInfo.range.cloneRange();
                                range.collapse(atStart);

                                // Create the marker element containing a single invisible character using DOM methods and insert it
                                markerEl = doc.createElement("span");
                                markerEl.id = markerId;
                                markerEl.appendChild( doc.createTextNode(markerTextChar) );
                                range.insertNode(markerEl);

                                // Make sure the current range boundary is preserved
                                selectionInfo.range[atStart ? "setStartAfter" : "setEndBefore"](markerEl);

                                range.detach();
                            } else {
                                // Clone the TextRange and collapse to the appropriate boundary point
                                range = selectionInfo.range.duplicate();
                                range.collapse(atStart);

                                // Create the marker element containing a single invisible character by creating literal HTML and insert it
                                range.pasteHTML('<span id="' + markerId + '">' + markerTextCharEntity + '</span>');
                                markerEl = doc.getElementById(markerId);

                                // Make sure the current range boundary is preserved
                                range.moveToElementText(markerEl);
                                selectionInfo.range.setEndPoint(atStart ? "StartToEnd" : "EndToStart", range);
                            }

                            return markerId;
                        };

                        setRangeBoundary = function(range, markerId, isDomRange, atStart) {
                            var markerEl = doc.getElementById(markerId);
                            var tempRange;

                            if (isDomRange) {
                                range[atStart ? "setStartAfter" : "setEndBefore"](markerEl);
                            } else {
                                tempRange = range.duplicate();
                                tempRange.moveToElementText(markerEl);
                                range.setEndPoint(atStart ? "StartToEnd" : "EndToStart", tempRange);
                            }

                            // Remove the marker element
                            markerEl.parentNode.removeChild(markerEl);
                        };

                        api.removeMarkerElement = function(markerId) {
                            var markerEl = doc.getElementById(markerId);
                            markerEl.parentNode.removeChild(markerEl);
                        };

                        api.saveSelection = function() {
                            var selectionInfo = getSelectionInfo( getSelection() );
                            var savedSelection = {
                                startMarkerId: insertRangeBoundaryMarker(selectionInfo, true),
                                endMarkerId: insertRangeBoundaryMarker(selectionInfo, false),
                                isDomRange: selectionInfo.isDomRange
                            };

                            // Ensure current selection is unaffected
                            selectRange( getSelection(), selectionInfo.range );

                            return savedSelection;
                        };

                        api.restoreSelection = function(savedSelection) {
                            var range = createRange();
                            setRangeBoundary(range, savedSelection.startMarkerId, savedSelection.isDomRange, true);
                            setRangeBoundary(range, savedSelection.endMarkerId, savedSelection.isDomRange, false);

                            // Select the range
                            selectRange( getSelection(), range );
                        };

                        api.removeMarkers = function(savedSelection) {
                            removeMarkerElement(savedSelection.startMarkerId);
                            removeMarkerElement(savedSelection.endMarkerId);
                        };

                        api.saveRestoreSupported = true;
                    }
                }
            }
        }
        api.initialized = true;
    }

    // Allow external scripts to initialize this library in case it's loaded after the document has loaded
    api.init = init;

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
            if (oldOnload) {
                oldOnload.call(win, evt);
            }
            loadHandler();
        };
    }

    return api;
})();