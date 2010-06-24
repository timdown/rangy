var rangy = (function() {
    var getSelection, getSelectionInfo, insertRangeBoundaryMarker, setRangeBoundary, removeMarkerElement;
    var createRange, selectRange, createSelectionInfo, testSelection, testRange, testNode;

    var win = window, doc = document;

    var api = {

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

    // Test for the Range/TextRange and Selection features required
    // Test for ability to retrieve selection
    if (isHostMethod(win, "getSelection")) {
        getSelection = function() { return win.getSelection(); };
    } else if (isHostObject(doc, "selection")) {
        getSelection = function() { return doc.selection; };
    }

    if (getSelection) {
        api.getSelection = getSelection;

        // Test creation of ranges
        if ( isHostMethod(doc, "createRange") ) {
            createRange = function() { return doc.createRange(); };
        } else if ( isHostMethod(doc.body, "createTextRange") ) {
            createRange = function() { return doc.body.createTextRange(); };
        }

        if (createRange) {
            api.createRange = createRange;

            // Test for ability to create a range from a selection
            createSelectionInfo = function(range, isDomRange) {
                return {
                    range: range,
                    isDomRange: isDomRange
                };
            };

            testSelection = getSelection();
            testRange = createRange();

            if ( isHostMethod(testSelection, "getRangeAt") ) {
                getSelectionInfo = function(selection) {
                    var range = (selection.rangeCount === 0) ? null : selection.getRangeAt(0);
                    return createSelectionInfo(range, true);
                };
            } else if ( isHostMethod(testSelection, "createRange") ) {
                getSelectionInfo = function(selection) {
                    var textRange = selection.createRange();
                    return createSelectionInfo(textRange, false);
                };
            } else if ( areHostObjects(testSelection,
                    ["anchorNode", "focusNode", "anchorOffset", "focusOffset", "isCollapsed"])
                    && createRange && isHostObject(createRange(), "collapsed") ) {

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

            if (getSelectionInfo) {
                api.getSelectionInfo = getSelectionInfo;
            }

            // Test selection of ranges
            if ( areHostMethods(testSelection, ["removeAllRanges", "addRange"]) ) {
                selectRange = function(selection, range) {
                    selection.removeAllRanges();
                    selection.addRange(range);
                };
            } else if ( isHostMethod(testSelection, ["empty"]) && isHostMethod(testRange, ["select"]) ) {
                selectRange = function(selection, range) {
                    selection.empty();
                    range.select();
                };
            }

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
        }
    }

    return api;
})();