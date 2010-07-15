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
        log.debug("getClosestAncestorIn");
        var p, n = selfIsAncestor ? node : node.parentNode;
        while (n) {
            p = n.parentNode;
            if (p === ancestor) {
                return n;
            }
            n = p;
        }
        return null;
    }

    function isCharacterDataNode(node) {
        var t = node.nodeType;
        return t == 3 || t == 4; // Text or CData
    }
    
    function nodeHasStringOffset(node) {
        var t = node.nodeType;
        return t == 3 || t == 4 || t == 7 || t == 8; // Text, CData, Processing Instruction or Comment
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
            log.debug("case 3", offsetB, getNodeIndex(nodeC), nodeB.innerHTML, nodeC.innerHTML);
            // Case 3: node C (container A or an ancestor) is a child node of B
            return offsetB >= getNodeIndex(nodeC) ? -1 : 1;
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


    // Updates commonAncestorContainer and collapsed after boundary change
    function updateCollapsedAndCommonAncestor(range) {
        range.collapsed = (range.startContainer === range.endContainer && range.startOffset === range.endOffset);
        range.commonAncestorContainer = getCommonAncestor(range.startContainer, range.endContainer);
    }

    function dispatchEvent(range, type, args) {
        for (var i = 0, len = range._listeners.length; i < len; ++i) {
            range._listeners[type][i].call(range, {target: range, args: args});
        }
    }

    /*
     TODO: Add getters/setters/object property attributes for startContainer etc that prevent setting and check for
     detachedness
      */


    Range.prototype = {
        START_TO_START: s2s,
        START_TO_END: s2e,
        END_TO_END: e2e,
        END_TO_START: e2s,

        setStart: function(node, offset) {
            log.debug("setStart");
            if (node !== this.startContainer || offset !== this.startOffset) {
                var endMoved = false;
                this.startContainer = node;
                this.startOffset = offset;

                log.info("Point comparison: " + comparePoints(node, offset, this.endContainer, this.endOffset)  );
                if (comparePoints(node, offset, this.endContainer, this.endOffset) == 1) {
                    endMoved = true;
                    this.endContainer = node;
                    this.endOffset = offset;
                }
                updateCollapsedAndCommonAncestor(this);
                dispatchEvent(this, "boundarychange", {startMoved: true, endMoved: endMoved});
            }
        },

        setEnd: function(node, offset) {
            log.debug("setEnd");
            if (node !== this.endContainer || offset !== this.endOffset) {
                var startMoved = false;
                this.endContainer = node;
                this.endOffset = offset;

                log.info("Point comparison: " + comparePoints(node, offset, this.startContainer, this.startOffset));
                if (comparePoints(node, offset, this.startContainer, this.startOffset) == -1) {
                    startMoved = true;
                    this.startContainer = node;
                    this.startOffset = offset;
                }
                updateCollapsedAndCommonAncestor(this);
                dispatchEvent(this, "boundarychange", {startMoved: startMoved, endMoved: true});
            }
        }
    };

    /*----------------------------------------------------------------------------------------------------------------*/



    function RangeIterator(range) {
        this.range = range;
        
    }

    RangeIterator.prototype = {
        current: null,
        next: null,
        end: null



    };

    Range.RangeIterator = RangeIterator;

    return Range;
})();