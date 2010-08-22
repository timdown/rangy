rangy.createModule("WrappedSelection", function(api, module) {
    // This will create a selection object wrapper that follows the HTML5 draft spec selections section
    // (http://dev.w3.org/html5/spec/editing.html#selection) and adds convenience extensions

    api.requireModules( ["DomRange", "WrappedRange"] );

    var BOOLEAN = "boolean";
    var dom = api.dom;
    var util = api.util;
    var DomRange = api.DomRange;
    var WrappedRange = api.WrappedRange;
    var DOMException = dom.DOMException;

    var getSelection, selectionIsCollapsed;

    var log = log4javascript.getLogger("rangy.WrappedSelection");

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
    var selectionHasAnchorAndFocus = util.areHostObjects(testSelection, ["anchorNode", "focusNode"] &&
                                     util.areHostProperties(testSelection, ["anchorOffset", "focusOffset"]));

    api.features.selectionHasAnchorAndFocus = selectionHasAnchorAndFocus;

    // ControlRanges
    var selectionHasType = util.isHostProperty(testSelection, "type");
    var implementsControlRange = false, testControlRange;

    if (util.isHostObject(document, "body") && util.isHostMethod(document.body, "createControlRange")) {
        testControlRange = document.body.createControlRange();
        if (util.areHostProperties(testControlRange, ["item", "add"])) {
            implementsControlRange = true;
        }
    }
    api.features.implementsControlRange = implementsControlRange;

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

    function updateAnchorAndFocusFromRange(sel, range) {
        sel.anchorNode = range.startContainer;
        sel.anchorOffset = range.startOffset;
        sel.focusNode = range.endContainer;
        sel.focusOffset = range.endOffset;
    }

    function updateAnchorAndFocusFromNativeSelection(sel) {
        var n = sel.nativeSelection;
        sel.anchorNode = n.anchorNode;
        sel.anchorOffset = n.anchorOffset;
        sel.focusNode = n.focusNode;
        sel.focusOffset = n.focusOffset;
    }

    function updateEmptySelection(sel) {
        sel.anchorNode = sel.focusNode = null;
        sel.anchorOffset = sel.focusOffset = 0;
        sel.rangeCount = 0;
        sel.isCollapsed = true;
    }

    function getNativeRange(range) {
        var nativeRange;
        if (range instanceof DomRange) {
            nativeRange = range._selectionNativeRange;
            if (!nativeRange) {
                nativeRange = api.createNativeRange(dom.getDocument(range.startContainer));
                nativeRange.setEnd(range.endContainer, range.endOffset);
                nativeRange.setStart(range.startContainer, range.startOffset);
                range._selectionNativeRange = nativeRange;
                range.attachListener("detach", function() {
                    log.debug("Got detach event, removing _selectionNativeRange");
                    this._selectionNativeRange = null;
                });
            }
        } else if (range instanceof WrappedRange) {
            nativeRange = range.nativeRange;
        } else if (window.Range && (range instanceof Range)) {
            nativeRange = range;
        }
        return nativeRange;
    }

    function getSingleElementFromRange(range) {
        var nodes = range.getNodes();
        if (nodes.length != 1 || nodes[0].nodeType != 1) {
            throw new Error("getSingleElementFromRange: range did not consist of a single element");
        }
        return nodes[0];
    }

    function updateFromControlRange(sel) {
        // Update the wrapped selection based on what's now in the native selection
        sel._ranges.length = 0;
        if (sel.nativeSelection.type == "None") {
            updateEmptySelection(sel);
        } else {
            var controlRange = sel.nativeSelection.createRange();
            sel.rangeCount = controlRange.length;
            var range, doc = dom.getDocument(controlRange.item(0));
            for (var i = 0; i < sel.rangeCount; ++i) {
                range = api.createRange(doc);
                range.selectNode(controlRange.item(i));
                sel._ranges.push(range);
            }
            sel.isCollapsed = sel.rangeCount == 1 && sel._ranges[0].collapsed;
            updateAnchorAndFocusFromRange(sel, sel._ranges[sel.rangeCount - 1]);
        }
    }

    /**
     * @constructor
     */
    function WrappedSelection(selection) {
        this.nativeSelection = selection;
        this._ranges = [];
        this.refresh();
    }

    api.getSelection = function(win) {
        return new WrappedSelection(getSelection(win));
    };

    var selProto = WrappedSelection.prototype;

    // Selecting a range
    if (selectionHasAnchorAndFocus && util.areHostMethods(testSelection, ["removeAllRanges", "addRange"])) {
        selProto.removeAllRanges = function() {
            this.nativeSelection.removeAllRanges();
            updateEmptySelection(this);
        };

        selProto.addRange = function(range) {
            this.nativeSelection.addRange(getNativeRange(range));
            updateAnchorAndFocusFromNativeSelection(this);
            this.isCollapsed = selectionIsCollapsed(this);
            this.rangeCount = (typeof this.nativeSelection.rangeCount == "number") ?
                              this.nativeSelection.rangeCount : 1;
        };
    } else if (util.isHostMethod(testSelection, "empty") && util.isHostMethod(testRange, "select") &&
               selectionHasType && implementsControlRange) {

        selProto.removeAllRanges = function() {
            this.nativeSelection.empty();
            this._ranges.length = 0;
            updateEmptySelection(this);
        };

        selProto.addRange = function(range) {
            if (this.nativeSelection.type == "Control") {
                var controlRange = this.nativeSelection.createRange();
                var rangeElement = getSingleElementFromRange(range);

                // Create a new ControlRange containing all the elements in the selected ControlRange plus the element
                // contained by the supplied range
                var doc = dom.getDocument(controlRange.item(0));
                var newControlRange = doc.body.createControlRange();
                for (var i = 0, len = controlRange.length; i < len; ++i) {
                    newControlRange.add(controlRange.item(i));
                }
                newControlRange.add(rangeElement);
                newControlRange.select();

                // Update the wrapped selection based on what's now in the native selection
                updateFromControlRange(this);
            } else {
                WrappedRange.rangeToTextRange(range).select();
                this._ranges.push(range);
                this.rangeCount = this._ranges.length;
                this.isCollapsed = this.rangeCount == 1 && this._ranges[0].collapsed;
            }
        };
    } else {
        module.fail("No means of selecting a Range or TextRange was found");
        return false;
    }

    if (util.isHostMethod(testSelection, "getRangeAt") && typeof testSelection.rangeCount == "number") {
        selProto.getRangeAt = function(index) {
            return new WrappedRange(this.nativeSelection.getRangeAt(index));
        };

        selProto.refresh = function() {
            updateAnchorAndFocusFromNativeSelection(this);
            this.isCollapsed = selectionIsCollapsed(this);
            this.rangeCount = this.nativeSelection.rangeCount;
        };
    } else if (selectionHasAnchorAndFocus && typeof testRange.collapsed == BOOLEAN && api.features.implementsDomRange) {
        selProto.getRangeAt = function(index) {
            if (index < 0 || index >= this.rangeCount) {
                throw new DOMException("INDEX_SIZE_ERR");
            } else {
                return this._ranges[index];
            }
        };

        selProto.refresh = function() {
            var doc, range, sel = this.nativeSelection;
            if (sel.anchorNode) {
                doc = dom.getDocument(sel.anchorNode);
                range = api.createRange(doc);
                range.setStart(sel.anchorNode, sel.anchorOffset);
                range.setEnd(sel.focusNode, sel.focusOffset);

                // Handle the case when the selection was selected backwards (from the end to the start in the
                // document)
                if (range.collapsed !== this.isCollapsed) {
                    range.setStart(sel.focusNode, sel.focusOffset);
                    range.setEnd(sel.anchorNode, sel.anchorOffset);
                }
                updateAnchorAndFocusFromNativeSelection(this);
                this.isCollapsed = range.collapsed;
                this._ranges = [range];
                this.rangeCount = 1;
            } else {
                updateEmptySelection(this);
                this._ranges = [];
            }
        };
    } else if (util.isHostMethod(testSelection, "createRange") && api.features.implementsTextRange) {
        selProto.getRangeAt = function(index) {
            if (index < 0 || index >= this.rangeCount) {
                throw new DOMException("INDEX_SIZE_ERR");
            } else {
                return this._ranges[index];
            }
        };

        selProto.refresh = function() {
            var range = this.nativeSelection.createRange(), wrappedRange;
            log.warn("selection refresh called, selection type: " + this.nativeSelection.type);

            // We do nothing with ControlRanges, which don't naturally fit with the DOM Ranges. You could view a
            // selected Control Range as a selection containing multiple Ranges, each spanning an element, but these
            // Ranges should then be immutable, which Ranges are most definitely not.
            if (this.nativeSelection.type == "Control") {
                updateFromControlRange(this);
            } else if (range && typeof range.text != "undefined") {
                // Create a Range from the selected TextRange
                wrappedRange = new WrappedRange(range);
                this._ranges = [wrappedRange];

                // Next line is to work round a problem with the TextRange-to-DOM Range code in the case where a
                // range boundary falls within a preformatted text node containing line breaks: the original
                // TextRange is altered in the process, so if it was selected, the selection changes and we need to
                // create a new TextRange and select it
                if (wrappedRange.alteredDom) {
                    WrappedRange.rangeToTextRange(wrappedRange).select();
                }

                updateAnchorAndFocusFromRange(this, wrappedRange);
                this.rangeCount = 1;
                this.isCollapsed = wrappedRange.collapsed;
            } else {
                updateEmptySelection(this);
                this._ranges.length = this.rangeCount = 0;
            }
        };
    } else {
        module.fail("No means of obtaining a Range or TextRange from the user's selection was found");
        return false;
    }

    // Removal of a single range

    if (util.isHostMethod(testSelection, "removeRange") && typeof testSelection.rangeCount == "number") {
        selProto.removeRange = function(range) {
            this.nativeSelection.removeRange(getNativeRange(range));
            updateAnchorAndFocusFromNativeSelection(this);
            this.rangeCount = this.nativeSelection.rangeCount;
            this.isCollapsed = selectionIsCollapsed(this);
        };
    } else {
        var removeRangeManually = function(sel, range) {
            var ranges = sel.getAllRanges(), removed = false;
            sel.removeAllRanges();
            for (var i = 0, len = ranges.length; i < len; ++i) {
                if (removed || !DomRange.util.rangesEqual(ranges[i], range)) {
                    sel.addRange(ranges[i]);
                } else {
                    // According to the HTML 5 spec, the same range may be added to the selection multiple times.
                    // removeRange should only remove the first instance, so the following ensures only the first
                    // instance is removed
                    removed = true;
                }
            }
            if (!sel.rangeCount) {
                updateEmptySelection(sel);
            }
        };

        if (selectionHasType && implementsControlRange) {
            selProto.removeRange = function(range) {
                if (this.nativeSelection.type == "Control") {
                    var controlRange = this.nativeSelection.createRange();
                    var rangeElement = getSingleElementFromRange(range);

                    // Create a new ControlRange containing all the elements in the selected ControlRange minus the
                    // element contained by the supplied range
                    var doc = dom.getDocument(controlRange.item(0));
                    var newControlRange = doc.body.createControlRange();
                    var el, removed = false;
                    for (var i = 0, len = controlRange.length; i < len; ++i) {
                        el = controlRange.item(i);
                        if (el !== rangeElement || removed) {
                            newControlRange.add(controlRange.item(i));
                        } else {
                            removed = true;
                        }
                    }
                    newControlRange.select();

                    // Update the wrapped selection based on what's now in the native selection
                    updateFromControlRange(this);
                } else {
                    removeRangeManually(this, range);
                }
            };
        } else {
            selProto.removeRange = function(range) {
                removeRangeManually(this, range);
            };
        }
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
            log.debug("selection toString called");
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
            updateAnchorAndFocusFromNativeSelection(this);
            this.rangeCount = 1;
            this.isCollapsed = true;
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
            this.isCollapsed = true;
        };
    }

    if (util.isHostMethod(testSelection, "collapseToStart")) {
        selProto.collapseToStart = function() {
            this.nativeSelection.collapseToStart();
            updateAnchorAndFocusFromNativeSelection(this);
            this.rangeCount = 1;
            this.isCollapsed = true;
        };
    } else {
        selProto.collapseToStart = function() {
            if (this.rangeCount) {
                var range = this.getRangeAt(0);
                range.collapse(true);
                this.removeAllRanges();
                this.addRange(range);
                this.isCollapsed = true;
            } else {
                throw new DOMException("INVALID_STATE_ERR");
            }
        };
    }

    if (util.isHostMethod(testSelection, "collapseToEnd")) {
        selProto.collapseToEnd = function() {
            this.nativeSelection.collapseToEnd();
            updateAnchorAndFocusFromNativeSelection(this);
            this.rangeCount = 1;
            this.isCollapsed = true;
        };
    } else {
        selProto.collapseToEnd = function() {
            if (this.rangeCount) {
                var range = this.getRangeAt(this.rangeCount - 1);
                range.collapse(false);
                this.removeAllRanges();
                this.addRange(range);
                this.isCollapsed = true;
            } else {
                throw new DOMException("INVALID_STATE_ERR");
            }
        };
    }

    if (util.isHostMethod(testSelection, "selectAllChildren")) {
        selProto.selectAllChildren = function(node) {
            this.nativeSelection.selectAllChildren(node);
            updateAnchorAndFocusFromNativeSelection(this);
            this.rangeCount = 1;
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
            updateAnchorAndFocusFromNativeSelection(this);
            this.rangeCount = 1;
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
        log.warn("getAllRanges called, rangecount: " + this.rangeCount);
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