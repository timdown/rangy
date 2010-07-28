rangy.createModule("WrappedSelection", function(api, module) {
    // This will create a selection object wrapper that follows the HTML5 draft spec selections section
    // (http://dev.w3.org/html5/spec/editing.html#selection) and adds convenience extensions

    api.requireModules( ["DomRange", "WrappedRange"] );

    var dom = api.dom;
    var util = api.util;
    var DomRange = api.DomRange;
    var WrappedRange = api.WrappedRange;

    var getSelection, getRangeCount;

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
        module.fail("No means of obtaining a selection object")
    }

    api.getNativeSelection = getSelection;

    function WrappedSelection(selection) {
        this.nativeSelection = selection;
        this.rangeCount = getRangeCount(this);
    }

    api.getSelection = function(win) {
        return new WrappedSelection(getSelection(win));
    };

    var selProto = WrappedSelection.prototype;
    var testSelection = getSelection();
    var testRange = api.createNativeRange(document);

    // Selecting a range
    if (util.areHostMethods(testSelection, ["removeAllRanges", "addRange"])) {
        selProto.removeAllRanges = function() {
            this.nativeSelection.removeAllRanges();
            this.rangeCount = 0;
        };

        selProto.addRange = function(range) {
            this.nativeSelection.addRange(range.nativeRange || range);
            this.rangeCount++;
        };
    } else if (util.isHostMethod(testSelection, "empty") && util.isHostMethod(testRange, "select")) {
        selProto.removeAllRanges = function() {
            this.nativeSelection.empty();
            this.rangeCount = 0;
        };

        selProto.addRange = function(range) {
            WrappedRange.rangeToTextRange(range).select();
            this.rangeCount = 1;
        };
    } else {
        module.fail("No means of selecting a Range or TextRange was found");
        return false;
    }

    // Obtaining a range from a selection
    var selectionHasAnchorAndFocus = util.areHostObjects(testSelection, [
        "anchorNode", "focusNode", "anchorOffset", "focusOffset"
    ]);

    api.features.selectionHasAnchorAndFocus = selectionHasAnchorAndFocus;

    if (util.isHostMethod(testSelection, "getRangeAt") && typeof testSelection.rangeCount == "number") {
        selProto.getRangeAt = function(index) {
            return (this.nativeSelection.rangeCount == 0) ?
                   null : new WrappedRange(this.nativeSelection.getRangeAt(index));
        };

        getRangeCount = function(sel) {
            return sel.nativeSelection.rangeCount;
        };
    } else if (util.isHostMethod(testSelection, "createRange")) {
        selProto.getRangeAt = function(index) {
            if (index == 0) {
                var range = this.nativeSelection.createRange();
                if (this.nativeSelection.type == "Text") {
                    return new WrappedRange(range);
                } else {
                    // ??
                    // TODO: Do something about control ranges

                }
            } else {
                throw new Error("Range index out of bounds (range count: 1)");
            }
        };

        getRangeCount = function(sel) {
            return (sel.nativeSelection.type == "None") ? 0 : 1;
        };
    } else if (selectionHasAnchorAndFocus && typeof testRange.collapsed == "boolean" &&
            typeof testSelection.isCollapsed == "boolean" && api.features.implementsDomRange) {

        selProto.getRangeAt = function(index) {
            if (index == 0) {
                var sel = this.nativeSelection;
                var doc = dom.getDocument(sel.anchorNode);
                var range = api.createRange(doc);
                range.setStart(sel.anchorNode, sel.anchorOffset);
                range.setEnd(sel.focusNode, sel.focusOffset);

                // Handle the case when the selection was selected backwards (from the end to the start in the
                // document)
                if (range.collapsed !== sel.isCollapsed) {
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
    } else {
        module.fail("No means of obtaining a Range or TextRange from the user's selection was found");
        return false;
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

/*

    // Selection collapsedness
    if (typeof testSelection.isCollapsed == BOOLEAN) {
        selectionIsCollapsed = function(sel) {
            return sel.isCollapsed;
        };
    } else {
        selectionIsCollapsed = function(sel) {
            return rangeIsCollapsed(getFirstSelectionRange(sel));
        };
    }

    api.selectionIsCollapsed = selectionIsCollapsed;

    // Selection text
    if (isHostMethod(testSelection, "toString")) {
        getSelectionText = function(sel) {
            return "" + sel;
        };
    } else {
        getSelectionText = function(sel) {
            var ranges = getAllSelectionRanges(sel);
            var rangeTexts = [];
            for (var i = 0, len = ranges.length; i < len; ++i) {
                rangeTexts[i] = getRangeText(ranges[i]);
            }
            return rangeTexts.join("");
        };
    }


    api.createNativeRange = function(doc) {
        if (rangy.features.implementsDomRange) {
            return doc.createRange();
        } else if (rangy.features.implementsTextRange) {
            return doc.body.createTextRange();
        }
    };

    api.createRange = function(doc) {
        return new WrappedRange(api.createNativeRange(doc));
    };

    api.createRangyRange = function(doc) {
        return new DomRange(doc);
    };
*/

    selProto.getAllRanges = function() {
        var ranges = [];
        for (var i = 0; i < this.rangeCount; ++i) {
            ranges[i] = this.getRangeAt(i);
        }
        return ranges;
    };




});