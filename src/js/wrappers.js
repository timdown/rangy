rangy.addInitListener(function(api) {
    var domRangeDynamicProperties = ["startContainer", "startOffset", "endContainer", "endOffset", "collapsed",
        "commonAncestorContainer"];

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

    var selProto = WrappedSelection.prototype = {
        init: function() {
            var sel = this.nativeSelection;
            updateAnchorAndFocus(this, sel);
            this.isCollapsed = api.selectionIsCollapsed(sel);
            this.rangeCount = api.getRangeCount(sel);
        }
    };


    var testSelection = api.getSelection();

    // Test range count after adding two ranges




    function WrappedRange(range) {
        this.init(range);
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
        startPos = startPos || api.getRangeStart(range);
        endPos = endPos || api.getRangeEnd(range);

        range.startContainer = startPos.node;
        range.startOffset = startPos.offset;
        range.endContainer = endPos.node;
        range.endOffset = endPos.offset;
        range.collapsed = api.rangeIsCollapsed(range);
        range.commonAncestorContainer = api.dom.getCommonAncestor(range.startContainer, range.endContainer);
    }

    var rangeProto;

    if (api.features.rangesAreTextRanges) {
        WrappedRange.START_TO_START = 0;
        WrappedRange.START_TO_END = 1;
        WrappedRange.END_TO_END = 2;
        WrappedRange.END_TO_START = 3;

        rangeProto = WrappedRange.prototype = {
            START_TO_START: WrappedRange.START_TO_START,
            START_TO_END: WrappedRange.START_TO_END,
            END_TO_END: WrappedRange.END_TO_END,
            END_TO_START: WrappedRange.END_TO_START,

            init: function(range) {
                this.nativeRange = this;
                this.isTextRange = true;
                this.isDomRange = false;
                updateTextRangeProperties(this, null, null);
            },

            setStart: function(node, offset) {
                var startPos = new api.dom.DomPosition(node, offset), endPos = null;
                if (api.setRangeStart(this.nativeRange, node, offset)) {
                    endPos = startPos;
                }
                updateTextRangeProperties(this, startPos, endPos);
            },

            setEnd: function(node, offset) {
                var startPos = null, endPos = new api.dom.DomPosition(node, offset);
                if (api.setRangeEnd(this.nativeRange, node, offset)) {
                    startPos = endPos;
                }
                updateTextRangeProperties(this, startPos, endPos);
            }
        };
    } else {
        rangeProto = WrappedRange.prototype = {
            init: function(range) {
                this.nativeRange = this;
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
                var i = domRangeProperties.length, prop;
                while (i--) {
                    prop = domRangeProperties[i];
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
                    this.nativeRange.setEndAfter()(node);
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



});