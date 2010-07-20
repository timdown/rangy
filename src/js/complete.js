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
    var detachRange, getRangeDocument, getRangeCount, insertNodeAtRangeBoundary;
    var canSetRangeStartAfterEnd = true;

    var setRangeStartBefore, setRangeStartAfter, setRangeEndBefore, setRangeEndAfter;

    var win = window, doc = document;
    var global = (function() { return this; })();

    var api = {
        initialized: false,
        features: {
            domRangeProperties: domRangeProperties,
            domRangeMethods: domRangeMethods
        },
        dom: {},
        util: {}
    };

    // Create the single global variable to contain everything
    var globalVarName = (typeof global.rangyGlobalVarName == STRING) ? global.rangyGlobalVarName : "rangy";
    global[globalVarName] = api;

    /*----------------------------------------------------------------------------------------------------------------*/

    // Pair of functions taken from Peter Michaux's article:
    // http://peter.michaux.ca/articles/feature-detection-state-of-the-art-browser-scripting
    function isHostMethod(object, property) {
        var t = typeof object[property];
        return t == FUNCTION || (!!(t == OBJECT && object[property])) || t == "unknown";
    }

    api.util.isHostMethod = isHostMethod;

    function isHostObject(object, property) {
        return !!(typeof(object[property]) == OBJECT && object[property]);
    }

    api.util.isHostObject = isHostObject;

    function isHostProperty(object, property) {
        return typeof(object[property]) != UNDEFINED;
    }

    api.util.isHostProperty = isHostProperty;

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

    api.util.areHostMethods = areHostMethods;

    function areHostObjects(object, properties) {
        for (var i = properties.length; i--; ) {
            if (!isHostObject(object, properties[i])) {
                return false;
            }
        }
        return true;
    }

    api.util.areHostObjects = areHostObjects;

    function areHostProperties(object, properties) {
        for (var i = properties.length; i--; ) {
            if (!isHostProperty(object, properties[i])) {
                return false;
            }
        }
        return true;
    }

    api.util.areHostProperties = areHostProperties;

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

    api.dom.getDocument = getDocument;

    function getWindow(node) {
        var doc = getDocument(node);
        return doc.defaultView || doc.parentWindow;
    }

    api.dom.getWindow = getWindow;

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

    api.dom.isAncestorOf = isAncestorOf;

    function insertAfter(node, precedingNode) {
        var nextNode = precedingNode.nextSibling, parent = precedingNode.parentNode;
        if (nextNode) {
            parent.insertBefore(node, nextNode);
        } else {
            parent.appendChild(node);
        }
        return node;
    }

    api.dom.insertAfter = insertAfter;

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

    api.util.arrayContains = arrayContains;

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

    api.dom.getCommonAncestor = getCommonAncestor;

    function getNodeIndex(node) {
        var i = 0;
        while( (node = node.previousSibling) ) {
            i++;
        }
        return i;
    }

    api.dom.getNodeIndex = getNodeIndex;

    function isDataNode(node) {
        return node && typeof node.data == STRING && typeof node.length == NUMBER;
    }

    api.dom.isDataNode = isDataNode;

    // TODO: Feature test text, CDATA and comment nodes for cloneNode, splitText, length, deleteData

    function splitDataNode(node, index) {
        var newNode;
        if (node.nodeType == 3) {
            newNode = node.splitText(index);
        } else {
            newNode = node.cloneNode();
            newNode.deleteData(0, index);
            node.deleteData(0, node.length - index);
            insertAfter(newNode, node);
        }
        return newNode;
    }

    api.dom.splitDataNode = splitDataNode;

    function insertNode(node, domPos) {
        var n = domPos.node, o = domPos.offset;
        if (isDataNode(n)) {
            if (o == 0) {
                n.parentNode.insertBefore(node, n);
            } else if (domPos.offset == n.length) {
                n.parentNode.appendChild(node);
            } else {
                n.parentNode.insertBefore(node, splitDataNode(n, o));
            }
        } else if (o >= n.childNodes.length) {
            n.appendChild(node);
        } else {
            n.insertBefore(node, n.childNodes[o]);
        }
        return node;
    }

    api.dom.insertNode = insertNode;

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

    api.dom.DomPosition = DomPosition;

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
            boundaryPosition = new DomPosition(containerElement, getNodeIndex(workingNode));
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
        var childNodes;

        if (nodeIsDataNode) {
            boundaryNode = boundaryPosition.node;
            boundaryParent = boundaryNode.parentNode;
        } else {
            childNodes = boundaryPosition.node.childNodes;
            boundaryNode = (boundaryPosition.offset < childNodes.length) ? childNodes[boundaryPosition.offset] : null;
            boundaryParent = boundaryPosition.node;
        }

        // Position the range immediately before the node containing the boundary
        var doc = getDocument(boundaryPosition.node);
        var workingNode = doc.createElement("span");
        if (boundaryNode) {
            boundaryParent.insertBefore(workingNode, boundaryNode);
        } else {
            boundaryParent.appendChild(workingNode);
        }

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
        api.features.rangesAreTextRanges = rangesAreTextRanges;

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
                    return true;
                } else {
                    range.setEndPoint("StartToStart", boundaryRange);
                    return false;
                }
            };

            setRangeEnd = function(range, node, offset) {
                var boundaryRange = createBoundaryTextRange(new DomPosition(node, offset), false);
                // Check if the new end point is on or before the existing range end point
                if (range.compareEndPoints("StartToEnd", boundaryRange) >= 0) {
                    // Move the start of the range backwards to the new boundary and collapse the range backwards
                    range.setEndPoint("StartToEnd", boundaryRange);
                    range.collapse(true);
                    return true;
                } else {
                    range.setEndPoint("EndToEnd", boundaryRange);
                    return false;
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
                        var endNode = range.endContainer, endOffset = range.endOffset;
                        range.setStart(node, offset);
                        return range.endContainer !== endNode || range.endOffset !== endOffset;
                    };

                    setRangeEnd = function(range, node, offset) {
                        var startNode = range.startContainer, startOffset = range.endOffset;
                        range.setEnd(node, offset);
                        return range.startContainer !== startNode || range.startOffset !== startOffset;
                    };
                } catch(ex) {
                    log.info("Browser has bug (present in Firefox 2 and below) that prevents moving the start of a Range to a point after its current end. Correcting for it.");

                    canSetRangeStartAfterEnd = false;

                    setRangeStart = function(range, node, offset) {
                        try {
                            range.setStart(node, offset);
                            return false;
                        } catch (ex) {
                            range.setEnd(node, offset);
                            range.setStart(node, offset);
                            return true;
                        }
                    };

                    setRangeEnd = function(range, node, offset) {
                        try {
                            range.setEnd(node, offset);
                            return false;
                        } catch (ex) {
                            range.setStart(node, offset);
                            range.setEnd(node, offset);
                            return true;
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
        api.features.canSetRangeStartAfterEnd = canSetRangeStartAfterEnd;

        api.setRangeStartBefore = setRangeStartBefore = function(range, node) {
            setRangeStart(range, node.parentNode, getNodeIndex(node));
        };

        api.setRangeStartAfter = setRangeStartAfter = function(range, node) {
            setRangeStart(range, node.parentNode, getNodeIndex(node) + 1);
        };

        api.setRangeEndBefore = setRangeEndBefore = function(range, node) {
            setRangeEnd(range, node.parentNode, getNodeIndex(node));
        };

        api.setRangeEndAfter = setRangeEndAfter = function(range, node) {
            setRangeEnd(range, node.parentNode, getNodeIndex(node) + 1);
        };

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
                return !range.text.length;
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

        api.rangesIntersect = rangesIntersect;

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

        // Inserting a node at the boundary of a range
        if (rangesAreTextRanges) {
            insertNodeAtRangeBoundary = function(range, node, atStart) {
                var pos = atStart ? getRangeStart(range) : getRangeEnd(range);
                insertNode(node, pos);
            };
        } else {
            insertNodeAtRangeBoundary = function(range, node, atStart) {
                if (!atStart) {
                    range = range.cloneRange();
                    range.collapse(false);
                }
                range.insertNode(node);
            };
        }

        api.insertNodeAtRangeBoundary = insertNodeAtRangeBoundary;

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

        api.features.selectionsHaveAnchorAndFocus = selectionsHaveAnchorAndFocus;

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

            getRangeCount = function(sel) {
                return sel.rangeCount;
            };
        } else if (isHostMethod(testSelection, "createRange")) {
            getSelectionRangeAt = function(sel, index) {
                if (index == 0) {
                    return sel.createRange();
                } else {
                    throw new Error("Range index out of bounds (range count: 1)");
                }
            };

            getRangeCount = function(sel) {
                return 1;
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

            getRangeCount = function(sel) {
                return sel.anchorNode === null ? 0 : 1;
            };
        } else {
            fail("No means of obtaining a Range or TextRange from the user's selection was found");
            return false;
        }

        api.getSelectionRangeAt = getSelectionRangeAt;
        api.getAllSelectionRanges = getAllSelectionRanges;
        api.getRangeCount = getRangeCount;

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

    /*----------------------------------------------------------------------------------------------------------------*/

    api.addInitListener(function(api) {
        var markerTextChar = "\ufeff";
        var markerTextCharEntity = "&#xfeff;";

        var insertRangeBoundaryMarker;

        var saveSelection, setRangeBoundary, restoreSelection, removeMarkerElement, removeMarkers;

        insertRangeBoundaryMarker = function(range, atStart) {
            var markerId = "selectionBoundary_" + new Date().getTime() + "_" + Math.random().toString().substr(2);
            var markerEl;
            var doc = api.getRangeDocument(range);

            // Clone the Range and collapse to the appropriate boundary point
            range = api.cloneRange(range);
            range.collapse(atStart);

            // Create the marker element containing a single invisible character using DOM methods and insert it
            markerEl = doc.createElement("span");
            markerEl.id = markerId;
            markerEl.appendChild(doc.createTextNode(markerTextChar));
            api.insertNodeAtRangeBoundary(range, markerEl, atStart);

            // Make sure the current range boundary is preserved
            api[atStart ? "setRangeStartAfter" : "setRangeEndBefore"](range, markerEl);

            api.detachRange(range);
            return markerId;
        };

        setRangeBoundary = function(doc, range, markerId, atStart) {
            var markerEl = doc.getElementById(markerId);
            api[atStart ? "setRangeStartAfter" : "setRangeEndBefore"](range, markerEl);
            markerEl.parentNode.removeChild(markerEl);
        };

        saveSelection = function(win) {
            win = win || window;
            var sel = api.getSelection(win);
            var ranges = api.getAllSelectionRanges(sel);
            var rangeInfos = [];
            for (var i = 0, len = ranges.length; i < len; ++i) {
                rangeInfos.push({
                    startMarkerId: insertRangeBoundaryMarker(ranges[i], true),
                    endMarkerId: insertRangeBoundaryMarker(ranges[i], false)
                });
            }

            // Ensure current selection is unaffected
            api.selectRanges(sel, ranges);
            return {
                win: win,
                doc: win.document,
                rangeInfos: rangeInfos
            };
        };

        restoreSelection = function(savedSelection) {
            var rangeInfos = savedSelection.rangeInfos;
            var sel = api.getSelection(savedSelection.win);
            api.emptySelection(sel);
            for (var i = 0, len = rangeInfos.length, rangeInfo, range; i < len; ++i) {
                rangeInfo = rangeInfos[i];
                range = api.createRange(savedSelection.doc);
                setRangeBoundary(savedSelection.doc, range, rangeInfo.startMarkerId, true);
                setRangeBoundary(savedSelection.doc, range, rangeInfo.endMarkerId, false);
                api.addRangeToSelection(sel, range);
            }
        };

        removeMarkerElement = function(doc, markerId) {
            var markerEl = doc.getElementById(markerId);
            markerEl.parentNode.removeChild(markerEl);
        };

        removeMarkers = function(savedSelection) {
            var rangeInfos = savedSelection.rangeInfos;
            for (var i = 0, len = rangeInfos.length, rangeInfo; i < len; ++i) {
                rangeInfo = rangeInfos[i];
                removeMarkerElement(rangeInfo.startMarkerId);
                removeMarkerElement(rangeInfo.endMarkerId);
            }
        };

        api.saveRestore = {
            saveSelection: saveSelection,
            restoreSelection: restoreSelection,
            removeMarkerElement: removeMarkerElement,
            removeMarkers: removeMarkers
        };
    });

    /*----------------------------------------------------------------------------------------------------------------*/

    api.addInitListener(function(api) {
        var log = log4javascript.getLogger("rangy.textInputs");
        var getSelectionBoundary, getSelection, setSelection, deleteSelectedText, deleteText, insertText, pasteText;

        function fail(reason) {
            alert("TextInputs module for Rangy not supported in your browser. Reason: " + reason);
        }

        function adjustOffsets(el, start, end) {
            if (start < 0) {
                start += el.value.length;
            }
            if (typeof end == "undefined") {
                end = start;
            }
            if (end < 0) {
                end += el.value.length;
            }
            return { start: start, end: end };
        }

        var testTextArea = document.createElement("textarea");
        document.body.appendChild(testTextArea);

        if (api.util.areHostProperties(testTextArea, ["selectionStart", "selectionEnd"])) {
            getSelection = function(el) {
                return {
                    start: el.selectionStart,
                    end: el.selectionEnd
                };
            };

            setSelection = function(el, startOffset, endOffset) {
                var offsets = adjustOffsets(el, startOffset, endOffset);
                el.selectionStart = offsets.start;
                el.selectionEnd = offsets.end;
            };
        } else if (api.features.rangesAreTextRanges && api.util.isHostMethod(testTextArea, "createTextRange")) {
            getSelectionBoundary = function(el, isStart) {
                el.focus();
                var win = api.dom.getWindow(el);
                var range = api.getFirstSelectionRange(api.getSelection(win));
                var originalValue, textInputRange, precedingRange, pos, bookmark, isAtEnd;

                if (range) {
                    // Collapse the selected range if the selection is not a caret
                    if (!api.rangeIsCollapsed(range)) {
                        range.collapse(!!isStart);
                    }

                    originalValue = el.value;
                    textInputRange = el.createTextRange();
                    precedingRange = el.createTextRange();
                    pos = 0;

                    bookmark = range.getBookmark();
                    textInputRange.moveToBookmark(bookmark);

                    if (originalValue.indexOf("\r\n") > -1) {
                        // Trickier case where input value contains line breaks

                        // Test whether the selection range is at the end of the text input by moving it on by one character
                        // and checking if it's still within the text input.
                        /*try {
                            range.move("character", 1);
                            isAtEnd = (range.parentElement() != el);
                        } catch (ex) {
                            log.warn("Error moving range", ex);
                            isAtEnd = true;
                        }*/

                        range.moveToBookmark(bookmark);

                        if (isAtEnd) {
                            pos = originalValue.length;
                        } else {
                            // Insert a character in the text input range and use that as a marker
                            textInputRange.text = "X";
                            precedingRange.setEndPoint("EndToStart", textInputRange);
                            pos = precedingRange.text.length - 1;

                            // Delete the inserted character
                            textInputRange.moveStart("character", -1);
                            textInputRange.text = "";
                        }
                    } else {
                        // Easier case where input value contains no line breaks
                        precedingRange.setEndPoint("EndToStart", textInputRange);
                        pos = precedingRange.text.length;
                    }
                    return pos;
                }
                return 0;
            };

            getSelection = function(el) {
                return {
                    start: getSelectionBoundary(el, true),
                    end: getSelectionBoundary(el, false)
                };
            };

            // Moving across a line break only counts as moving one character in a TextRange, whereas a line break in the
            // textarea value is two characters. This function corrects for that by converting a text offset into a range
            // character offset by subtracting one character for every line break in the textarea prior to the offset
            var offsetToRangeCharacterMove = function(el, offset) {
                return offset - (el.value.slice(0, offset).split("\r\n").length - 1);
            };

            setSelection = function(el, startOffset, endOffset) {
                var offsets = adjustOffsets(el, startOffset, endOffset);
                var range = el.createTextRange();
                var startCharMove = offsetToRangeCharacterMove(el, offsets.start);
                range.collapse(true);
                if (offsets.start == offsets.end) {
                    range.move("character", startCharMove);
                } else {
                    range.moveEnd("character", offsetToRangeCharacterMove(el, offsets.end));
                    range.moveStart("character", startCharMove);
                }
                range.select();
            };
        } else {
            fail("No means of finding text input caret position");
        }

        // Clean up
        document.body.removeChild(testTextArea);

        deleteSelectedText = function(el) {
            var sel = getSelection(el), val;
            if (sel.start != sel.end) {
                val = el.value;
                el.value = val.slice(0, sel.start) + val.slice(sel.end);
                setSelection(el, sel.start, sel.start);
            }
        };

        deleteText = function(el, start, end, moveSelection) {
            var val;
            if (start != end) {
                val = el.value;
                el.value = val.slice(0, start) + val.slice(end);
            }
            if (moveSelection) {
                setSelection(el, start, start);
            }
        };

        insertText = function(el, text, index, moveSelection) {
            var val = el.value, caretIndex;
            el.value = val.slice(0, index) + text + val.slice(index);
            if (moveSelection) {
                caretIndex = index + text.length;
                setSelection(el, caretIndex, caretIndex);
            }
        };

        pasteText = function(el, text) {
            var sel = getSelection(el), val = el.value;
            el.value = val.slice(0, sel.start) + text + val.slice(sel.end);
            var caretIndex = sel.start + text.length;
            setSelection(el, caretIndex, caretIndex);
        };

        api.textInputs = {
            getSelection: getSelection,
            setSelection: setSelection,
            deleteSelectedText: deleteSelectedText,
            deleteText: deleteText,
            insertText: insertText,
            pasteText: pasteText
        };
    });

    /*----------------------------------------------------------------------------------------------------------------*/

    api.addInitListener(function(api) {
        var log = log4javascript.getLogger("rangy.textmutation");

        // TODO: Investigate best way to implement these
        function hasClass(el, cssClass) {
            if (el.className) {
                var classNames = el.className.split(" ");
                return api.util.arrayContains(classNames, cssClass);
            }
            return false;
        }

        function hasMatchingClass(el, cssClassRegex) {
            if (el.className) {
                var classNames = el.className.split(" ");
                var i = classNames.length;
                while (i--) {
                    if (cssClassRegex.test(classNames[i])) {
                        return true;
                    }
                }
            }
            return false;
        }

        function addClass(el, cssClass) {
            if (!hasClass(el, cssClass)) {
                if (el.className) {
                    el.className += " " + cssClass;
                } else {
                    el.className = cssClass;
                }
            }
        }

        function removeClass(el, cssClass) {
            if (hasClass(el, cssClass)) {
                // Rebuild the className property
                var existingClasses = el.className.split(" ");
                var newClasses = [];
                for (var i = 0, len = existingClasses.length; i < len; i++) {
                    if (existingClasses[i] != cssClass) {
                        newClasses[newClasses.length] = existingClasses[i];
                    }
                }
                el.className = newClasses.join(" ");
            }
        }

        function getSortedClassName(el) {
            return el.className.split(" ").sort().join(" ");
        }

        function hasSameClasses(el1, el2) {
            return getSortedClassName(el1) == getSortedClassName(el2);
        }


        function createNextPreviousNodeMover(isNext) {
            var f = function(node, includeChildren) {
                var sibling, parentNode;
                if (includeChildren && node.hasChildNodes()) {
                    return node[isNext ? "firstChild" : "lastChild"];
                } else {
                    sibling = node[isNext ? "nextSibling" : "previousSibling"];
                    if (sibling) {
                        return sibling;
                    } else {
                        parentNode = node.parentNode;
                        return parentNode ? f(node.parentNode, false) : null;
                    }
                }
            };
            return f;
        }

        var previousNode = createNextPreviousNodeMover(false);
        var nextNode = createNextPreviousNodeMover(true);

        function createTextNodeFinder(first) {
            return function(node) {
                var n, f = first ? nextNode : previousNode;
                for ( n = node; n; n = f(n, true) ) {
                    if (n.nodeType == 3) {
                        return n;
                    }
                }
                return null;
            };
        }

        var firstTextNodeInOrAfter = createTextNodeFinder(true);
        var lastTextNodeInOrBefore = createTextNodeFinder(false);


        function fail(reason) {
            alert("TextMutation module for Rangy not supported in your browser. Reason: " + reason);
        }

        // Check for existence of working splitText method of a text node
        var testTextNode = document.createTextNode("test"), secondTextNode;
        document.body.appendChild(testTextNode);
        if (api.util.isHostMethod(testTextNode, "splitText")) {
            secondTextNode = testTextNode.splitText(2);
            if (testTextNode.data != "te" || !testTextNode.nextSibling || testTextNode.nextSibling.data != "st") {
                fail("incorrect implementation of text node splitText() method");
            }
        } else {
            fail("missing implementation of text node splitText() method");
        }
        document.body.removeChild(testTextNode);
        if (secondTextNode) {
            document.body.removeChild(secondTextNode);
        }

        function getTextNodesBetween(startTextNode, endTextNode) {
            var textNodes = [];
            for (var n = startTextNode; n && n !== endTextNode; n = nextNode(n, true)) {
                if (n.nodeType == 3) {
                    textNodes.push(n);
                }
            }
            if (endTextNode.nodeType == 3) {
                textNodes.push(endTextNode);
            }
            return textNodes;
        }

        function getTextNodesInRange(range, split) {
            var rangeStart = api.getRangeStart(range), rangeEnd = api.getRangeEnd(range);
            var startNode = rangeStart.node, endNode = rangeEnd.node, tempNode;
            var startOffset = rangeStart.offset, endOffset = rangeEnd.offset;
            log.info("getTextNodesInRange", startNode.nodeValue, rangeStart.offset, endNode.nodeValue, rangeEnd.offset);

            // Split the start and end container text nodes, if necessary
            if (endNode.nodeType == 3) {
                if (split && rangeEnd.offset < endNode.length) {
                    endNode.splitText(rangeEnd.offset);
                    api.setRangeEnd(range, endNode, endNode.length);
                }
            } else if (endNode.hasChildNodes()) {
                tempNode = endNode.childNodes[rangeEnd.offset - 1] || previousNode(endNode.childNodes[rangeEnd.offset], true);
                endNode = lastTextNodeInOrBefore(tempNode);
                endOffset = endNode.length;
            } else {
                endNode = lastTextNodeInOrBefore(endNode);
                endOffset = endNode.length;
            }

            if (startNode.nodeType == 3) {
                //log.info("Start node is text: " + startNode.nodeValue, endNode.nodeValue);
                if (split && rangeStart.offset > 0) {
                    tempNode = startNode.splitText(rangeStart.offset);
                    if (endNode === startNode) {
                        endNode = tempNode;
                    }
                    startNode = tempNode;
                    api.setRangeStart(range, startNode, 0);
                }
            } else if (startNode.hasChildNodes()) {
                tempNode = startNode.childNodes[rangeStart.offset] || nextNode(startNode.childNodes[rangeStart.offset - 1], true);
                startNode = firstTextNodeInOrAfter(tempNode);
                startOffset = 0;
            } else {
                startNode = firstTextNodeInOrAfter(startNode);
                startOffset = 0;
            }

            log.info("start:" + startNode + ", end:" + endNode);
            //log.info("Now: ", startNode.nodeValue, rangeStart.offset, endNode.nodeValue, rangeEnd.offset);

            //log.info("getTextNodesInRange start and end nodes equal: " + (startNode === endNode));

            return (startNode === endNode) ? [startNode] : getTextNodesBetween(startNode, endNode);
        }

        var returnFalseFunc = function() { return false; };
        var noOpFunc = function() {};

        function createTextMutator(options) {
            var apply = options.apply || noOpFunc;
            var undo = options.undo || noOpFunc;
            var checkApplied = options.checkApplied || returnFalseFunc;

            function applyToRange(range) {
                var textNodes = getTextNodesInRange(range, true), textNode;
                if (options.preApplyCallback) {
                    options.preApplyCallback(textNodes, range);
                }

                for (var i = 0, len = textNodes.length; i < len; ++i) {
                    textNode = textNodes[i];
                    if (!checkApplied(textNode)) {
                        apply(textNode);
                    }
                }
                api.setRangeStart(range, textNodes[0], 0);
                textNode = textNodes[textNodes.length - 1];
                api.setRangeEnd(range, textNode, textNode.length);
                log.info("Apply set range to '" + textNodes[0].data + "', '" + textNode.data + "'");
                if (options.postApplyCallback) {
                    options.postApplyCallback(textNodes, range);
                }
            }

            function applyToSelection(win) {
                win = win || window;
                var sel = api.getSelection(win);
                var ranges = api.getAllSelectionRanges(sel), range;
                api.emptySelection(sel);
                for (var i = 0, len = ranges.length; i < len; ++i) {
                    range = ranges[i];
                    applyToRange(range);
                    api.addRangeToSelection(sel, range);
                }
            }

            function undoToRange(range) {
                var textNodes = getTextNodesInRange(range, true), textNode;

                if (options.preUndoCallback) {
                    options.preUndoCallback(textNodes, range);
                }

                for (var i = 0, len = textNodes.length; i < len; ++i) {
                    textNode = textNodes[i];
                    if (checkApplied(textNode)) {
                        undo(textNode);
                    }
                }
                api.setRangeStart(range, textNodes[0], 0);
                textNode = textNodes[textNodes.length - 1];
                api.setRangeEnd(range, textNode, textNode.length);
                log.info("Undo set range to '" + textNodes[0].data + "', '" + textNode.data + "'");

                if (options.postUndoCallback) {
                    options.postUndoCallback(textNodes, range);
                }
            }

            function undoToSelection(win) {
                win = win || window;
                var sel = api.getSelection(win);
                var ranges = api.getAllSelectionRanges(sel), range;
                api.emptySelection(sel);
                for (var i = 0, len = ranges.length; i < len; ++i) {
                    range = ranges[i];
                    undoToRange(range);
                    api.addRangeToSelection(sel, range);
                }
            }

            function isAppliedToRange(range) {
                var textNodes = getTextNodesInRange(range, false);
                for (var i = 0, len = textNodes.length; i < len; ++i) {
                    if (!checkApplied(textNodes[i])) {
                        return false;
                    }
                }
                return true;
            }

            function isAppliedToSelection(win) {
                win = win || window;
                var sel = api.getSelection(win);
                var ranges = api.getAllSelectionRanges(sel);
                for (var i = 0, len = ranges.length; i < len; ++i) {
                    if (!isAppliedToRange(ranges[i])) {
                        return false;
                    }
                }
                return true;
            }

            return {
                applyToSelection: applyToSelection,
                applyToRange: applyToRange,

                isAppliedToRange: isAppliedToRange,
                isAppliedToSelection: isAppliedToSelection,

                undoToRange: undoToRange,
                undoToSelection: undoToSelection,

                toggleRange: function(range) {
                    if (isAppliedToRange(range)) {
                        undoToRange(range);
                    } else {
                        applyToRange(range);
                    }
                },

                toggleSelection: function(win) {
                    if (isAppliedToSelection(win)) {
                        undoToSelection(win);
                    } else {
                        applyToSelection(win);
                    }
                }
            };
        }

        var nextCssId = 0;


        function createCssClassMutator(cssClass, normalize) {
            var uniqueCssClass = "rangy_" + (++nextCssId);
            normalize = (typeof normalize == "boolean") ? normalize : true;

            function createSpan(doc) {
                var span = doc.createElement("span");
                span.className = cssClass + " " + uniqueCssClass;
                return span;
            }

            function textNodeHasClass(textNode) {
                return elementHasClass(textNode.parentNode);
            }

            function elementHasClass(el) {
                return el.tagName.toLowerCase() == "span" && hasClass(el, uniqueCssClass);
            }

            function isRangySpan(node) {
                return node.nodeType == 1 && node.tagName.toLowerCase() == "span" && hasMatchingClass(node, /rangy_[\d]+/);
            }

            function Merge(firstNode) {
                this.isSpanMerge = (firstNode.nodeType == 1);
                this.firstTextNode = this.isSpanMerge ? firstNode.lastChild : firstNode;
                if (this.isSpanMerge) {
                    this.sortedCssClasses = getSortedClassName(firstNode);
                }
                this.textNodes = [this.firstTextNode];
            }

            Merge.prototype = {
                doMerge: function() {
                    var textBits = [], textNode, parent, text;
                    for (var i = 0, len = this.textNodes.length; i < len; ++i) {
                        textNode = this.textNodes[i];
                        parent = textNode.parentNode;
                        textBits[i] = textNode.data;
                        if (i) {
                            parent.removeChild(textNode);
                            if (!parent.hasChildNodes()) {
                                parent.parentNode.removeChild(parent);
                            }
                        }
                    }
                    this.firstTextNode.data = text = textBits.join("");
                    return text;
                },

                getLength: function() {
                    var i = this.textNodes.length, len = 0;
                    while (i--) {
                        len += this.textNodes[i].length;
                    }
                    return len;
                },

                toString: function() {
                    var textBits = [];
                    for (var i = 0, len = this.textNodes.length; i < len; ++i) {
                        textBits[i] = "'" + this.textNodes[i].data + "'";
                    }
                    return "[Merge(" + textBits.join(",") + ")]";
                }
            };

            function splitCssSpan(textNode) {
                var doc = api.dom.getDocument(textNode);
                var parent = textNode.parentNode, previous = textNode.previousSibling, next = textNode.nextSibling;
                var span, n;
                if (next) {
                    span = doc.createElement("span");
                    span.className = parent.className;
                    for (n = next; n; n = textNode.nextSibling) {
                        span.appendChild(n);
                    }
                    api.dom.insertAfter(span, parent);
                }
                if (previous) {
                    span = doc.createElement("span");
                    span.className = parent.className;
                    span.appendChild(textNode);
                    api.dom.insertAfter(span, parent);
                }
            }

            var preApplyCallback = normalize ?
                function(textNodes, range) {
                    log.group("preApplyCallback");
                    var startNode = textNodes[0], endNode = textNodes[textNodes.length - 1];
                    var startParent = startNode.parentNode, endParent = endNode.parentNode;
                    var doc = api.dom.getDocument(startNode);
                    var span;

                    if (isRangySpan(startParent) && startParent.childNodes.length > 1) {
                        log.debug("Splitting start");
                        splitCssSpan(startNode);
                    }

                    if (isRangySpan(endParent) && endParent.childNodes.length > 1) {
                        log.debug("Splitting end");
                        splitCssSpan(endNode);
                    }
                    log.groupEnd();
                } : null;

            function getAdjacentMergeableTextNode(node, forward) {
                var isTextNode = (node.nodeType == 3);
                var el = isTextNode ? node.parentNode : node;
                var adjacentNode;
                var propName = forward ? "nextSibling" : "previousSibling";
                if (isRangySpan(el)) {
                    // Compare element with its sibling
                    adjacentNode = el[propName];
                    if (adjacentNode && isRangySpan(adjacentNode) && hasSameClasses(el, adjacentNode)) {
                        return adjacentNode[forward ? "firstChild" : "lastChild"];
                    }
                } else if (isTextNode) {
                    // Can merge if the node's previous sibling is a text node
                    adjacentNode = node[propName];
                    if (adjacentNode && adjacentNode.nodeType == 3) {
                        return adjacentNode;
                    }
                }
                return null;
            }

            var postApplyCallback = normalize ?
                function(textNodes, range) {
                    log.group("postApplyCallback");
                    var firstNode = textNodes[0], lastNode = textNodes[textNodes.length - 1];

                    var merges = [], currentMerge;

                    var rangeStartNode = firstNode, rangeEndNode = lastNode;
                    var rangeStartOffset = 0, rangeEndOffset = lastNode.length;

                    var textNode, precedingTextNode;

                    for (var i = 0, len = textNodes.length; i < len; ++i) {
                        textNode = textNodes[i];
                        precedingTextNode = getAdjacentMergeableTextNode(textNode, false);
                        log.debug("Checking for merge. text node: " + textNode.data + ", preceding: " + (precedingTextNode ? precedingTextNode.data : null));
                        if (precedingTextNode) {
                            if (!currentMerge) {
                                currentMerge = new Merge(precedingTextNode);
                                merges.push(currentMerge);
                            }
                            currentMerge.textNodes.push(textNode);
                            if (textNode === firstNode) {
                                rangeStartNode = currentMerge.firstTextNode;
                                rangeStartOffset = rangeStartNode.length;
                            }
                            if (textNode === lastNode) {
                                rangeEndNode = currentMerge.firstTextNode;
                                rangeEndOffset = currentMerge.getLength();
                            }
                        } else {
                            currentMerge = null;
                        }
                    }

                    // Test whether the first node after the range needs merging
                    var nextTextNode = getAdjacentMergeableTextNode(lastNode, true);

                    if (nextTextNode) {
                        if (!currentMerge) {
                            currentMerge = new Merge(lastNode);
                            merges.push(currentMerge);
                        }
                        currentMerge.textNodes.push(nextTextNode);
                    }

                    // Do the merges
                    if (merges.length) {
                        log.info("Merging. Merges:", merges);
                        for (i = 0, len = merges.length; i < len; ++i) {
                            merges[i].doMerge();
                        }
                        log.info(rangeStartNode.nodeValue, rangeStartOffset, rangeEndNode.nodeValue, rangeEndOffset);

                        // Set the range boundaries
                        api.setRangeStart(range, rangeStartNode, rangeStartOffset);
                        api.setRangeEnd(range, rangeEndNode, rangeEndOffset);
                    }
                    log.groupEnd();
                } : null;


            return createTextMutator({
                apply: function(textNode) {
                    log.group("Apply CSS class. textNode: " + textNode.data);
                    var parent = textNode.parentNode;
                    if (isRangySpan(parent) && parent.childNodes.length == 1) {
                        addClass(parent, cssClass);
                        addClass(parent, uniqueCssClass);
                    } else {
                        var span = createSpan(api.dom.getDocument(textNode));
                        textNode.parentNode.insertBefore(span, textNode);
                        span.appendChild(textNode);
                    }
                    log.groupEnd();
                },

                preApplyCallback: preApplyCallback,

                postApplyCallback: postApplyCallback,

                preUndoCallback: preApplyCallback,

                postUndoCallback: postApplyCallback,

                checkApplied: textNodeHasClass,

                undo: function(textNode) {
                    var el = textNode.parentNode;

                    // Check whether the text node has siblings
                    var nextNode = textNode.nextSibling, previousNode = textNode.previousSibling;
                    var parent = el.parentNode;
                    log.group("Undo, text node is " + textNode.data, el.className);
                    if (nextNode && previousNode) {
                        // In this case we need to create a new span for the subsequent text node
                        var span = createSpan(api.dom.getDocument(textNode));
                        span.appendChild(nextNode);
                        api.dom.insertAfter(span, el);
                        span.parentNode.insertBefore(textNode, span);
                    } else if (nextNode) {
                        parent.insertBefore(textNode, el);
                    } else if (previousNode) {
                        api.dom.insertAfter(textNode, el);
                    } else {
                        removeClass(el, cssClass);
                        removeClass(el, uniqueCssClass);
                        log.info("Removed classes. class now: " + el.className, isRangySpan(el));
                        log.debug("element contents: " + el.innerHTML);
                        if (!isRangySpan(el)) {
                            parent.insertBefore(textNode, el);
                            parent.removeChild(el);
                        }
                    }
                    log.groupEnd();
                }
            });
        }

        api.createCssClassMutator = createCssClassMutator;
    });

    /*----------------------------------------------------------------------------------------------------------------*/

    api.addInitListener(function(api) {
        var domRangeDynamicProperties = ["startContainer", "startOffset", "endContainer", "endOffset", "collapsed",
            "commonAncestorContainer"];

        var DomPosition = api.dom.DomPosition;

        function WrappedSelection(win) {
            this.nativeSelection = api.getSelection(win);
            this.init();
        }

        var updateAnchorAndFocus = api.features.selectionsHaveAnchorAndFocus ?
            function(wrapped, sel) {
                wrapped.anchorNode = sel.anchorNode;
                wrapped.anchorOffset = sel.anchorOffset;
                wrapped.focusNode = sel.focusNode;
                wrapped.focusOffset = sel.focusOffset;
            } :

            function(wrapped, sel) {
                var range = api.getFirstSelectionRange(sel);
                var start = api.getRangeStart(range), end = api.getRangeEnd(range);
                wrapped.anchorNode = start.node;
                wrapped.anchorOffset = start.offset;
                wrapped.focusNode = end.node;
                wrapped.focusOffset = end.offset;
            };

        function emptySelection() {
            api.emptySelection(this.nativeSelection);
        }

        var selProto = WrappedSelection.prototype = {
            init: function() {
                var sel = this.nativeSelection;
                updateAnchorAndFocus(this, sel);
                this.isCollapsed = api.selectionIsCollapsed(sel);
                this.rangeCount = api.getRangeCount(sel);
            },

            addRange: function(range) {
                api.addRangeToSelection(this.nativeSelection, range.nativeRange || range);
            },

            removeAllRanges: emptySelection,
            empty: emptySelection,

            selectSingleRange: function(range) {
                api.selectSingleRange(this.nativeSelection, range);
            }
        };


        function WrappedRange(range, startPos, endPos) {
            this.init(range, startPos, endPos);
        }


        function updateRangeProperties(range) {
            var i = domRangeDynamicProperties.length, prop;
            while (i--) {
                prop = domRangeDynamicProperties[i];
                range[prop] = range.nativeRange[prop];
            }
        }

        // Allow calling code to provide start and end positions if known, to minimize expensive calls to getRangeStart
        // and getRangeEnd
        function updateTextRangeProperties(range, startPos, endPos) {
            startPos = startPos || api.getRangeStart(range.nativeRange);
            endPos = endPos || api.getRangeEnd(range.nativeRange);

            range.startContainer = startPos.node;
            range.startOffset = startPos.offset;
            range.endContainer = endPos.node;
            range.endOffset = endPos.offset;
            range.collapsed = api.rangeIsCollapsed(range.nativeRange);

            // Check for consistency between WrappedRange boundaries being equal and underlying TextRange collapsedness
            var boundariesEqual = startPos.equals(endPos);
            if (boundariesEqual != range.collapsed) {
                throw new Error("Inconsistent Range data: wrapped TextRange collapsed is " + range.collapsed +
                        " but boundaries equal is " + boundariesEqual);
            }

            range.commonAncestorContainer = api.dom.getCommonAncestor(range.startContainer, range.endContainer);
        }

        var rangeProto;

        if (api.features.rangesAreTextRanges) {
            var s2s = 0, s2e = 1, e2e = 2, e2s = 3;

            WrappedRange.START_TO_START = s2s;
            WrappedRange.START_TO_END = s2e;
            WrappedRange.END_TO_END = e2e;
            WrappedRange.END_TO_START = e2s;

            var textRangeComparisonTypes = {
                0: "StartToStart",
                1: "StartToEnd",
                2: "EndToEnd",
                3: "EndToStart"
            };

            rangeProto = WrappedRange.prototype = {
                START_TO_START: s2s,
                START_TO_END: s2e,
                END_TO_END: e2e,
                END_TO_START: e2s,

                init: function(range, startPos, endPos) {
                    this.nativeRange = range;
                    this.isTextRange = true;
                    this.isDomRange = false;
                    updateTextRangeProperties(this, startPos, endPos);
                },

                setStart: function(node, offset) {
                    var startPos = new DomPosition(node, offset), endPos = null;
                    if (api.setRangeStart(this.nativeRange, node, offset)) {
                        endPos = startPos;
                    }
                    updateTextRangeProperties(this, startPos, endPos);
                },

                setEnd: function(node, offset) {
                    var startPos = null, endPos = new DomPosition(node, offset);
                    if (api.setRangeEnd(this.nativeRange, node, offset)) {
                        startPos = endPos;
                    }
                    updateTextRangeProperties(this, startPos, endPos);
                },

                setStartBefore: function(node) {
                    this.setStart(node.parentNode, api.dom.getNodeIndex(node));
                },

                setStartAfter: function(node) {
                    this.setStart(node.parentNode, api.dom.getNodeIndex(node) + 1);
                },

                setEndBefore: function(node) {
                    this.setEnd(node.parentNode, api.dom.getNodeIndex(node));
                },

                setEndAfter: function(node) {
                    this.setEnd(node.parentNode, api.dom.getNodeIndex(node) + 1);
                },

                collapse: function(isStart) {
                    var prefix = isStart ? "start" : "end";
                    var pos = new DomPosition(this[prefix + "Container"], this[prefix + "Offset"]);
                    this.nativeRange.collapse(isStart);
                    updateTextRangeProperties(this, pos, pos);
                },

                selectNode: function(node) {
                    this.setEndAfter(node);
                    this.setStartBefore(node);
                },

                selectNodeContents: function(node) {
                    // Use TextRange's moveToElementText where possible
                    if (node.nodeType == 1) {
                        this.nativeRange.moveToElementText(node);
                        updateTextRangeProperties(this, new DomPosition(node, 0), new DomPosition(node, node.childNodes.length));
                    } else if (node.nodeType == 3) {
                        this.setEnd(node, node.length);
                        this.setStart(node, 0);
                    } else {
                        this.setEndAfter(node, node.childNodes.length);
                        this.setStartBefore(node, 0);
                    }
                },

                insertNode: function(node) {
                    api.dom.insertNode(node, new DomPosition(this.startContainer, this.startOffset));
                    var newStartPos = new DomPosition(node, 0);
                    updateTextRangeProperties(this, newStartPos, newStartPos);
                },

                cloneRange: function() {
                    return new WrappedRange(this.nativeRange.duplicate(),
                        new DomPosition(this.startContainer, this.startOffset),
                        new DomPosition(this.endContainer, this.endOffset));
                },

                toString: function() {
                    return this.nativeRange.text;
                },

                detach: function() {
                    this.detached = true;
                    var i = domRangeDynamicProperties.length, prop;
                    while (i--) {
                        prop = domRangeDynamicProperties[i];
                        this[prop] = null;
                    }
                }
            };

            (function() {
                // Test for existence of sourceIndex property in elements
                var elementsHaveSourceIndex = (typeof document.body.sourceIndex != "undefined");

                function insertElement(node, offset) {
                    var span = api.dom.getDocument(node).createElement("span");
                    if (api.dom.isDataNode(node)) {
                        node.parentNode.insertBefore(span, node);
                    } else if (offset >= node.childNodes.length) {
                        node.appendChild(span);
                    } else {
                        node.insertBefore(span, node.childNodes[offset]);
                    }
                    return span;
                }

                rangeProto.compareBoundaryPoints = function(type, range, useNativeComparison) {
                    var returnVal;

                    if (useNativeComparison || !elementsHaveSourceIndex) {
                        // TODO: Test this carefully, since we don't have as precise control over boundaries in IE
                        // A node-based comparison may be better.
                        returnVal = this.nativeRange.compareEndPoint(textRangeComparisonTypes[type], range.nativeRange || range);
                    } else {
                        range = range.nativeRange ? range : new WrappedRange(range);

                        var node1, offset1, node2, offset2;
                        var prefix1 = (type == s2e || type == s2s) ? "start" : "end";
                        var prefix2 = (type == e2s || type == s2s) ? "start" : "end";
                        node1 = this[prefix1 + "Container"];
                        offset1 = this[prefix1 + "Offset"];
                        node2 = range[prefix2 + "Container"];
                        offset2 = range[prefix2 + "Offset"];

                        if (node1 === node2) {
                            returnVal = (offset1 === offset2) ? 0 : ((offset1 > offset2) ? 1 : -1);
                        } else if (node1.parentNode === node2.parentNode) {
                            returnVal = (api.dom.getNodeIndex(node1) > api.dom.getNodeIndex(node2)) ? 1 : -1;
                        } else {
                            // Add temporary elements immediately prior to each node and the compare their sourceIndexes
                            var span1 = insertElement(node1, offset1);
                            var span2 = insertElement(node2, offset2);
                            returnVal = (span1.sourceIndex > span2.sourceIndex) ? 1 : -1;
                            span1.parentNode.removeChild(span1);
                            span2.parentNode.removeChild(span2);
                        }
                    }
                    return returnVal;
                };

            })();
        } else {
            rangeProto = WrappedRange.prototype = {
                init: function(range) {
                    this.nativeRange = range;
                    this.isTextRange = false;
                    this.isDomRange = true;
                    updateRangeProperties(this);
                },

                setStart: function(node, offset) {
                    this.nativeRange.setStart(node, offset);
                    updateRangeProperties(this);
                },

                setEnd: function(node, offset) {
                    this.nativeRange.setEnd(node, offset);
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
                    return new WrappedRange(this.nativeRange.cloneRange());
                },

                toString: function() {
                    return this.nativeRange.toString();
                },

                detach: function() {
                    this.nativeRange.detach();
                    this.detached = true;
                    var i = domRangeDynamicProperties.length, prop;
                    while (i--) {
                        prop = domRangeDynamicProperties[i];
                        this[prop] = null;
                    }
                }
            };

            if (api.features.canSetRangeStartAfterEnd) {
                rangeProto.setStartBefore = function(node) {
                    this.nativeRange.setStartBefore(node);
                    updateRangeProperties(this);
                };

                rangeProto.setStartAfter = function(node) {
                    this.nativeRange.setStartAfter(node);
                    updateRangeProperties(this);
                };

                rangeProto.setEndBefore = function(node) {
                    this.nativeRange.setEndBefore(node);
                    updateRangeProperties(this);
                };

                rangeProto.setEndAfter = function(node) {
                    this.nativeRange.setEndAfter(node);
                    updateRangeProperties(this);
                };
            } else {
                rangeProto.setStartBefore = function(node) {
                    try {
                        this.nativeRange.setStartBefore(node);
                    } catch (ex) {
                        this.nativeRange.setEndBefore(node);
                        this.nativeRange.setStartBefore(node);
                    }
                    updateRangeProperties(this);
                };

                rangeProto.setStartAfter = function(node) {
                    try {
                        this.nativeRange.setStartAfter(node);
                    } catch (ex) {
                        this.nativeRange.setEndAfter(node);
                        this.nativeRange.setStartAfter(node);
                    }
                    updateRangeProperties(this);
                };

                rangeProto.setEndBefore = function(node) {
                    try {
                        this.nativeRange.setEndBefore(node);
                    } catch (ex) {
                        this.nativeRange.setStartBefore(node);
                        this.nativeRange.setEndBefore(node);
                    }
                    updateRangeProperties(this);
                };

                rangeProto.setEndAfter = function(node) {
                    try {
                        this.nativeRange.setEndAfter(node);
                    } catch (ex) {
                        this.nativeRange.setStartAfter(node);
                        this.nativeRange.setEndAfter(node);
                    }
                    updateRangeProperties(this);
                };

            }
        }

        // Add useful non-standard extensions
        rangeProto.intersectsNode = function(node) {
            return api.rangeIntersectsNode(this, node);
        };

        rangeProto.intersectsRange = function(range) {
            return api.rangesIntersect(this, range);
        };

        rangeProto.isEqual = function(range) {
            return this.startContainer === range.startContainer &&
                   this.startOffset === range.startOffset &&
                   this.endContainer === range.endContainer &&
                   this.endOffset === range.endOffset;
        };

        rangeProto.select = function() {
            api.selectSingleRange(api.getSelection(api.dom.getWindow(this.startContainer)), this.nativeRange);
        };


        api.getRangySelection = function(win) {
            return new WrappedSelection(win);
        };

        api.createRangyRange = function(doc) {
            return new WrappedRange(api.createRange(doc));
        };
    });

    /*----------------------------------------------------------------------------------------------------------------*/

    return api;
})();