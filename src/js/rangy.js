var rangy = (function() {
    var log = log4javascript.getLogger("rangy");

    var NUMBER = "number", BOOLEAN = "boolean", OBJECT = "object", FUNCTION = "function", UNDEFINED = "undefined";

    var getSelection, getSelectionInfo, insertRangeBoundaryMarker, setRangeBoundary, removeMarkerElement;
    var createRange, selectRange, createSelectionInfo, testSelection, testRange, testNode;

    var domRangeProperties = ["startContainer", "startOffset", "endContainer", "endOffset", "collapsed",
        "commonAncestorContainer", "START_TO_START", "START_TO_END", "END_TO_START", "END_TO_END"];

    var domRangeMethods = ["setStart", "setStartBefore", "setStartAfter", "setEnd", "setEndBefore",
        "setEndAfter", "collapse", "selectNode", "selectNodeContents", "compareBoundaryPoints", "deleteContents",
        "extractContents", "cloneContents", "insertNode", "surroundContents", "cloneRange", "toString", "detach"];


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
        return t === FUNCTION || (!!(t === OBJECT && object[property])) || t === "unknown";
    }

    function isHostObject(object, property) {
        return !!(typeof(object[property]) === OBJECT && object[property]);
    }

    // Next pair of functions are a convenience to save verbose repeated calls to previous two functions
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

    /*----------------------------------------------------------------------------------------------------------------*/

    // DOM utilities

    function getDocument(node) {
        if (isHostObject(node, "ownerDocument")) {
            return node.ownerDocument;
        } else if (isHostObject(node, "document")) {
            return node.document;
        } else if (node.parentNode) {
            return getDocument(node.parentNode);
        } else {
            throw new Error("getDocument: no document found for node");
        }
    }

    // Nodes being same returns true.
    function isAncestorOf(ancestor, descendant) {
        var n = descendant;
        while (n) {
            if (n === ancestor) {
                return true;
            } else {
                n = n.parentNode;
            }
        }
        return false;
    }

    var arrayContains = Array.prototype.indexOf ?
        function(arr, val) {
            return arr.indexOf(val) > -1;
        }:

        function(arr, val) {
            var i = arr.length;
            while (i--) {
                if (arr[i] === val) {
                    return true;
                }
            }
            return false;
        };

    function getCommonAncestor(node1, node2) {
        var ancestors = [], n;
        for (n = node1; n; n = n.parentNode) {
            ancestors.push(n);
        }

        for (n = node2; n; n = n.parentNode) {
            if (arrayContains(ancestors, n)) {
                return n;
            }
        }

        return null;
    }


    function getChildIndex(node) {
        var i = 0;
        while( (node = node.previousSibling) ) {
            i++;
        }
        return i;
    }

    function isDataNode(node) {
        return node && node.nodeValue !== null && node.data !== null;
    }


    /*----------------------------------------------------------------------------------------------------------------*/

    function DomPosition(node, offset) {
        this.node = node;
        this.offset = offset;
    }

    DomPosition.prototype = {
        equals: function(pos) {
            return this.node === pos.node & this.offset == pos.offset;
        }
    };

    /*----------------------------------------------------------------------------------------------------------------*/

    function WrappedSelection(sel) {
        this.nativeSelection = sel;
    }

    WrappedSelection.prototype = {
    };

    /*----------------------------------------------------------------------------------------------------------------*/

    var wrappedDomRangePrototype = (function() {
        function updateRangeProperties(range) {
            var i = domRangeProperties.length, prop;
            while (i--) {
                prop = domRangeProperties[i];
                range[prop] = range.nativeRange[prop];
            }
        }


        var rangePrototype = {
            init: function(range) {
                this.nativeRange = this;
                this.wrapsTextRange = false;
                updateRangeProperties(this);
            },

            getStartPosition: function() {
                return new DomPosition(this.startContainer, this.startOffset);
            },

            getEndPosition: function() {
                return new DomPosition(this.endContainer, this.endOffset);
            },

            setStart: function(node, offset) {
                this.nativeRange.setStart(node, offset);
                updateRangeProperties(this);
            },

            setStartBefore: function(node) {
                this.nativeRange.setStartBefore(node);
                updateRangeProperties(this);
            },

            setStartAfter: function(node) {
                this.nativeRange.setStartAfter(node);
                updateRangeProperties(this);
            },

            setEnd: function(node, offset) {
                this.nativeRange.setEnd(node, offset);
                updateRangeProperties(this);
            },

            setEndBefore: function(node) {
                this.nativeRange.setEndBefore(node);
                updateRangeProperties(this);
            },

            setEndAfter: function(node) {
                this.nativeRange.setEndAfter(node);
                updateRangeProperties(this);
            },

            collapse: function(isStart) {
                this.nativeRange.collapse(isStart);
                updateRangeProperties(this);
            },

            selectNode: function(node) {
                this.nativeRange.selectNode(node);
                updateRangeProperties(this);
            },

            selectNodeContents: function(node) {
                this.nativeRange.selectNodeContents(node);
                updateRangeProperties(this);
            },

            compareBoundaryPoints: function(type, range) {
                return this.nativeRange.compareBoundaryPoints(type, range);
            },

            deleteContents: function() {
                this.nativeRange.deleteContents();
                updateRangeProperties(this);
            },

            extractContents: function() {
                this.nativeRange.extractContents();
                updateRangeProperties(this);
            },

            cloneContents: function() {
                this.nativeRange.cloneContents();
            },

            insertNode: function(node) {
                this.nativeRange.insertNode(node);
                updateRangeProperties(this);
            },

            surroundContents: function(node) {
                this.nativeRange.surroundContents(node);
                updateRangeProperties(this);
            },

            cloneRange: function() {
                return new WrappedRange(this.nativeRange.cloneRange(), false);
            },

            toString: function() {
                return this.nativeRange.toString();
            },

            detach: function() {
                this.nativeRange.detach();
                this.detached = true;
                var i = domRangeProperties.length, prop;
                while (i--) {
                    prop = domRangeProperties[i];
                    this[prop] = null;
                }
            }
        };
    })();

    /*----------------------------------------------------------------------------------------------------------------*/

    // Gets the boundary of a TextRange expressed as a node and an offset within that node. This method is an optimized
    // version of code found in Tim Cameron Ryan's IERange (http://code.google.com/p/ierange/)
    function getTextRangeBoundaryPosition(textRange, isStart) {
        var workingRange = textRange.duplicate();
        workingRange.collapse(isStart);
        var containerElement = workingRange.parentElement();
        var workingNode = getDocument(containerElement).createElement("span");
        var comparison, workingComparisonType = isStart ? "StartToStart" : "StartToEnd";
        var boundaryPosition, boundaryNode;

        // Move the working range through the container's children, starting at
        // the end and working backwards, until the working range reaches or goes
        // past the boundary we're interested in
        do {
            containerElement.insertBefore(workingNode, workingNode.previousSibling);
            workingRange.moveToElementText(workingNode);
        } while ( (comparison = workingRange.compareEndPoints(workingComparisonType, textRange)) > 0
                && workingNode.previousSibling);

        // We've now reached or gone past the boundary of the text range we're interested in
        // so have identified the node we want
        boundaryNode = workingNode.nextSibling;
        if (comparison == -1 && boundaryNode) {
            // This must be a data node (text, comment, cdata) since we've overshot. The working
            // range is collapsed at the start of the node containing the text range's boundary,
            // so we move the end of the working range to the boundary point and measure the
            // length of its text to get the boundary's offset within the node
            workingRange.setEndPoint(isStart ? "EndToStart" : "EndToEnd", textRange);
            boundaryPosition = new DomPosition(boundaryNode, workingRange.text.length);
        } else {
            // We've hit the boundary exactly, so this must be an element
            boundaryPosition = new DomPosition(containerElement, getChildIndex(workingNode));
        }

        // Clean up
        workingNode.parentNode.removeChild(workingNode);

        return boundaryPosition;
    }

    // Returns a TextRange representing the boundary of a TextRange expressed as a node and an offset within that node.
    // This method is an optimized version of code found in Tim Cameron Ryan's IERange
    // (http://code.google.com/p/ierange/)
    function createBoundaryTextRange(boundaryPosition, isStart) {
        var boundaryNode, boundaryParent;
        var nodeIsDataNode = isDataNode(boundaryPosition.node);

        if (nodeIsDataNode) {
            boundaryNode = boundaryPosition.node;
            boundaryParent = boundaryNode.parentNode;
        } else {
            boundaryNode = boundaryPosition.node.childNodes[boundaryPosition.offset];
            boundaryParent = boundaryPosition.node;
        }

        // Position the range immediately before the node containing the boundary
        var doc = getDocument(boundaryPosition.node);
        var workingNode = doc.createElement("span");
        boundaryParent.insertBefore(workingNode, boundaryNode);

        var workingRange = doc.body.createTextRange();
        workingRange.moveToElementText(workingNode);

        // Clean up
        boundaryParent.removeChild(workingNode);

        // Move the working range to the text offset, if required
        if (nodeIsDataNode) {
            workingRange[isStart ? "moveStart" : "moveEnd"]("character", boundaryPosition.offset);
        }

        return workingRange;
    }


    var wrappedTextRangePrototype = (function() {
/*
        function createCollapser(isStart) {
            return function(range) {
                return range.nativeRange.collapse(isStart);
            };
        }

        var collapseToStart = createCollapser(true), collapseToEnd = createCollapser(false);
*/

        function updateCollapsed(range) {
            return range.startContainer === range.endContainer && range.startOffset === range.endOffset;
        }

        function updateCommonAncestorContainer(range) {
            var start = range.startContainer, end = range.endContainer;
            range.commonAncestorContainer = (start === end) ? start : getCommonAncestor(start, end);
        }

        function createBoundaryUpdater(isStart) {
            var prefix = isStart ? "start" : "end";
            return function(range, node, offset) {
                var containerProperty = prefix + "Container";
                var nodeChanged = (node === range[containerProperty]);
                range[containerProperty] = node;
                range[prefix + "Offset"] = offset;
                if (nodeChanged) {
                    updateCommonAncestorContainer(range);
                }
            }
        }

        var changeStart = createBoundaryUpdater(true), changeEnd = createBoundaryUpdater(false);

        return {
            init: function(textRange) {
                log.time("IERange creation");
                this.nativeRange = textRange;
                this.wrapsTextRange = true;

                var startPos = getTextRangeBoundaryPosition(textRange, true);
                var endPos = getTextRangeBoundaryPosition(textRange, false);

                this.startContainer = startPos.node;
                this.startOffset = startPos.offset;
                this.endContainer = endPos.node;
                this.endOffset = endPos.offset;

                updateCommonAncestorContainer(this);
                updateCollapsed(this);
                log.timeEnd("IERange creation");
            },

            getStartPosition: function() {
                return new DomPosition(this.startContainer, this.startOffset);
            },

            getEndPosition: function() {
                return new DomPosition(this.endContainer, this.endOffset);
            },

            toString: function() {
                
            }
        }

    })();


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

    function initSelections(testSelection, testRange) {
        var selectionPrototype = WrappedSelection.prototype;

        // Test selection of ranges
        if (areHostMethods(testSelection, ["removeAllRanges", "addRange"])) {
            selectionPrototype.empty = function() {
                this.nativeSelection.removeAllRanges();
            };

            selectionPrototype.selectSingleRange = function(range) {
                this.nativeSelection.removeAllRanges();
                this.nativeSelection.addRange(range);
            };
        } else if (isHostMethod(testSelection, "empty") && isHostMethod(testRange, "select")) {
            selectionPrototype.empty = function() {
                this.nativeSelection.empty();
            };

            selectionPrototype.selectSingleRange = function(range) {
                this.nativeSelection.empty();
                range.select();
            };
        } else {
            fail("No means of selecting a Range or TextRange was found");
            return false;
        }

        selectionsHaveAnchorAndFocus = areHostObjects(testSelection, [
            "anchorNode", "focusNode", "anchorOffset", "focusOffset"
        ]);

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
        } else if (selectionsHaveAnchorAndFocus && typeof testRange.collapsed == BOOLEAN
                && typeof testSelection.isCollapsed == BOOLEAN) {

            selectionPrototype.getRangeAt = function(index) {
                if (index == 0) {
                    var range = createRange(), sel = this.nativeSelection;
                    range.setStart(sel.anchorNode, sel.anchorOffset);
                    range.setEnd(sel.focusNode, sel.focusOffset);

                    // Handle the case when the selection was selected backwards (from the end to the start in the
                    // document)
                    if (range.collapsed !== sel.isCollapsed) {
                        range.setStart(sel.focusNode, sel.focusOffset);
                        range.setEnd(sel.anchorNode, sel.anchorOffset);
                    }

                    return range;
                } else {
                    throw new Error("Range index out of bounds (range count: 1)");
                }
            };
        } else {
            fail("No means of obtaining a Range or TextRange from the user's selection was found");
            return false;
        }

        selectionPrototype.getFirstRange = function() {
            return this.getRangeAt(0);
        };

        if (selectionsHaveAnchorAndFocus && isHostMethod(testRange, "compareBoundaryPoints") && typeof testRange.START_TO_START != UNDEFINED) {
            selectionPrototype.isBackwards = function() {
                var sel = this.nativeSelection;
                var anchorRange = createRange();
                anchorRange.setStart(sel.anchorNode, sel.anchorOffset);
                anchorRange.setEnd(sel.anchorNode, sel.anchorOffset);

                var focusRange = createRange();
                focusRange.setStart(sel.focusNode, sel.focusOffset);
                focusRange.setEnd(sel.focusNode, sel.focusOffset);

                var backwards = (anchorRange.compareBoundaryPoints(anchorRange.START_TO_START, focusRange) == 1);

                anchorRange.detach();
                focusRange.detach();

                return backwards;
            };
        } else {
            selectionPrototype.isBackwards = function() {
                return false;
            };
        }

        // Collapsedness
        if (typeof testSelection.isCollapsed == BOOLEAN) {
            selectionPrototype.isCollapsed = function() {
                return this.nativeSelection.isCollapsed;
            };
        } else {
            selectionPrototype.isCollapsed = function() {
                return this.getRangeAt(0).isCollapsed();
            };
        }

        // Selection text
        if (isHostMethod(testSelection, "toString")) {
            selectionPrototype.toString = function() {
                return "" + this.nativeSelection;
            };
        } else {
            selectionPrototype.toString = function() {
                return "" + this.getFirstRange();
            };
        }

        return true;
    }

    function initRanges(testSelection, testRange) {
        //if (!areHostMethods(testRange, ))
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
        } else if (isHostMethod(doc.body, "createTextRange")) {
            createRange = function() { return new WrappedRange(doc.body.createTextRange(), true); };
        }

        if (!createRange) {
            fail("No means of creating a Range or TextRange was found");
            return false;
        }

        api.createRange = createRange;

        testSelection = getSelection();
        testRange = createRange();

        if (!initSelections(testSelection, testRange)) {
            return false;
        }

        if (!initRanges(testSelection, testRange)) {
            return false;
        }



        // Create methods on the wrapped selection prototype




/*        if (selectRange) {
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
        }*/
        api.initialized = true;
        return true;
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