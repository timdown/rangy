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
        log.debug("getClosestAncestorIn", node.nodeName, ancestor.nodeName, selfIsAncestor);
        var p, n = selfIsAncestor ? node : node.parentNode;
        while (n) {
            p = n.parentNode;
            log.debug(p ? p.nodeName : "null", n.nodeName);
            if (p === ancestor) {
                return n;
            }
            n = p;
        }
        return null;
    }

    function isCharacterDataNode(node) {
        var t = node.nodeType;
        return t == 3 || t == 4 || t == 8 ; // Text, CDataSection or Comment
    }

    function nodeHasStringOffset(node) {
        var t = node.nodeType;
        return t == 3 || t == 4 || t == 7 || t == 8; // Text, CDataSection, Processing Instruction or Comment
    }


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



    /*----------------------------------------------------------------------------------------------------------------*/

    function Range(doc) {
        this._doc = doc;
        this.startContainer = doc;
        this.startOffset = 0;
        this.endContainer = doc;
        this.endOffset = 0;
        this._listeners = {
            boundarychange: [],
            detach: []
        };
        this._detached = false;
        updateCollapsedAndCommonAncestor(this);
    }

    var s2s = 0, s2e = 1, e2e = 2, e2s = 3;

    Range.START_TO_START = s2s;
    Range.START_TO_END = s2e;
    Range.END_TO_END = e2e;
    Range.END_TO_START = e2s;

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

    function cloneSubtree(iterator) {
        for (var node, frag = document.createDocumentFragment(); node = iterator.next(); ) {
            node = node.cloneNode(!iterator.hasPartiallySelectedSubtree());
            if (iterator.hasPartiallySelectedSubtree()) {
                node.appendChild(cloneSubtree(iterator.getSubtreeIterator()));
            }
            frag.appendChild(node);
        }
        return frag;
    }


    /*
     TODO: Add getters/setters/object property attributes for startContainer etc that prevent setting and check for detachedness
     TODO: Add feature tests for DOM methods used: document.createDocumentFragment, deleteData, cloneNode
      */

    Range.prototype = {
        START_TO_START: s2s,
        START_TO_END: s2e,
        END_TO_END: e2e,
        END_TO_START: e2s,

        setStart: function(node, offset) {
            log.debug("setStart");
            var endContainer = this.endContainer, endOffset = this.endOffset;
            if (node !== this.startContainer || offset !== this.startOffset) {
                if (comparePoints(node, offset, this.endContainer, this.endOffset) == 1) {
                    endContainer = node;
                    endOffset = offset;
                }
                updateBoundaries(this, node, offset, endContainer, endOffset);
            }
        },

        setEnd: function(node, offset) {
            log.debug("setEnd");
            var startContainer = this.startContainer, startOffset = this.startOffset;
            if (node !== this.endContainer || offset !== this.endOffset) {
                if (comparePoints(node, offset, this.startContainer, this.startOffset) == -1) {
                    startContainer = node;
                    startOffset = offset;
                }
                updateBoundaries(this, startContainer, startOffset, node, offset);
            }
        },

        setStartBefore: function(node) {
            var boundary = getBoundaryBeforeNode(node);
            this.setStart(boundary.node, boundary.offset);
        },

        setStartAfter: function(node) {
            var boundary = getBoundaryAfterNode(node);
            this.setStart(boundary.node, boundary.offset);
        },

        setEndBefore: function(node) {
            var boundary = getBoundaryBeforeNode(node);
            this.setEnd(boundary.node, boundary.offset);
        },

        setEndAfter: function(node) {
            var boundary = getBoundaryAfterNode(node);
            this.setEnd(boundary.node, boundary.offset);
        },

        selectNodeContents: function(node) {
            // This doesn't seem well specified: the spec talks only about selecting the node's contents, which
            // could be taken to mean only its children. However, browsers implement this the same as selectNode for
            // text nodes, so I shall do likewise
            var endOffset = isCharacterDataNode(node) ? node.length : node.childNodes.length;
            updateBoundaries(this, node, 0, node, endOffset);
        },

        selectNode: function(node) {
            var start = getBoundaryBeforeNode(node), end = getBoundaryAfterNode(node);
            updateBoundaries(this, start.node, start.offset, end.node, end.offset);
        },

        compareBoundaryPoints: function(how, range) {
            var nodeA, offsetA, nodeB, offsetB;
            var prefixA = (how == e2s || how == s2s) ? "start" : "end";
            var prefixB = (how == s2e || how == s2s) ? "start" : "end";
            nodeA = this[prefixA + "Container"];
            offsetA = this[prefixA + "Offset"];
            nodeB = range[prefixB + "Container"];
            offsetB = range[prefixB + "Offset"];
            return comparePoints(nodeA, offsetA, nodeB, offsetB);
        },

        cloneContents: function() {
            // clone subtree
            return cloneSubtree(new RangeIterator(this));
        }
    };

    /*----------------------------------------------------------------------------------------------------------------*/



    function RangeIterator(range) {
        this.range = range;
        if (!range.collapsed) {
            this.sc = range.startContainer;
            this.so = range.startOffset;
            this.ec = range.endContainer;
            this.eo = range.endOffset;
            var root = range.commonAncestorContainer;

            this._next = (this.sc == root && !isCharacterDataNode(this.sc)) ?
                this.sc.childNodes[this.so] : getClosestAncestorIn(this.sc, root, true);
            this._end = (this.ec == root && !isCharacterDataNode(this.ec)) ?
                this.ec.childNodes[this.eo] : getClosestAncestorIn(this.ec, root, true).nextSibling;
        }
    }

    RangeIterator.prototype = {
        _current: null,
        _next: null,
        _end: null,

        hasNext: function () {
            return !!this._next;
        },

        next: function () {
            // Move to next node
            var sibling, current = this._current = this._next;
            if (current) {
                sibling = current.nextSibling;
                this._next = (sibling != this._end) ? sibling : null;

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

        remove: function () {
            var current = this._current, start, end;

            if (isCharacterDataNode(this._current) && (current === this.sc || current === this.ec)) {
                start = (current === this.sc) ? this.so : 0;
                end = (current === this.ec) ? this.eo : current.length;
                current.deleteData(start, end - start);
            } else {
                current.parentNode.removeChild(current);
            }
        },

        // Checks if the current node is partially selected
        hasPartiallySelectedSubtree: function () {
            var current = this._current;
            return !isCharacterDataNode(current) &&
                (isAncestorOf(current, this.sc, true) || isAncestorOf(current, this.ec, true));
        },

        getSubtreeIterator: function () {
            var subRange = new Range(this.range._doc);
            subRange.selectNodeContents(this._current);

            if (isAncestorOf(this._current, this.sc, true)) {
                subRange.setStart(this.sc, this.so);
            }
            if (isAncestorOf(this._current, this.ec, true)) {
                subRange.setEnd(this.ec, this.range.eo);
            }
            return new RangeIterator(subRange);
        }
    };

    Range.RangeIterator = RangeIterator;

    return Range;
})();