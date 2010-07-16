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

    function nodeToString(node) {
        return isCharacterDataNode(node) ? '"' + node.data + '"' : node.nodeName;
    }

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

    function getEndOffset(node) {
        return isCharacterDataNode(node) ? node.length : node.childNodes.length;
    }

    function cloneSubtree(iterator) {
        var partiallySelected;
        for (var node, frag = document.createDocumentFragment(); node = iterator.next(); ) {
            partiallySelected = iterator.isPartiallySelected();
            log.debug("cloneSubtree got node " + nodeToString(node) + " from iterator. partiallySelected: " + partiallySelected);
            node = node.cloneNode(!partiallySelected);
            if (partiallySelected) {
                node.appendChild(cloneSubtree(iterator.getSubtreeIterator()));
            }
            frag.appendChild(node);
        }
        return frag;
    }

    function iterateSubtree(iterator, func) {
        var partiallySelected;
        for (var node; node = iterator.next(); ) {
            partiallySelected = iterator.isPartiallySelected();
            log.debug("iterateSubtree got node " + nodeToString(node) + " from iterator. partiallySelected: " + partiallySelected);
            func(node);
            iterateSubtree(iterator.getSubtreeIterator(), func);
        }
    }

    function deleteSubtree(iterator) {
        while (iterator.next()) {
            iterator.isPartiallySelected() ? deleteSubtree(iterator.getSubtreeIterator()) : iterator.remove();
        }
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

        _detached: false,

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
            updateBoundaries(this, node, 0, node, getEndOffset(node));
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
            var iterator = new RangeIterator(this);
            var clone = cloneSubtree(iterator);
            iterator.detach();
            return clone;
        },

        extractContents: function() {
            // TODO: Implement this
            //return cloneSubtree(new RangeIterator(this));
        },

        deleteContents: function() {
            var iterator = new RangeIterator(this);
            var clone = deleteSubtree(iterator);
            iterator.detach();
            // TODO: Move range to correct location
        },

        detach: function() {
            this._detached = true;
            this._doc = this.startContainer = this.startOffset = this.endContainer = this.endOffset = null;
            this.collapsed = this.commonAncestorContainer = null;
        },

        toString: function() {
            var textBits = [], iterator = new RangeIterator(this);
            iterateSubtree(iterator, function(node) {
                if (isCharacterDataNode(node)) {
                    textBits.push(node.data);
                }
            });
            iterator.detach();
            return textBits.join("");
        },

        // The methods below are all non-standard. The following batch were introduced by Mozilla but have since been
        // removed.

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

            if (this.sc !== this.ec || !isCharacterDataNode(this.sc)) {
                this._next = (this.sc == root && !isCharacterDataNode(this.sc)) ?
                    this.sc.childNodes[this.so] : getClosestAncestorIn(this.sc, root, true);
                this._end = (this.ec == root && !isCharacterDataNode(this.ec)) ?
                    this.ec.childNodes[this.eo] : getClosestAncestorIn(this.ec, root, true).nextSibling;
            }
        }
    }

    RangeIterator.prototype = {
        _current: null,
        _next: null,
        _end: null,

        hasNext: function() {
            return !!this._next;
        },

        next: function() {
            // Move to next node
            var sibling, current = this._current = this._next;
            if (current) {
                sibling = current.nextSibling;
                this._next = (sibling !== this._end) ? sibling : null;

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

            if (isCharacterDataNode(this._current) && (current === this.sc || current === this.ec)) {
                start = (current === this.sc) ? this.so : 0;
                end = (current === this.ec) ? this.eo : current.length;
                current.deleteData(start, end - start);
            } else {
                current.parentNode.removeChild(current);
            }
        },

        // Checks if the current node is partially selected
        isPartiallySelected: function() {
            var current = this._current;
            return !isCharacterDataNode(current) &&
                (isAncestorOf(current, this.sc, true) || isAncestorOf(current, this.ec, true));
        },

        getSubtreeIterator: function() {
            var subRange = new Range(this.range._doc), current = this._current;
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
            return new RangeIterator(subRange);
        },

        detach: function() {
            this.range = this._current = this._next = this._end = this.sc = this.so = this.ec = this.eo = null;
        }
    };

    Range.RangeIterator = RangeIterator;

    return Range;
})();