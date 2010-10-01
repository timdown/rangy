rangy.createModule("WrappedSelection", function(api, module) {
    // This will create a selection object wrapper that follows the HTML5 draft spec selections section
    // (http://dev.w3.org/html5/spec/editing.html#selection) and adds convenience extensions

    api.requireModules( ["DomRange", "WrappedRange"] );

    api.checkSelectionRanges = true;

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

    // Test whether the native selection is capable of supporting multiple ranges
    var selectionSupportsMultipleRanges = false;
    if (util.areHostMethods(testSelection, ["addRange", "getRangeAt", "removeAllRanges"]) &&
            typeof testSelection.rangeCount == "number" && api.features.implementsDomRange) {

        var testRange2 = api.createNativeRange(document);
        testRange2.selectNodeContents(document.body);
        var testRange3 = api.createNativeRange(document);
        testRange3.selectNodeContents(document.body.firstChild);
        testSelection.removeAllRanges();
        testSelection.addRange(testRange2);
        testSelection.addRange(testRange3);
        selectionSupportsMultipleRanges = (testSelection.rangeCount == 2);
    }

    api.features.selectionSupportsMultipleRanges = selectionSupportsMultipleRanges;

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
    if (selectionHasAnchorAndFocus) {
        selectionIsCollapsed = function(sel) {
            return sel.anchorNode === sel.focusNode && sel.anchorOffset === sel.focusOffset;
        };
    } else {
        selectionIsCollapsed = function(sel) {
            return sel.rangeCount ? sel.getRangeAt(sel.rangeCount - 1).collapsed : false;
        };
    }

    function assertNode(node, codeName) {
        if (!node) {
            throw new DOMException(codeName);
        }
    }

    function updateAnchorAndFocusFromRange(sel, range, backwards) {
        var anchorPrefix = backwards ? "end" : "start", focusPrefix = backwards ? "start" : "end";
        sel.anchorNode = range[anchorPrefix + "Container"];
        sel.anchorOffset = range[anchorPrefix + "Offset"];
        sel.focusNode = range[focusPrefix + "Container"];
        sel.focusOffset = range[focusPrefix + "Offset"];
    }

    function updateAnchorAndFocusFromNativeSelection(sel) {
        var nativeSel = sel.nativeSelection;
        sel.anchorNode = nativeSel.anchorNode;
        sel.anchorOffset = nativeSel.anchorOffset;
        sel.focusNode = nativeSel.focusNode;
        sel.focusOffset = nativeSel.focusOffset;
    }

    function updateEmptySelection(sel) {
        sel.anchorNode = sel.focusNode = null;
        sel.anchorOffset = sel.focusOffset = 0;
        sel.rangeCount = 0;
        sel.isCollapsed = true;
        sel._ranges.length = 0;
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
            updateAnchorAndFocusFromRange(sel, sel._ranges[sel.rangeCount - 1], false);
        }
    }

    var getSelectionRangeAt;

    if (util.isHostMethod(testSelection,  "getRangeAt")) {
        getSelectionRangeAt = function(sel, index) {
            try {
                return sel.getRangeAt(index);
            } catch(ex) {
                return null;
            }
        };
    } else if (selectionHasAnchorAndFocus) {
        getSelectionRangeAt = function(sel, index) {
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
        };
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
            if (selectionSupportsMultipleRanges) {
                this.rangeCount++;
            } else {
                this.removeAllRanges();
                this.rangeCount = 1;
            }
            this.nativeSelection.addRange(getNativeRange(range));

            // Check whether the range that we added to the selection is reflected in the last range extracted from
            // the selection
            if (api.checkSelectionRanges) {
                var nativeRange = getSelectionRangeAt(this.nativeSelection, this.rangeCount - 1);
                if (nativeRange && !DomRange.util.rangesEqual(nativeRange, range)) {
                    // Happens in WebKit with, for example, a selection placed at the start of a text node
                    range = nativeRange;
                }
            }
            this._ranges[this.rangeCount - 1] = range;
            updateAnchorAndFocusFromRange(this, range, selectionIsBackwards(this.nativeSelection));
            this.isCollapsed = selectionIsCollapsed(this);
            //console.log("Native: " + this.nativeSelection.isCollapsed, this.nativeSelection.rangeCount, "" + this.nativeSelection.getRangeAt(0), this.nativeSelection.anchorOffset, this.nativeSelection.focusOffset);
        };
    } else if (util.isHostMethod(testSelection, "empty") && util.isHostMethod(testRange, "select") &&
               selectionHasType && implementsControlRange) {

        selProto.removeAllRanges = function() {
            this.nativeSelection.empty();
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
                this._ranges[0] = range;
                this.rangeCount = 1;
                this.isCollapsed = this._ranges[0].collapsed;
                updateAnchorAndFocusFromRange(this, range, false);
            }
        };
    } else {
        module.fail("No means of selecting a Range or TextRange was found");
        return false;
    }

    selProto.getRangeAt = function(index) {
        if (index < 0 || index >= this.rangeCount) {
            throw new DOMException("INDEX_SIZE_ERR");
        } else {
            return this._ranges[index];
        }
    };

    if (util.isHostMethod(testSelection, "getRangeAt") && typeof testSelection.rangeCount == "number") {
        selProto.refresh = function() {
            this.isCollapsed = selectionIsCollapsed(this);
            this._ranges.length = this.rangeCount = this.nativeSelection.rangeCount;
            if (this.rangeCount) {
                for (var i = 0, len = this.rangeCount; i < len; ++i) {
                    this._ranges[i] = this.nativeSelection.getRangeAt(i);
                }
                updateAnchorAndFocusFromRange(this, this._ranges[this.rangeCount - 1], selectionIsBackwards(this.nativeSelection));
            } else {
                updateEmptySelection(this);
            }
        };
    } else if (selectionHasAnchorAndFocus && typeof testSelection.isCollapsed == BOOLEAN && typeof testRange.collapsed == BOOLEAN && api.features.implementsDomRange) {
        selProto.refresh = function() {
            var range, sel = this.nativeSelection;
            if (sel.anchorNode) {
                range = getSelectionRangeAt(sel, 0);
                this._ranges = [range];
                this.rangeCount = 1;
                updateAnchorAndFocusFromNativeSelection(this);
            } else {
                updateEmptySelection(this);
            }
        };
    } else if (util.isHostMethod(testSelection, "createRange") && api.features.implementsTextRange) {
        selProto.refresh = function() {
            var range = this.nativeSelection.createRange(), wrappedRange;
            log.warn("selection refresh called, selection type: " + this.nativeSelection.type);

            if (this.nativeSelection.type == "Control") {
                updateFromControlRange(this);
            } else if (range && typeof range.text != "undefined") {
                // Create a Range from the selected TextRange
                wrappedRange = new WrappedRange(range);
                this._ranges = [wrappedRange];

                updateAnchorAndFocusFromRange(this, wrappedRange, false);
                this.rangeCount = 1;
                this.isCollapsed = wrappedRange.collapsed;
            } else {
                updateEmptySelection(this);
            }
        };
    } else {
        module.fail("No means of obtaining a Range or TextRange from the user's selection was found");
        return false;
    }

    // Removal of a single range
    var removeRangeManually = function(sel, range) {
        var ranges = sel.getAllRanges(), removed = false;
        //console.log("removeRangeManually with " + ranges.length + " ranges (rangeCount " + sel.rangeCount);
        sel.removeAllRanges();
        for (var i = 0, len = ranges.length; i < len; ++i) {
            if (removed || range !== ranges[i]) {
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
        //console.log("removeRangeManually finished with rangeCount " + sel.rangeCount);
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

    // Detecting if a selection is backwards
    var selectionIsBackwards;
    if (selectionHasAnchorAndFocus && api.features.implementsDomRange) {
        selectionIsBackwards = function(sel) {
            var backwards = false;
            if (sel.anchorNode) {
                backwards = (dom.comparePoints(sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset) == 1);
            }
            return backwards;
        };

        selProto.isBackwards = function() {
            return selectionIsBackwards(this);
        };
    } else {
        selectionIsBackwards = selProto.isBackwards = function() {
            return false;
        };
    }

    // Selection text
    // This is conformant to the HTML 5 draft spec but differs from WebKit and Mozilla's implementation
    selProto.toString = function() {
        log.debug("selection toString called");
        var rangeTexts = [];
        for (var i = 0, len = this.rangeCount; i < len; ++i) {
            rangeTexts[i] = "" + this._ranges[i];
        }
        return rangeTexts.join("");
    };

    // No current browsers conform fully to the HTML 5 draft spec for this method, so Rangy's own method is always used
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

    selProto.collapseToStart = function() {
        if (this.rangeCount) {
            var range = this.getRangeAt(0);
            this.collapse(range.startContainer, range.startOffset);
        } else {
            throw new DOMException("INVALID_STATE_ERR");
        }
    };

    selProto.collapseToEnd = function() {
        if (this.rangeCount) {
            var range = this.getRangeAt(this.rangeCount - 1);
            this.collapse(range.endContainer, range.endOffset);
        } else {
            throw new DOMException("INVALID_STATE_ERR");
        }
    };

    // The HTML 5 spec is very specific on how selectAllChildren should be implemented so the native implementation is
    // never used by Rangy.
    selProto.selectAllChildren = function(node) {
        this.collapse(node, 0);
        var range = this.getRangeAt(0);
        range.selectNodeContents(node);
        this.removeAllRanges();
        this.addRange(range);
    };

    selProto.deleteFromDocument = function() {
        if (this.rangeCount) {
            var ranges = this.getAllRanges();
            this.removeAllRanges();
            for (var i = 0, len = ranges.length; i < len; ++i) {
                ranges[i].deleteContents();
            }
            // The HTML5 spec says nothing about what the selection should contain after calling deleteContents on each
            // range. Firefox moves the selection to where the final selected range was, so we emulate that
            this.addRange(ranges[len - 1]);
        }
    };

    // The following are non-standard extensions

    // These two are mine, added for convenience
    selProto.getAllRanges = function() {
        log.warn("getAllRanges called, rangecount: " + this.rangeCount);
        return this._ranges.slice(0);
    };

    selProto.setRanges = function(ranges) {
        this.removeAllRanges();
        for (var i = 0, len = ranges.length; i < len; ++i) {
            this.addRange(ranges[i]);
        }
    };

    selProto.containsNode = function(node, allowPartial) {
        for (var i = 0, len = this._ranges.length; i < len; ++i) {
            if (this._ranges[i].containsNode(node, allowPartial)) {
                return true;
            }
        }
        return false;
    };
});