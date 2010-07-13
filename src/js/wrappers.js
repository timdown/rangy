rangy.addInitListener(function(api) {
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

    var updateRangeProperties = api.features.rangesAreTextRanges ?
        // Allow calling code to provide start and end positions if known, to minimize expensive calls to getRangeStart
        // and getRangeEnd
        function(range, startPos, endPos) {
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
        } :

        function(range) {
            var i = domRangeDynamicProperties.length, prop;
            while (i--) {
                prop = domRangeDynamicProperties[i];
                range[prop] = range.nativeRange[prop];
            }
        };

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

        function splitNode(node, offset, ancestor) {
            if (api.dom.isDataNode(node)) {
                
            }
        }

        rangeProto = WrappedRange.prototype = {
            START_TO_START: s2s,
            START_TO_END: s2e,
            END_TO_END: e2e,
            END_TO_START: e2s,

            init: function(range, startPos, endPos) {
                this.nativeRange = range;
                this.isTextRange = true;
                this.isDomRange = false;
                updateRangeProperties(this, startPos, endPos);
            },

            setStart: function(node, offset) {
                var startPos = new DomPosition(node, offset), endPos = null;
                if (api.setRangeStart(this.nativeRange, node, offset)) {
                    endPos = startPos;
                }
                updateRangeProperties(this, startPos, endPos);
            },

            setEnd: function(node, offset) {
                var startPos = null, endPos = new DomPosition(node, offset);
                if (api.setRangeEnd(this.nativeRange, node, offset)) {
                    startPos = endPos;
                }
                updateRangeProperties(this, startPos, endPos);
            },

            collapse: function(isStart) {
                var prefix = isStart ? "start" : "end";
                var pos = new DomPosition(this[prefix + "Container"], this[prefix + "Offset"]);
                this.nativeRange.collapse(isStart);
                updateRangeProperties(this, pos, pos);
            },

            selectNode: function(node) {
                this.setEndAfter(node);
                this.setStartBefore(node);
            },

            selectNodeContents: function(node) {
                // Use TextRange's moveToElementText where possible
                if (node.nodeType == 1) {
                    this.nativeRange.moveToElementText(node);
                    updateRangeProperties(this, new DomPosition(node, 0), new DomPosition(node, node.childNodes.length));
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
                updateRangeProperties(this, newStartPos, newStartPos);
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
    }

    // Add methods with common implementations

    rangeProto.setStartBefore = function(node) {
        this.setStart(node.parentNode, api.dom.getNodeIndex(node));
    };

    rangeProto.setStartAfter = function(node) {
        this.setStart(node.parentNode, api.dom.getNodeIndex(node) + 1);
    };

    rangeProto.setEndBefore = function(node) {
        this.setEnd(node.parentNode, api.dom.getNodeIndex(node));
    };

    rangeProto.setEndAfter = function(node) {
        this.setEnd(node.parentNode, api.dom.getNodeIndex(node) + 1);
    };


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