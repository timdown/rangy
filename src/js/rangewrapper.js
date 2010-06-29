(function() {
    function WrappedRange(range, isTextRange) {
        this.nativeRange = range;
        this.isTextRange = isTextRange;
    }

    WrappedRange.prototype = {
    };

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
    
})();