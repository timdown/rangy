var DomRange = (function() {

    var log = log4javascript.getLogger("Range");

    // Utility functions

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

    function getNodeIndex(node) {
        var i = 0;
        while( (node = node.previousSibling) ) {
            i++;
        }
        return i;
    }

    function getCommonAncestor(node1, node2) {
        log.debug("getCommonAncestor");
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

    // TODO: Add check for contains() and use it when present
    function isAncestorOf(ancestor, descendant, selfIsAncestor) {
        var n = selfIsAncestor ? descendant : descendant.parentNode;
        while (n) {
            if (n === ancestor) {
                return true;
            } else {
                n = n.parentNode;
            }
        }
        return false;
    }

    function getClosestAncestorIn(node, ancestor, selfIsAncestor) {
        log.debug("getClosestAncestorIn", nodeToString(node), nodeToString(ancestor), selfIsAncestor);
        var p, n = selfIsAncestor ? node : node.parentNode;
        while (n) {
            p = n.parentNode;
            if (p === ancestor) {
                log.debug("getClosestAncestorIn returning " + nodeToString(node));
                return n;
            }
            n = p;
        }
        log.debug("getClosestAncestorIn returning null");
        return null;
    }

    function isCharacterDataNode(node) {
        var t = node.nodeType;
        return t == 3 || t == 4 || t == 8 ; // Text, CDataSection or Comment
    }

    function nodeToString(node) {
        if (!node) { return "No node"; }
        return isCharacterDataNode(node) ? '"' + node.data + '"' : node.nodeName;
    }

    function insertAfter(node, precedingNode) {
        var nextNode = precedingNode.nextSibling, parent = precedingNode.parentNode;
        if (nextNode) {
            parent.insertBefore(node, nextNode);
        } else {
            parent.appendChild(node);
        }
        return node;
    }

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


/*
    function nodeHasStringOffset(node) {
        var t = node.nodeType;
        return t == 3 || t == 4 || t == 7 || t == 8; // Text, CDataSection, Processing Instruction or Comment
    }
*/


    function comparePoints(nodeA, offsetA, nodeB, offsetB) {
        // See http://www.w3.org/TR/DOM-Level-2-Traversal-Range/ranges.html#Level-2-Range-Comparing
        var nodeC, root, childA, childB, n;
        if (nodeA == nodeB) {
            log.debug("case 1");
            // Case 1: nodes are the same
            return offsetA === offsetB ? 0 : (offsetA < offsetB) ? -1 : 1;
        } else if ( (nodeC = getClosestAncestorIn(nodeB, nodeA, true)) ) {
            log.debug("case 2");
            // Case 2: node C (container B or an ancestor) is a child node of A
            return offsetA <= getNodeIndex(nodeC) ? -1 : 1;
        } else if ( (nodeC = getClosestAncestorIn(nodeA, nodeB, true)) ) {
            log.debug("case 3");
            // Case 3: node C (container A or an ancestor) is a child node of B
            return getNodeIndex(nodeC) < offsetB  ? -1 : 1;
        } else {
            log.debug("case 4");
            // Case 4: containers are siblings or descendants of siblings
            root = getCommonAncestor(nodeA, nodeB);
            childA = (nodeA === root) ? root : getClosestAncestorIn(nodeA, root, true);
            childB = (nodeB === root) ? root : getClosestAncestorIn(nodeB, root, true);

            if (childA === childB) {
                // This shouldn't be possible
                log.warn("comparePoints got to case 4 and childA and childB are the same!", nodeA, offsetA, nodeB, offsetB);
                throw new Error("comparePoints got to case 4 and childA and childB are the same!");
            } else {
                n = root.firstChild;
                while (n) {
                    if (n === childA) {
                        return -1;
                    } else if (n === childB) {
                        return 1;
                    }
                    n = n.nextSibling;
                }
                throw new Error("Should not be here!");
            }
        }
    }

    function dispatchEvent(range, type, args) {
        for (var i = 0, len = range._listeners.length; i < len; ++i) {
            range._listeners[type][i].call(range, {target: range, args: args});
        }
    }

    // Updates commonAncestorContainer and collapsed after boundary change
    function updateCollapsedAndCommonAncestor(range) {
        range.collapsed = (range.startContainer === range.endContainer && range.startOffset === range.endOffset);
        range.commonAncestorContainer = range.collapsed ?
            range.startContainer : getCommonAncestor(range.startContainer, range.endContainer);
    }

    function Boundary(node, offset) {
        this.node = node;
        this.offset = offset;
    }

    function updateBoundaries(range, startContainer, startOffset, endContainer, endOffset) {
        var startMoved = (range.startContainer !== startContainer || range.startOffset !== startOffset);
        var endMoved = (range.endContainer !== endContainer || range.endOffset !== endOffset);

        range.startContainer = startContainer;
        range.startOffset = startOffset;
        range.endContainer = endContainer;
        range.endOffset = endOffset;


        updateCollapsedAndCommonAncestor(range);
        dispatchEvent(range, "boundarychange", {startMoved: startMoved, endMoved: endMoved});
    }

    function getBoundaryBeforeNode(node) {
        return new Boundary(node.parentNode, getNodeIndex(node));
    }

    function getBoundaryAfterNode(node) {
        return new Boundary(node.parentNode, getNodeIndex(node) + 1);
    }

    function getEndOffset(node) {
        return isCharacterDataNode(node) ? node.length : (node.childNodes ? node.childNodes.length : 0);
    }

    function insertNodeAtPosition(node, n, o) {
        if (isCharacterDataNode(n)) {
            if (o == n.length) {
                n.parentNode.appendChild(node);
            } else {
                n.parentNode.insertBefore(node, o == 0 ? n : splitDataNode(n, o));
            }
        } else if (o >= n.childNodes.length) {
            n.appendChild(node);
        } else {
            n.insertBefore(node, n.childNodes[o]);
        }
        return node;
    }

    function cloneSubtree(iterator) {
        var partiallySelected;
        for (var node, frag = getRangeDocument(iterator.range).createDocumentFragment(), subIterator; node = iterator.next(); ) {
            partiallySelected = iterator.isPartiallySelectedSubtree();
            log.debug("cloneSubtree got node " + nodeToString(node) + " from iterator. partiallySelected: " + partiallySelected);
            node = node.cloneNode(!partiallySelected);
            if (partiallySelected) {
                subIterator = iterator.getSubtreeIterator();
                node.appendChild(cloneSubtree(subIterator));
                subIterator.detach(true);
            }

            if (node.nodeType == 10) { // DocumentType
                throw new DOMException("HIERARCHY_REQUEST_ERR");
            }
            frag.appendChild(node);
        }
        return frag;
    }

    function iterateSubtree(iterator, func) {
        var partiallySelected;
        for (var node, subIterator; node = iterator.next(); ) {
            partiallySelected = iterator.isPartiallySelectedSubtree();
            log.debug("iterateSubtree got node " + nodeToString(node) + " from iterator. partiallySelected: " + partiallySelected);
            func(node);
            subIterator = iterator.getSubtreeIterator();
            iterateSubtree(subIterator, func);
            subIterator.detach(true);
        }
    }

    function deleteSubtree(iterator) {
        var subIterator;
        while (iterator.next()) {
            if (iterator.isPartiallySelectedSubtree()) {
                subIterator = iterator.getSubtreeIterator();
                deleteSubtree(subIterator);
                subIterator.detach(true);
            } else {
                iterator.remove();
            }
        }
    }

    function extractSubtree(iterator) {
        log.debug("extract on iterator", iterator);
        for (var node, frag = getRangeDocument(iterator.range).createDocumentFragment(), subIterator; node = iterator.next(); ) {
            log.debug("extractSubtree got node " + nodeToString(node) + " from iterator. partiallySelected: " + iterator.isPartiallySelectedSubtree());

            if (iterator.isPartiallySelectedSubtree()) {
                node = node.cloneNode(false);
                subIterator = iterator.getSubtreeIterator();
                node.appendChild(extractSubtree(subIterator));
                subIterator.detach(true);
            } else {
                iterator.remove();
            }
            if (node.nodeType == 10) { // DocumentType
                throw new DOMException("HIERARCHY_REQUEST_ERR");
            }
            frag.appendChild(node);
        }
        return frag;
    }

    function createRangeContentRemover(remover) {
        return function() {
            assertNotDetached(this);

            var sc = this.startContainer, so = this.startOffset, root = this.commonAncestorContainer;

            var iterator = new RangeIterator(this);

            // Work out where to position the range after content removal
            var node, boundary;
            if (sc !== root) {
                node = getClosestAncestorIn(sc, root, true);
                boundary = getBoundaryAfterNode(node);
                sc = boundary.node;
                so = boundary.offset;
            }

            // Check none of the range is read-only
            iterateSubtree(iterator, function(node) {
                if (getReadonlyAncestor(node, true)) {
                    throw new DOMException("NO_MODIFICATION_ALLOWED_ERR");
                }
            });

            iterator.reset();

            // Remove the content
            var returnValue = remover(iterator);
            iterator.detach();

            // TODO: Test this moves the range to the correct location
            // Move to the new position
            updateBoundaries(this, sc, so, sc, so);

            return returnValue;
        };
    }

    function createBeforeAfterNodeSetter(isBefore, isStart) {
        return function(node) {
            assertNotDetached(this);
            assertValidNodeType(node, beforeAfterNodeTypes);
            assertValidNodeType(getRootContainer(node), rootContainerNodeTypes);

            var boundary = (isBefore ? getBoundaryBeforeNode : getBoundaryAfterNode)(node);
            (isStart ? setRangeStart : setRangeEnd)(this, boundary.node, boundary.offset);
        };
    }

    function isNonTextPartiallySelected(node, range) {
        return (node.nodeType != 3) &&
               (isAncestorOf(node, range.startContainer, true) || isAncestorOf(node, range.endContainer, true));
    }

    function setRangeStart(range, node, offset) {
        var ec = range.endContainer, eo = range.endOffset;
        if (node !== range.startContainer || offset !== this.startOffset) {
            // Check the root containers of the range and the new boundary, and also check whether the new boundary
            // is after the current end. In either case, collapse the range to the new position
            if (getRootContainer(node) != getRootContainer(ec) || comparePoints(node, offset, ec, eo) == 1) {
                ec = node;
                eo = offset;
            }
            updateBoundaries(range, node, offset, ec, eo);
        }
    }

    function setRangeEnd(range, node, offset) {
        var sc = range.startContainer, so = range.startOffset;
        if (node !== range.endContainer || offset !== this.endOffset) {
            // Check the root containers of the range and the new boundary, and also check whether the new boundary
            // is after the current end. In either case, collapse the range to the new position
            if (getRootContainer(node) != getRootContainer(sc) || comparePoints(node, offset, sc, so) == -1) {
                sc = node;
                so = offset;
            }
            updateBoundaries(range, sc, so, node, offset);
        }
    }

    var beforeAfterNodeTypes = [1, 3, 4, 5, 7, 8, 10];
    var rootContainerNodeTypes = [2, 9, 11];
    var readonlyNodeTypes = [5, 6, 10, 12];
    var insertableNodeTypes = [1, 3, 4, 5, 7, 8, 10, 11];
    var surroundNodeTypes = [1, 3, 4, 5, 7, 8];

    function createAncestorFinder(nodeTypes) {
        return function(node, selfIsAncestor) {
            var t, n = selfIsAncestor ? node : node.parentNode;
            while (n) {
                t = n.nodeType;
                if (arrayContains(nodeTypes, t)) {
                    return n;
                }
                n = n.parentNode;
            }
            return null;
        };
    }


    function getRootContainer(node) {
        var parent;
        while ( (parent = node.parentNode) ) {
            node = parent;
        }
        return node;
    }

    var getDocumentOrFragmentContainer = createAncestorFinder( [9, 11] );
    var getReadonlyAncestor = createAncestorFinder(readonlyNodeTypes);
    var getDocTypeNotationEntityAncestor = createAncestorFinder( [6, 10, 12] );

    function assertNoDocTypeNotationEntityAncestor(node, allowSelf) {
        if (getDocTypeNotationEntityAncestor(node, allowSelf)) {
            throw new RangeException("INVALID_NODE_TYPE_ERR");
        }
    }

    function assertNotDetached(range) {
        if (range._detached) {
            throw new DOMException("INVALID_STATE_ERR");
        }
    }


    function assertValidNodeType(node, invalidTypes) {
        if (!arrayContains(invalidTypes, node.nodeType)) {
            throw new RangeException("INVALID_NODE_TYPE_ERR");
        }
    }

    function assertValidOffset(node, offset) {
        if (offset < 0 || offset > (isCharacterDataNode(node) ? node.length : node.childNodes.length)) {
            throw new DOMException("INDEX_SIZE_ERR");
        }
    }

    function assertSameDocumentOrFragment(node1, node2) {
        if (getDocumentOrFragmentContainer(node1, true) !== getDocumentOrFragmentContainer(node2, true)) {
            throw new DOMException("WRONG_DOCUMENT_ERR");
        }
    }

    function getDocument(node) {
        if (node.nodeType == 9) {
            return node;
        } else if (typeof node.ownerDocument != "undefined") {
            return node.ownerDocument;
        } else if (typeof node.document != "undefined") {
            return node.document;
        } else if (node.parentNode) {
            return getDocument(node.parentNode);
        } else {
            throw new Error("getDocument: no document found for node");
        }
    }

    function getRangeDocument(range) {
        assertNotDetached(range);
        return getDocument(range.startContainer);
    }

    /*----------------------------------------------------------------------------------------------------------------*/

    // Exceptions

    var DOMExceptionCodes = {
        INDEX_SIZE_ERR: 1,
        HIERARCHY_REQUEST_ERR: 3,
        WRONG_DOCUMENT_ERR: 4,
        NO_MODIFICATION_ALLOWED_ERR: 7,
        NOT_FOUND_ERR: 8,
        INVALID_STATE_ERR: 11
    };

    function DOMException(codeName) {
        this.code = DOMExceptionCodes[codeName];
        this.codeName = codeName;
    }

    DOMException.prototype = DOMExceptionCodes;

    DOMException.prototype.toString = function() {
        return "DOMException: " + this.codeName;
    };

    var RangeExceptionCodes = {
        BAD_BOUNDARYPOINTS_ERR: 1,
        INVALID_NODE_TYPE_ERR: 2
    };

    function RangeException(codeName) {
        this.code = RangeExceptionCodes[codeName];
        this.codeName = codeName;
    }

    RangeException.prototype = RangeExceptionCodes;

    RangeException.prototype.toString = function() {
        return "RangeException: " + this.codeName;
    };

    /*----------------------------------------------------------------------------------------------------------------*/

    function Range(doc) {
        this.startContainer = doc;
        this.startOffset = 0;
        this.endContainer = doc;
        this.endOffset = 0;
        this._listeners = {
            boundarychange: [],
            detach: []
        };
        updateCollapsedAndCommonAncestor(this);
    }

    var s2s = 0, s2e = 1, e2e = 2, e2s = 3;
    var rangeProperties = ["startContainer", "startOffset", "endContainer", "endOffset", "collapsed",
        "commonAncestorContainer"];
    var n_b = 0, n_a = 1, n_b_a = 2, n_i = 3;

    Range.START_TO_START = s2s;
    Range.START_TO_END = s2e;
    Range.END_TO_END = e2e;
    Range.END_TO_START = e2s;

    Range.NODE_BEFORE = n_b;
    Range.NODE_AFTER = n_a;
    Range.NODE_BEFORE_AND_AFTER = n_b_a;
    Range.NODE_INSIDE = n_i;

    /*
     TODO: Add getters/setters/object property attributes for startContainer etc that prevent setting and check for detachedness
     TODO: Add feature tests for DOM methods used: document.createDocumentFragment, deleteData, cloneNode, splitText
      */

    Range.prototype = {
        START_TO_START: s2s,
        START_TO_END: s2e,
        END_TO_END: e2e,
        END_TO_START: e2s,

        NODE_BEFORE: n_b,
        NODE_AFTER: n_a,
        NODE_BEFORE_AND_AFTER: n_b_a,
        NODE_INSIDE: n_i,

        _detached: false,

        setStart: function(node, offset) {
            assertNotDetached(this);
            assertNoDocTypeNotationEntityAncestor(node, true);
            assertValidOffset(node, offset);

            setRangeStart(this, node, offset);
        },

        setEnd: function(node, offset) {
            assertNotDetached(this);
            assertNoDocTypeNotationEntityAncestor(node, true);
            assertValidOffset(node, offset);

            setRangeEnd(this, node, offset);
        },

        setStartBefore: createBeforeAfterNodeSetter(true, true),
        setStartAfter: createBeforeAfterNodeSetter(false, true),
        setEndBefore: createBeforeAfterNodeSetter(true, false),
        setEndAfter: createBeforeAfterNodeSetter(false, false),

        collapse: function(isStart) {
            assertNotDetached(this);
            if (isStart) {
                updateBoundaries(this, this.startContainer, this.startOffset, this.startContainer, this.startOffset);
            } else {
                updateBoundaries(this, this.endContainer, this.endOffset, this.endContainer, this.endOffset);
            }
        },

        selectNodeContents: function(node) {
            // This doesn't seem well specified: the spec talks only about selecting the node's contents, which
            // could be taken to mean only its children. However, browsers implement this the same as selectNode for
            // text nodes, so I shall do likewise
            assertNotDetached(this);
            assertNoDocTypeNotationEntityAncestor(node, true);

            updateBoundaries(this, node, 0, node, getEndOffset(node));
        },

        selectNode: function(node) {
            assertNotDetached(this);
            assertNoDocTypeNotationEntityAncestor(node, false);
            assertValidNodeType(node, beforeAfterNodeTypes);

            var start = getBoundaryBeforeNode(node), end = getBoundaryAfterNode(node);
            updateBoundaries(this, start.node, start.offset, end.node, end.offset);
        },

        compareBoundaryPoints: function(how, range) {
            assertNotDetached(this);
            assertSameDocumentOrFragment(this.startContainer, range.startContainer);

            var nodeA, offsetA, nodeB, offsetB;
            var prefixA = (how == e2s || how == s2s) ? "start" : "end";
            var prefixB = (how == s2e || how == s2s) ? "start" : "end";
            nodeA = this[prefixA + "Container"];
            offsetA = this[prefixA + "Offset"];
            nodeB = range[prefixB + "Container"];
            offsetB = range[prefixB + "Offset"];
            return comparePoints(nodeA, offsetA, nodeB, offsetB);
        },

        insertNode: function(node) {
            assertNotDetached(this);
            assertValidNodeType(node, insertableNodeTypes);

            if (getReadonlyAncestor(this.startContainer)) {
                throw new DOMException("NO_MODIFICATION_ALLOWED_ERR");
            }

            if (isAncestorOf(node, this.startContainer, true)) {
                throw new DOMException("HIERARCHY_REQUEST_ERR");
            }

            // TODO: Add check for whether the container of the start of the Range is of a type that does not allow
            // children of the type of node

            //console.log(nodeToString(this.startContainer), nodeToString(this.endContainer));
            insertNodeAtPosition(node, this.startContainer, this.startOffset);
            //console.log(nodeToString(this.startContainer), nodeToString(this.endContainer));
            this.setStartBefore(node);
            //console.log(nodeToString(this.startContainer), nodeToString(this.endContainer));
        },

        cloneContents: function() {
            assertNotDetached(this);

            var clone, frag;
            if (this.collapsed) {
                return getRangeDocument(this).createDocumentFragment();
            } else {
                if (this.startContainer === this.endContainer && isCharacterDataNode(this.startContainer)) {
                    clone = this.startContainer.cloneNode(true);
                    clone.data = clone.data.slice(this.startOffset, this.endOffset);
                    frag = getRangeDocument(this).createDocumentFragment();
                    frag.appendChild(clone);
                    return frag;
                } else {
                    var iterator = new RangeIterator(this);
                    clone = cloneSubtree(iterator);
                    iterator.detach();
                }
                return clone;
            }
        },

        extractContents: createRangeContentRemover(extractSubtree),

        deleteContents: createRangeContentRemover(deleteSubtree),

        surroundContents: function(node) {
            // TODO: Check boundary containers are not readonly
            // TODO: Check start container allows children of the type of the node about to be added

            assertNotDetached(this);
            assertValidNodeType(node, surroundNodeTypes);

            var iterator = new RangeIterator(this);

            // Check if the contents can be surrounded. Specifically, this means whether the range partially selects no
            // non-text nodes.
            if ((iterator._first && (isNonTextPartiallySelected(iterator._first, this)) ||
                    (iterator._last && isNonTextPartiallySelected(iterator._last, this)))) {
                iterator.detach();
                throw new RangeException("BAD_BOUNDARYPOINTS_ERR");
            }

            // Extract the contents
            var content = extractSubtree(iterator);
            iterator.detach();

            // Clear the children of the node
            if (node.hasChildNodes()) {
                while (node.lastChild) {
                    node.removeChild(node.lastChild);
                }
            }

            // Insert the new node and add the extracted contents
            insertNodeAtPosition(node, this.startContainer, this.startOffset);
            node.appendChild(content);

            this.selectNode(node);
        },

        cloneRange: function() {
            assertNotDetached(this);
            var range = new Range(getRangeDocument(this));
            var i = rangeProperties.length, prop;
            while (i--) {
                prop = rangeProperties[i];
                range[prop] = this[prop];
            }
            return range;
        },

        detach: function() {
            assertNotDetached(this);
            this._detached = true;
            this.startContainer = this.startOffset = this.endContainer = this.endOffset = null;
            this.collapsed = this.commonAncestorContainer = null;
        },

        toString: function() {
            assertNotDetached(this);
            var sc = this.startContainer;
            if (sc === this.endContainer && isCharacterDataNode(sc)) {
                return (sc.nodeType == 3 || sc.nodeType == 4) ? sc.data.slice(this.startOffset, this.endOffset) : "";
            } else {
                var textBits = [], iterator = new RangeIterator(this);
                log.info("toString iterator: " + nodeToString(iterator._first) + ", " + nodeToString(iterator._last));
                iterateSubtree(iterator, function(node) {
                    // Accept only text or CDATA nodes
                    log.info("toString: got node", nodeToString(node));
                    if (node.nodeType == 2) {
                        log.info("Got attr: ", node);
                    }
                    if (node.nodeType == 3 || node.nodeType == 4) {
                        textBits.push(node.data);
                    }
                });
                iterator.detach();
                return textBits.join("");
            }
        },

        // The methods below are all non-standard. The following batch were introduced by Mozilla but have since been
        // removed.

        compareNode: function(node) {
            var parent = node.parentNode;
            var nodeIndex = getNodeIndex(node);

            if (!parent) {
                throw new DOMException("NOT_FOUND_ERR");
            }

            var startComparison = comparePoints(parent, nodeIndex, this.startContainer, this.startOffset),
                endComparison = comparePoints(parent, nodeIndex + 1, this.endContainer, this.endOffset);

            if (startComparison < 0) { // Node starts before
                return (endComparison > 0) ? n_b_a : n_b;
            } else {
                return (endComparison > 0) ? n_a : n_i;
            }
        },

        comparePoint: function(node, offset) {
            if (!node) {
                throw new DOMException("HIERARCHY_REQUEST_ERR");
            }
            assertSameDocumentOrFragment(node, this.startContainer);

            if (comparePoints(node, offset, this.startContainer, this.startOffset) < 0) {
                return -1;
            } else if (comparePoints(node, offset, this.endContainer, this.endOffset) > 0) {
                return 1;
            }
            return 0;
        },

        createContextualFragment: function(str) {

        },

        intersectsNode: function(node) {

        },

        isPointInRange: function(node, offset) {

        },

        // The methods below are non-standard and invented by me.
        createIterator: function(filter, splitEnds) {

        },

        getNodes: function(filter, splitEnds) {
            var nodes = [], iterator = new RangeIterator(this);
            iterateSubtree(iterator, function(node) {
                if (!filter || filter(node)) {
                    nodes.push(node);
                }
            });
            iterator.detach();
            return nodes;
        }
    };



/*
    function() {
        function createGetter(propName) {
            return function() {
                if (this._detached) {
                    throw new DOMException("INVALID_STATE_ERR");
                }
                return this["_" + propName];
            }
        }

        function setter() {
            throw new Error("This property is read-only");
        }


        var i = rangeProperties.length;
        if (typeof Object.defineProperty == "function") {
            // ECMAScript 5
            while (i--) {
                Object.defineProperty(Range.prototype, rangeProperties[i], {
                    get: createGetter(rangeProperties[i])
                });
            }
        } else if (Range.prototype.__defineGetter__ && Range.prototype.__defineSetter__) {
            while (i--) {
                Range.prototype.__defineGetter__(rangeProperties[i], createGetter(rangeProperties[i]));
                Range.prototype.__defineSetter__(rangeProperties[i], setter);
            }
        }
    }
*/



    /*----------------------------------------------------------------------------------------------------------------*/


    // RangeIterator code indebted to IERange by Tim Ryan (http://github.com/timcameronryan/IERange)

    function RangeIterator(range) {
        this.range = range;

        log.info("New RangeIterator ", nodeToString(range.startContainer), range.startOffset, nodeToString(range.endContainer), range.endOffset);

        if (!range.collapsed) {
            this.sc = range.startContainer;
            this.so = range.startOffset;
            this.ec = range.endContainer;
            this.eo = range.endOffset;
            var root = range.commonAncestorContainer;

            if (this.sc === this.ec && isCharacterDataNode(this.sc)) {
                this.isSingleCharacterDataNode = true;
                this._first = this._last = this.sc;
            } else {
                this._first = this._next = (this.sc == root && !isCharacterDataNode(this.sc)) ?
                    this.sc.childNodes[this.so] : getClosestAncestorIn(this.sc, root, true);
                this._last = (this.ec == root && !isCharacterDataNode(this.ec)) ?
                    this.ec.childNodes[this.eo] : getClosestAncestorIn(this.ec, root, true).nextSibling;
            }
        }
    }

    RangeIterator.prototype = {
        _current: null,
        _next: null,
        _first: null,
        _last: null,
        isSingleCharacterDataNode: false,

        reset: function() {
            this._current = null;
            this._next = this._first;
        },

        hasNext: function() {
            return !!this._next;
        },

        next: function() {
            // Move to next node
            var sibling, current = this._current = this._next;
            if (current) {
                this._next = (current !== this._last) ? current.nextSibling : null;

                // Check for partially selected text nodes
                if (isCharacterDataNode(current)) {
                    if (current === this.ec) {
                        (current = current.cloneNode(true)).deleteData(this.eo, current.length - this.eo);
                    }
                    if (this._current === this.sc) {
                        (current = current.cloneNode(true)).deleteData(0, this.so);
                    }
                }
            }

            return current;
        },

        remove: function() {
            var current = this._current, start, end;

            if (isCharacterDataNode(current) && (current === this.sc || current === this.ec)) {
                start = (current === this.sc) ? this.so : 0;
                end = (current === this.ec) ? this.eo : current.length;
                if (start != end) {
                    current.deleteData(start, end - start);
                }
            } else {
                current.parentNode.removeChild(current);
            }
        },

        // Checks if the current node is partially selected
        isPartiallySelectedSubtree: function() {
            var current = this._current;
            return isNonTextPartiallySelected(current, this.range);
        },

        getSubtreeIterator: function() {
            var subRange;
            if (this.isSingleCharacterDataNode) {
                subRange = this.range.cloneRange();
                subRange.collapse();
            } else {
                subRange = new Range(getRangeDocument(this.range));
                var current = this._current;
                var startContainer = current, startOffset = 0, endContainer = current, endOffset = getEndOffset(current);

                if (isAncestorOf(current, this.sc, true)) {
                    startContainer = this.sc;
                    startOffset = this.so;
                }
                if (isAncestorOf(current, this.ec, true)) {
                    endContainer = this.ec;
                    endOffset = this.eo;
                }

                updateBoundaries(subRange, startContainer, startOffset, endContainer, endOffset);
            }
            return new RangeIterator(subRange);
        },

        detach: function(detachRange) {
            if (detachRange) {
                this.range.detach();
            }
            this.range = this._current = this._next = this._first = this._last = this.sc = this.so = this.ec = this.eo = null;
        }
    };

    Range.RangeIterator = RangeIterator;

    return Range;
})();