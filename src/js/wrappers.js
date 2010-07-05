rangy.addInitListener(function(api) {
    function WrappedSelection(win) {
        this.nativeSelection = api.getSelection(win);
        this.init();
    }

    var selProto = WrappedSelection.prototype = {
        init: function() {
            var sel = this.nativeSelection;
            if (api.features.selectionsHaveAnchorAndFocus) {
                this.anchorNode = sel.anchorNode;
                this.anchorOffset = sel.anchorOffset;
                this.focusNode = sel.focusNode;
                this.focusOffset = sel.focusOffset;
            } else {
                var range = api.getFirstSelectionRange(sel);
                var start = api.getRangeStart(range), end = api.getRangeEnd(range);
                this.anchorNode = start.node;
                this.anchorOffset = start.offset;
                this.focusNode = end.node;
                this.focusOffset = end.offset;
            }
            this.isCollapsed = api.selectionIsCollapsed(sel);
            this.rangeCount = api.getRangeCount(sel);
        }
    };


    var testSelection = api.getSelection();

    // Test range count after adding two ranges




    function WrappedRange(range) {
        this.nativeRange = range;
        this.isDomRange = !api.rangesAreTextRanges;
        this.isTextRange = api.rangesAreTextRanges;
    }


});