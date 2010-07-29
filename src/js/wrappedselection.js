rangy.createModule("WrappedSelection", function(api, module) {
    // This will create a selection object wrapper that follows the HTML5 draft spec selections section
    // (http://dev.w3.org/html5/spec/editing.html#selection) and adds convenience extensions

    api.requireModules( ["DomRange", "WrappedRange"] );

    var BOOLEAN = "boolean";
    var dom = api.dom;
    var util = api.util;
    var DomRange = api.DomRange;
    var WrappedRange = api.WrappedRange;

    var getSelection, getRangeCount, selectionIsCollapsed;

    // Test for the Range/TextRange and Selection features required
    // Test for ability to retrieve selection
    if (api.util.isHostMethod(window, "getSelection")) {
        getSelection = function(winParam) {
            return (winParam || window).getSelection();
        };
    } else if (api.util.isHostObject(document, "selection")) {
        getSelection = function(winParam) {
            return ((winParam || window).document.selection);
        };
    } else {
        module.fail("No means of obtaining a selection object");
    }

    api.getNativeSelection = getSelection;

    var testSelection = getSelection();
    var testRange = api.createNativeRange(document);

    // Obtaining a range from a selection
    var selectionHasAnchorAndFocus = util.areHostObjects(testSelection, [
        "anchorNode", "focusNode", "anchorOffset", "focusOffset"
    ]);

    api.features.selectionHasAnchorAndFocus = selectionHasAnchorAndFocus;

    // Selection collapsedness
    if (typeof testSelection.isCollapsed == BOOLEAN) {
        selectionIsCollapsed = function(sel) {
            return sel.nativeSelection.isCollapsed;
        };
    } else if (selectionHasAnchorAndFocus) {
        selectionIsCollapsed = function(sel) {
            return sel.anchorNode === sel.focusNode && sel.anchorOffset === sel.focusOffset;
        };
    } else {
        selectionIsCollapsed = function(sel) {
            return sel.rangeCount ? sel.getRangeAt(0).collapsed : false;
        };
    }

    function updateAnchorAndFocus(sel, range) {
        sel.anchorNode = range.startContainer;
        sel.anchorOffset = range.startOffset;
        sel.focusNode = range.endContainer;
        sel.focusOffset = range.endOffset;
    }

    function updateAnchorAndFocusFromNative(sel) {
        var n = sel.nativeSelection;
        sel.anchorNode = n.startContainer;
        sel.anchorOffset = n.startOffset;
        sel.focusNode = n.endContainer;
        sel.focusOffset = n.endOffset;
    }

    function updateEmptySelection(sel) {
        sel.anchorNode = sel.focusNode = null;
        sel.anchorOffset = sel.focusOffset = 0;
        sel.rangeCount = 0;
    }

    function WrappedSelection(selection) {
        this.nativeSelection = selection;
        this.rangeCount = getRangeCount(this);

        if (selectionHasAnchorAndFocus) {
            updateAnchorAndFocusFromNative(this);
        } else {
            if (this.rangeCount) {
                var range = this.getRangeAt(0);
                updateAnchorAndFocus(this, range);
            } else {
                updateEmptySelection(this);
            }
        }

        this.isCollapsed = selectionIsCollapsed(this);
    }

    api.getSelection = function(win) {
        return new WrappedSelection(getSelection(win));
    };

    var selProto = WrappedSelection.prototype;

    // Selecting a range
    if (util.areHostMethods(testSelection, ["removeAllRanges", "addRange"])) {
        selProto.removeAllRanges = function() {
            this.nativeSelection.removeAllRanges();
            updateEmptySelection(this);
        };

        selProto.addRange = function(range) {
            this.nativeSelection.addRange(range.nativeRange || range);
            updateAnchorAndFocusFromNative(this);
            this.rangeCount = getRangeCount(this);
        };
    } else if (util.isHostMethod(testSelection, "empty") && util.isHostMethod(testRange, "select")) {
        selProto.removeAllRanges = function() {
            this.nativeSelection.empty();
            updateEmptySelection(this);
        };

        selProto.addRange = function(range) {
            WrappedRange.rangeToTextRange(range).select();
            this.rangeCount = 1;
            updateAnchorAndFocus(this, range);
        };
    } else {
        module.fail("No means of selecting a Range or TextRange was found");
        return false;
    }

    if (util.isHostMethod(testSelection, "getRangeAt") && typeof testSelection.rangeCount == "number") {
        selProto.getRangeAt = function(index) {
            return (this.nativeSelection.rangeCount == 0) ?
                   null : new WrappedRange(this.nativeSelection.getRangeAt(index));
        };

        getRangeCount = function(sel) {
            return sel.nativeSelection.rangeCount;
        };
    } else if (selectionHasAnchorAndFocus && typeof testRange.collapsed == BOOLEAN &&
               api.features.implementsDomRange) {

        selProto.getRangeAt = function(index) {
            if (index == 0) {
                var sel = this.nativeSelection;
                var doc = dom.getDocument(sel.anchorNode);
                var range = api.createRange(doc);
                range.setStart(sel.anchorNode, sel.anchorOffset);
                range.setEnd(sel.focusNode, sel.focusOffset);

                // Handle the case when the selection was selected backwards (from the end to the start in the
                // document)
                if (range.collapsed !== this.isCollapsed) {
                    range.setStart(sel.focusNode, sel.focusOffset);
                    range.setEnd(sel.anchorNode, sel.anchorOffset);
                }

                return range;
            } else {
                throw new Error("Range index out of bounds (range count: 1)");
            }
        };

        getRangeCount = function(sel) {
            return (sel.nativeSelection.anchorNode === null) ? 0 : 1;
        };
    } else if (util.isHostMethod(testSelection, "createRange") && api.features.implementsTextRange) {
        selProto.getRangeAt = function(index) {
            if (index == 0) {
                var range = this.nativeSelection.createRange(), selectionType = this.nativeSelection.type;
                log.debug("getRangeAt found selection type: " + selectionType);
                if (range && (selectionType == "Text" || selectionType == "None")) {
                    var wrappedRange = new WrappedRange(range);

                    // Next line is to work round a problem with the TextRange-to-DOM Range code in the case where a
                    // range boundary falls within a preformatted text node containing line breaks: the original
                    // TextRange is altered in the process, so if it was selected, the selection changes and we need to
                    // create a new TextRange and select it
                    WrappedRange.rangeToTextRange(wrappedRange).select();
                    return wrappedRange;
                } else if (this.nativeSelection.type == "Control") {
                    // We do nothing with ControlRanges, which don't naturally fit with the DOM Ranges. You could view
                    // a selected Control Range as a selection containing multiple Ranges, each spanning an element,
                    // but these Ranges should then be immutable.
                    throw new DOMException("INDEX_SIZE_ERR");
                }
            } else if (index < 0 || index >= this.rangeCount) {
                throw new DOMException("INDEX_SIZE_ERR");
            }
        };

        getRangeCount = function(sel) {
            // ControlRanges are ignored. See comment above for getRangeAt.
            return (sel.nativeSelection.type == "Text") ? 1 : 0;
        };
    } else {
        module.fail("No means of obtaining a Range or TextRange from the user's selection was found");
        return false;
    }

    // Removal of a single range
    if (util.isHostMethod(testSelection, "removeRange")) {
        selProto.removeRange = function(range) {
            this.nativeSelection.removeRange(range);
            updateAnchorAndFocusFromNative(this);
            this.rangeCount = getRangeCount(this);
        };
    } else {
        selProto.removeRange = function(range) {
            var ranges = this.getAllRanges(), removed = false;
            this.removeAllRanges();
            for (var i = 0, len = ranges.length; i < len; ++i) {
                if (removed || ranges[i] !== range) {
                    this.addRange(ranges[i]);
                } else {
                    // According to the HTML 5 spec, the same range may be added to the selection multiple times.
                    // removeRange should only remove the first instance, so the following ensures only the first
                    // instance is removed
                    removed = true;
                }
            }
        };
    }

    // Detecting if a selection is backwards
    if (selectionHasAnchorAndFocus && api.features.implementsDomRange) {
        selProto.isBackwards = function() {
            var sel = this.nativeSelection, backwards = false;
            if (sel.anchorNode) {
                backwards = (dom.comparePoints(sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset) == 1);
            }
            return backwards;
        };
    } else {
        selProto.isBackwards = function() {
            return false;
        };
    }

    // Selection text
    if (util.isHostMethod(testSelection, "toString")) {
        selProto.toString = function() {
            return "" + this.nativeSelection;
        };
    } else {
        selProto.toString = function() {
            var rangeTexts = [];
            for (var i = 0, len = this.rangeCount; i < len; ++i) {
                rangeTexts[i] = "" + this.getRangeAt(i);
            }
            return rangeTexts.join("");
        };
    }

    if (util.isHostMethod(testSelection, "collapse")) {
        selProto.collapse = function(node, offset) {
            this.nativeSelection.collapse(node, offset);
            updateAnchorAndFocusFromNative(this);
            this.rangeCount = getRangeCount(this);
        };
    } else {
        selProto.collapse = function(node, offset) {
            if (this.anchorNode && (dom.getDocument(this.anchorNode) !== dom.getDocument(node))) {
                throw new DOMException("WRONG_DOCUMENT_ERR");
            }
            var range = api.createRange(dom.getDocument(node));
            range.setStart(node, offset);
            range.collapse(true);
            this.removeAllRanges();
            this.addRange(range);
        };
    }

    if (util.isHostMethod(testSelection, "collapseToStart")) {
        selProto.collapseToStart = function() {
            this.nativeSelection.collapseToStart();
            updateAnchorAndFocusFromNative(this);
            this.rangeCount = getRangeCount(this);
        };
    } else {
        selProto.collapseToStart = function() {
            if (this.rangeCount) {
                var range = this.getRangeAt(0);
                range.collapse(true);
                this.removeAllRanges();
                this.addRange(range);
            } else {
                throw new DOMException("INVALID_STATE_ERR");
            }
        };
    }

    if (util.isHostMethod(testSelection, "collapseToEnd")) {
        selProto.collapseToEnd = function() {
            this.nativeSelection.collapseToEnd();
            updateAnchorAndFocusFromNative(this);
            this.rangeCount = getRangeCount(this);
        };
    } else {
        selProto.collapseToEnd = function() {
            if (this.rangeCount) {
                var range = this.getRangeAt(this.rangeCount - 1);
                range.collapse(false);
                this.removeAllRanges();
                this.addRange(range);
            } else {
                throw new DOMException("INVALID_STATE_ERR");
            }
        };
    }

    if (util.isHostMethod(testSelection, "selectAllChildren")) {
        selProto.selectAllChildren = function(node) {
            this.nativeSelection.selectAllChildren(node);
            updateAnchorAndFocusFromNative(this);
            this.rangeCount = getRangeCount(this);
        };
    } else {
        selProto.selectAllChildren = function(node) {
            if (this.anchorNode && (dom.getDocument(this.anchorNode) !== dom.getDocument(node))) {
                throw new DOMException("WRONG_DOCUMENT_ERR");
            }
            var range = api.createRange(dom.getDocument(node));
            range.selectNodeContents(node);
            if (dom.isCharacterDataNode(node)) {
                range.collapse(true);
            }
            this.removeAllRanges();
            this.addRange(range);
        };
    }

    if (util.isHostMethod(testSelection, "deleteFromDocument")) {
        selProto.deleteFromDocument = function() {
            this.nativeSelection.deleteFromDocument();
            updateAnchorAndFocusFromNative(this);
            this.rangeCount = getRangeCount(this);
        };
    } else {
        selProto.deleteFromDocument = function() {
            if (this.rangeCount) {
                var ranges = this.getAllRanges();
                this.removeAllRanges();
                for (var i = 0, len = ranges.length; i < len; ++i) {
                    ranges[i].deleteContents();
                }
                // Firefox moves the selection to where the final selected range was, so we emulate that
                this.addRange(ranges[len - 1]);
            }
        };
    }

    // The following are non-standard extensions

    // TODO: Investigate Mozilla extensions containsNode, extend, [not modify - too hard], selectionLanguageChange

    // Thes two are mine, added for convenience
    selProto.getAllRanges = function() {
        var ranges = [];
        for (var i = 0; i < this.rangeCount; ++i) {
            ranges[i] = this.getRangeAt(i);
        }
        return ranges;
    };

    selProto.setRanges = function(ranges) {
        this.removeAllRanges();
        for (var i = 0, len = ranges.length; i < len; ++i) {
            this.addRange(ranges[i]);
        }
    };
});