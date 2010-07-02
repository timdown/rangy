(function() {
    var log = log4javascript.getLogger("rangy");

    var NUMBER = "number", BOOLEAN = "boolean", OBJECT = "object", FUNCTION = "function", UNDEFINED = "undefined",
            STRING = "string";

    var getSelection, createRange, selectRange, testSelection, testRange;

    var domRangeProperties = ["startContainer", "startOffset", "endContainer", "endOffset", "collapsed",
        "commonAncestorContainer", "START_TO_START", "START_TO_END", "END_TO_START", "END_TO_END"];

    var domRangeMethods = ["setStart", "setStartBefore", "setStartAfter", "setEnd", "setEndBefore",
        "setEndAfter", "collapse", "selectNode", "selectNodeContents", "compareBoundaryPoints", "deleteContents",
        "extractContents", "cloneContents", "insertNode", "surroundContents", "cloneRange", "toString", "detach"];

    var textRangeProperties = ["boundingHeight", "boundingLeft", "boundingTop", "boundingWidth", "htmlText", "text"];

    // Subset of TextRange's full set of methods that we're interested in
    var textRangeMethods = ["collapse", "compareEndPoints", "duplicate", "getBookmark", "moveToBookmark",
        "moveToElementText", "parentElement", "pasteHTML", "select", "setEndPoint"];

    var selectionsHaveAnchorAndFocus, emptySelection, selectSingleRange, getSelectionRangeAt, getAllSelectionRanges;
    var getFirstSelectionRange, selectionIsBackwards, selectionIsCollapsed, getSelectionText, selectRanges;
    var addRangeToSelection;

    var rangesAreTextRanges, getRangeStart, getRangeEnd, setRangeStart, setRangeEnd, collapseRangeTo, rangeIsCollapsed;
    var getRangeText, createPopulatedRange, moveRangeToNode, rangesIntersect, rangeIntersectsNode, cloneRange;
    var detachRange, getRangeDocument;

    var win = window, doc = document;
    var global = (function() { return this; })();

    var api = {
        initialized: false
    };

    // Create the single global variable to contain everything
    var globalVarName = (typeof global.rangyGlobalVarName == STRING) ? global.rangyGlobalVarName : "rangy";
    global[globalVarName] = api;

    /*----------------------------------------------------------------------------------------------------------------*/

    // Pair of functions taken from Peter Michaux's article:
    // http://peter.michaux.ca/articles/feature-detection-state-of-the-art-browser-scripting
    function isHostMethod(object, property) {
        var t = typeof object[property];
        return t === FUNCTION || (!!(t == OBJECT && object[property])) || t == "unknown";
    }

    api.isHostMethod = isHostMethod;

    function isHostObject(object, property) {
        return !!(typeof(object[property]) == OBJECT && object[property]);
    }

    api.isHostObject = isHostObject;

    function isHostProperty(object, property) {
        return typeof(object[property]) != UNDEFINED;
    }

    api.isHostProperty = isHostProperty;

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

    api.areHostMethods = areHostMethods;

    function areHostObjects(object, properties) {
        for (var i = properties.length; i--; ) {
            if (!isHostObject(object, properties[i])) {
                return false;
            }
        }
        return true;
    }

    api.areHostObjects = areHostObjects;

    function areHostProperties(object, properties) {
        for (var i = properties.length; i--; ) {
            if (!isHostProperty(object, properties[i])) {
                return false;
            }
        }
        return true;
    }

    api.areHostProperties = areHostProperties;

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

    api.getDocument = getDocument;

    function getWindow(node) {
        var doc = getDocument(node);
        return doc.defaultView || doc.parentWindow;
    }

    api.getWindow = getWindow;

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

    api.isAncestorOf = isAncestorOf;

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

    api.arrayContains = arrayContains;

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

    api.getCommonAncestor = getCommonAncestor;

    function getNodeChildIndex(node) {
        var i = 0;
        while( (node = node.previousSibling) ) {
            i++;
        }
        return i;
    }

    api.getNodeChildIndex = getNodeChildIndex;

    function isDataNode(node) {
        return node && typeof node.data == STRING && typeof node.length == NUMBER;
    }

    api.isDataNode = isDataNode;

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

    api.DomPosition = DomPosition;

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
        } while ( (comparison = workingRange.compareEndPoints(workingComparisonType, textRange)) > 0 &&
                workingNode.previousSibling);

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
            boundaryPosition = new DomPosition(containerElement, getNodeChildIndex(workingNode));
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

    /*----------------------------------------------------------------------------------------------------------------*/

    function fail(reason) {
        alert("Rangy not supported in your browser. Reason: " + reason);
        api = {
            initialized: true,
            supported: false
        };
    }

    // Initialization
    function init() {
        // Test for the Range/TextRange and Selection features required
        // Test for ability to retrieve selection
        if (isHostMethod(win, "getSelection")) {
            getSelection = function(winParam) { return (winParam || window).getSelection(); };
        } else if (isHostObject(doc, "selection")) {
            getSelection = function(winParam) { return ((winParam || window).document.selection); };
        }

        if (!getSelection) {
            fail("No means of obtaining selection was found");
            return false;
        }

        api.getSelection = getSelection;

        // Test creation of ranges
        if (isHostMethod(doc, "createRange")) {
            createRange = function(docParam) { return (docParam || document).createRange(); };
            rangesAreTextRanges = false;
        } else if (isHostMethod(doc.body, "createTextRange")) {
            createRange = function(docParam) { return (docParam || document).body.createTextRange(); };
            rangesAreTextRanges = true;
        } else {
            fail("No means of creating a Range or TextRange was found");
            return false;
        }

        api.createRange = createRange;
        api.rangesAreTextRanges = rangesAreTextRanges;

        testSelection = getSelection();
        testRange = createRange();

        // Test for DOM Range support, and if not present check for TextRange suppor
        if (!rangesAreTextRanges && (!areHostMethods(testRange, domRangeMethods) || !areHostProperties(testRange, domRangeProperties))) {
            fail("Incomplete implementation of DOM Range");
            return false;
        } else if (rangesAreTextRanges && (!areHostMethods(testRange, textRangeMethods) || !areHostProperties(testRange, textRangeProperties))) {
            fail("Incomplete implementation of TextRange");
            return false;
        }

        // Detaching a range, where available
        if (rangesAreTextRanges) {
            detachRange = function() {};
        } else {
            detachRange = function(range) {
                range.detach();
            };
        }

        api.detachRange = detachRange;

        if (rangesAreTextRanges) {
            getRangeDocument = function(range) {
                return getDocument(range.parentElement());
            };
        } else {
            getRangeDocument = function(range) {
                return getDocument(range.startContainer);
            };
        }

        api.getRangeDocument = getRangeDocument;

        // Simple abstraction for getting and setting range boundaries
        if (rangesAreTextRanges) {
            getRangeStart = function(range) {
                return getTextRangeBoundaryPosition(range, true);
            };

            getRangeEnd = function(range) {
                return getTextRangeBoundaryPosition(range, false);
            };

            setRangeStart = function(range, node, offset) {
                var boundaryRange = createBoundaryTextRange(new DomPosition(node, offset), true);
                // Check if the new start point is on or after the existing range end point
                if (range.compareEndPoints("EndToStart", boundaryRange) <= 0) {
                    // Move the end of the range forward to the new boundary and collapse the range forward
                    range.setEndPoint("EndToStart", boundaryRange);
                    range.collapse(false);
                } else {
                    range.setEndPoint("StartToStart", boundaryRange);
                }
            };

            setRangeEnd = function(range, node, offset) {
                var boundaryRange = createBoundaryTextRange(new DomPosition(node, offset), false);
                // Check if the new end point is on or before the existing range end point
                if (range.compareEndPoints("StartToEnd", boundaryRange) >= 0) {
                    // Move the start of the range backwards to the new boundary and collapse the range backwards
                    range.setEndPoint("StartToEnd", boundaryRange);
                    range.collapse(true);
                } else {
                    range.setEndPoint("EndToEnd", boundaryRange);
                }
            };
        } else {
            getRangeStart = function(range) {
                return new DomPosition(range.startContainer, range.startOffset);
            };

            getRangeEnd = function(range) {
                return new DomPosition(range.endContainer, range.endOffset);
            };

            // Test for Firefox 2 bug that prevents moving the start of a Range to a point after its current end and
            // correct for it
            (function() {
                var node = doc.createTextNode(" ");
                doc.body.appendChild(node);
                var range = createRange(doc);
                range.setStart(node, 0);
                range.setEnd(node, 0);
                try {
                    range.setStart(node, 1);
                    setRangeStart = function(range, node, offset) {
                        range.setStart(node, offset);
                    };

                    setRangeEnd = function(range, node, offset) {
                        range.setEnd(node, offset);
                    };
                } catch(ex) {
                    log.info("Browser has bug (present in Firefox 2 and below) that prevents moving the start of a Range to a point after its current end. Correcting for it.");
                    setRangeStart = function(range, node, offset) {
                        try {
                            range.setStart(node, offset);
                        } catch (ex) {
                            range.setEnd(node, offset);
                            range.setStart(node, offset);
                        }
                    };

                    setRangeEnd = function(range, node, offset) {
                        try {
                            range.setEnd(node, offset);
                        } catch (ex) {
                            range.setStart(node, offset);
                            range.setEnd(node, offset);
                        }
                    };
                }

                // Clean up
                doc.body.removeChild(node);
                detachRange(range);
            })();
        }

        api.getRangeStart = getRangeStart;
        api.getRangeEnd = getRangeEnd;
        api.setRangeStart = setRangeStart;
        api.setRangeEnd = setRangeEnd;

        // Move range to node
        if (rangesAreTextRanges) {
            moveRangeToNode = function(range, node, insideNode) {
                if (node.nodeType == 1) {
                    range.moveToElementText(node);
                } else if (isDataNode(node)) {
                    setRangeStart(range, node, 0);
                    setRangeEnd(range, node, node.length);
                } else {
                    setRangeStart(range, node, 0);
                    setRangeEnd(range, node, node.childNodes.length);
                }
            };
        } else {
            moveRangeToNode = function(range, node, insideNode) {
                if (insideNode) {
                    range.selectNodeContents(node);
                } else {
                    // The try/catch comes from the implementation of intersectsNode on MDC
                    // (https://developer.mozilla.org/en/DOM/range.intersectsNode). Not sure if and when it's necessary
                    // but leaving it in, just in case. Possibly it's there to deal with DocumentFragments: according to
                    // the spec, selectNode on a DocumentFragment should throw a RangeException whereas
                    // selectNodeContents should not. If so, a simple test of the node's nodeType property would be
                    // better than a try/catch
                    try {
                        range.selectNode(node);
                    } catch (e) {
                        range.selectNodeContents(node);
                    }
                }
            };
        }

        api.moveRangeToNode = moveRangeToNode;

        api.createPopulatedRange = createPopulatedRange = function(startContainer, startOffset, endContainer, endOffset) {
            var doc = getDocument(startContainer);
            var range = createRange(doc);
            setRangeStart(range, startContainer, startOffset);
            setRangeEnd(range, endContainer, endOffset);
            return range;
        };

        // Range collapsing
        api.collapseRangeTo = collapseRangeTo = function(range, node, offset) {
            setRangeStart(range, node, offset);
            setRangeEnd(range, node, offset);
        };

        if (typeof testRange.collapsed == BOOLEAN) {
            rangeIsCollapsed = function(range) {
                return range.collapsed;
            };
        } else if (typeof testRange.text == STRING) {
            rangeIsCollapsed = function(range) {
                return !!range.text.length;
            };
        } else {
            fail("No means of detecting whether a range is collapsed found");
            return false;
        }

        api.rangeIsCollapsed = rangeIsCollapsed;

        // Range text
        if (typeof testRange.text == STRING) {
            getRangeText = function(range) {
                return range.text;
            };
        } else if (typeof testRange.toString == FUNCTION) {
            getRangeText = function(range) {
                return range.toString();
            };
        } else {
            fail("No means of obtaining a range's text was found");
            return false;
        }

        api.getRangeText = getRangeText;

        // Clone range
        if (rangesAreTextRanges) {
            cloneRange = function(range) {
                return range.duplicate();
            };
        } else {
            cloneRange = function(range) {
                return range.cloneRange();
            };
        }

        api.cloneRange = cloneRange;

        // Range intersecting range
        if (rangesAreTextRanges) {
            rangesIntersect = function(range1, range2) {
                return range1.compareEndPoints("EndToStart", range2) == 1 &&
                       range1.compareEndPoints("StartToEnd", range2) == -1;
            };
        } else {
            // The following is a slightly complicated workaround for an old WebKit bug
            // (https://bugs.webkit.org/show_bug.cgi?id=20738). See also http://www.thismuchiknow.co.uk/?p=64
            rangesIntersect = function(range1, range2) {
                var startRange1 = range1.cloneRange();
                startRange1.collapse(true);

                var endRange1 = range1.cloneRange();
                endRange1.collapse(false);

                var startRange2 = range2.cloneRange();
                startRange2.collapse(true);

                var endRange2 = range2.cloneRange();
                endRange2.collapse(false);

                var intersects = startRange1.compareBoundaryPoints(range1.START_TO_START, endRange2) == -1 &&
                       endRange1.compareBoundaryPoints(range1.START_TO_START, startRange2) == 1;

                detachRange(startRange1);
                detachRange(endRange1);
                detachRange(startRange2);
                detachRange(endRange2);

                return intersects;
            };
        }

        // Range intersecting a node
        if (isHostMethod(testRange, "intersectsNode")) {
            rangeIntersectsNode = function(range, node) {
                return range.intersectsNode(node);
            };
        } else {
            rangeIntersectsNode = function(range, node) {
                var nodeRange = createRange(getDocument(node));
                moveRangeToNode(nodeRange, node);
                var intersects = rangesIntersect(range, nodeRange);
                detachRange(nodeRange);
                return intersects;
            };
        }

        api.rangeIntersectsNode = rangeIntersectsNode;

        // Selecting a range
        if (areHostMethods(testSelection, ["removeAllRanges", "addRange"])) {
            emptySelection = function(sel) {
                sel.removeAllRanges();
            };

            selectSingleRange = function(sel, range) {
                sel.removeAllRanges();
                sel.addRange(range);
            };

            addRangeToSelection = function(sel, range) {
                sel.addRange(range);
            };

            selectRanges = function(sel, ranges) {
                sel.removeAllRanges();
                for (var i = 0, len = ranges.length; i < len; ++i) {
                    sel.addRange(ranges[i]);
                }
            };
        } else if (isHostMethod(testSelection, "empty") && isHostMethod(testRange, "select")) {
            emptySelection = function(sel) {
                sel.empty();
            };

            addRangeToSelection = function(sel, range) {
                range.select();
            };

            selectRanges = function(sel, ranges) {
                sel.empty();
                ranges[0].select();
            };
        } else {
            fail("No means of selecting a Range or TextRange was found");
            return false;
        }

        api.emptySelection = emptySelection;
        api.addRangeToSelection = addRangeToSelection;
        api.selectSingleRange = selectSingleRange = function(sel, range) {
            emptySelection(sel);
            addRangeToSelection(sel, range);
        };

        api.selectRanges = selectRanges;

        api.createSelection = function(startContainer, startOffset, endContainer, endOffset) {
            var sel = getSelection(getWindow(startContainer));
            var range = createPopulatedRange(startContainer, startOffset, endContainer, endOffset);
            selectSingleRange(sel, range);
            return sel;
        };

        // Obtaining a range from a selection
        selectionsHaveAnchorAndFocus = areHostObjects(testSelection, [
            "anchorNode", "focusNode", "anchorOffset", "focusOffset"
        ]);

        getAllSelectionRanges = function(sel) {
            return [getSelectionRangeAt(sel, 0)];
        };

        if (isHostMethod(testSelection, "getRangeAt") && typeof testSelection.rangeCount == NUMBER) {
            getSelectionRangeAt = function(sel, index) {
                return (sel.rangeCount == 0) ? null : sel.getRangeAt(index);
            };

            getAllSelectionRanges = function(sel) {
                for (var i = 0, len = sel.rangeCount, ranges = []; i < len; ++i) {
                    ranges.push(sel.getRangeAt(i));
                }
                return ranges;
            };
        } else if (isHostMethod(testSelection, "createRange")) {
            getSelectionRangeAt = function(sel, index) {
                if (index == 0) {
                    return sel.createRange();
                } else {
                    throw new Error("Range index out of bounds (range count: 1)");
                }
            };
        } else if (selectionsHaveAnchorAndFocus && typeof testRange.collapsed == BOOLEAN &&
                typeof testSelection.isCollapsed == BOOLEAN) {

            getSelectionRangeAt = function(sel, index) {
                if (index == 0) {
                    var doc = getDocument(sel.anchorNode);
                    var range = createRange(doc);
                    setRangeStart(range, sel.anchorNode, sel.anchorOffset);
                    setRangeEnd(range, sel.focusNode, sel.focusOffset);

                    // Handle the case when the selection was selected backwards (from the end to the start in the
                    // document)
                    if (range.collapsed !== sel.isCollapsed) {
                        setRangeStart(range, sel.focusNode, sel.focusOffset);
                        setRangeEnd(range, sel.anchorNode, sel.anchorOffset);
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

        api.getSelectionRangeAt = getSelectionRangeAt;
        api.getAllSelectionRanges = getAllSelectionRanges;

        api.getFirstSelectionRange = getFirstSelectionRange = function(sel) {
            return getSelectionRangeAt(sel, 0);
        };

        api.getFirstSelectionRange = getFirstSelectionRange = function(sel) {
            return getSelectionRangeAt(sel, 0);
        };

        // Detecting if a selection is backwards
        if (selectionsHaveAnchorAndFocus && !rangesAreTextRanges) {
            selectionIsBackwards = function(sel) {
                var anchorRange = createRange();
                collapseRangeTo(anchorRange, sel.anchorNode, sel.anchorOffset);

                var focusRange = createRange();
                collapseRangeTo(focusRange, sel.focusNode, sel.focusOffset);

                var backwards = (anchorRange.compareBoundaryPoints(anchorRange.START_TO_START, focusRange) == 1);

                detachRange(anchorRange);
                detachRange(focusRange);

                return backwards;
            };
        } else {
            selectionIsBackwards = function() {
                return false;
            };
        }

        api.selectionIsBackwards = selectionIsBackwards;

        // Selection collapsedness
        if (typeof testSelection.isCollapsed == BOOLEAN) {
            selectionIsCollapsed = function(sel) {
                return sel.isCollapsed;
            };
        } else {
            selectionIsCollapsed = function(sel) {
                return rangeIsCollapsed(getFirstSelectionRange(sel));
            };
        }

        api.selectionIsCollapsed = selectionIsCollapsed;

        // Selection text
        if (isHostMethod(testSelection, "toString")) {
            getSelectionText = function(sel) {
                return "" + sel;
            };
        } else {
            getSelectionText = function(sel) {
                var ranges = getAllSelectionRanges(sel);
                var rangeTexts = [];
                for (var i = 0, len = ranges.length; i < len; ++i) {
                    rangeTexts[i] = getRangeText(ranges[i]);
                }
                return rangeTexts.join("");
            };
        }

        win = doc = null;
        detachRange(testRange);

        api.initialized = true;

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