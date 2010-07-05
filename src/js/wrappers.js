rangy.addInitListener(function(api) {
    var domRangeProperties = api.features.domRangeProperties;

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
        var i = domRangeProperties.length, prop;
        while (i--) {
            prop = domRangeProperties[i];
            range[prop] = range.nativeRange[prop];
        }
    }

    function updateTextRangeProperties(range, startPos, endPos) {
        //startPos = startPos || 

    }

    var rangeProto = WrappedRange.prototype = api.features.rangesAreTextRanges ?
        {
            init: function(range) {
                this.nativeRange = this;
                this.isTextRange = true;
                this.isDomRange = false;
                updateTextRangeProperties(this);
            }

        } :

        {
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