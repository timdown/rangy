/**
 * @license Coordinates module for Rangy.
 * Extensions to Range and Selection objects to provide access to pixel coordinates
 *
 * Part of Rangy, a cross-browser JavaScript range and selection library
 * http://code.google.com/p/rangy/
 *
 * Depends on Rangy core.
 *
 * Copyright %%build:year%%, Tim Down
 * Licensed under the MIT license.
 * Version: %%build:version%%
 * Build date: %%build:date%%
 */
rangy.createModule("Coordinates", function(api, module) {
    api.requireModules( ["WrappedSelection", "WrappedRange"] );

    var NUMBER = "number";
    var WrappedRange = api.WrappedRange;
    var dom = api.dom;

    // Since Rangy can deal with multiple documents, we have to do the checks every time, unless we cache a
    // getScrollPosition function in each document. This would necessarily pollute the document's global
    // namespace, which I'm viewing as a greater evil than a slight performance hit.
    function getScrollPosition(win) {
        var x = 0, y = 0;
        if (typeof win.pageXOffset == NUMBER && typeof win.pageYOffset == NUMBER) {
            x = win.pageXOffset;
            y = win.pageYOffset;
        } else {
            var doc = win.document;
            var docEl = doc.documentElement;
            var compatMode = doc.compatMode;
            var scrollEl = (typeof compatMode == "string" && compatMode.indexOf("CSS") >= 0 && docEl)
                ? docEl : dom.getBody(doc);

            if (scrollEl && typeof scrollEl.scrollLeft == NUMBER && typeof scrollEl.scrollTop == NUMBER) {
                try {
                    x = scrollEl.scrollLeft;
                    y = scrollEl.scrollTop;
                } catch (ex) {}
            }
        }
        return { x: x, y: y };
    }

    function mergeRects(rect1, rect2) {
        var rect = {
            top: Math.min(rect1.top, rect2.top),
            bottom: Math.max(rect1.bottom, rect2.bottom),
            left: Math.min(rect1.left, rect2.left),
            right: Math.max(rect1.right, rect2.right)
        };
        rect.width = rect.right - rect.left;
        rect.height = rect.bottom - rect.top;

        return rect;
    }

    function Rect(top, right, bottom, left) {
        this.top = top;
        this.right = right;
        this.bottom = bottom;
        this.left = left;
        this.width = right - left;
        this.height = bottom - top;
    }

    function clientRectToRect(rect) {
        return new Rect(rect.top, rect.right, rect.bottom, rect.left);
    }

/*
    Rect.prototype.init = function(top, right, bottom, left) {
        this.top = top;
        this.right = right;
        this.bottom = bottom;
        this.left = left;
        this.width = right - left;
        this.height = bottom - top;
    };

    function DocumentRect(top, right, bottom, left) {
        this.init(top, right, bottom, left);
    }

    DocumentRect.prototype = new Rect();

    function ClientRect(top, right, bottom, left) {
        this.init(top, right, bottom, left);
    }

    ClientRect.prototype = new Rect();
    ClientRect.prototype.toDocumentRect = function() {
        var scrollPos = getScrollPosition(win);
        return new DocumentRect();
    };
*/


    var getRangeBoundingClientRect = (function() {

        // Test for getBoundingClientRect support in Range
        var testRange = api.createNativeRange();

        var rangeSupportsGetBoundingClientRect = false;
        var elementSupportsGetBoundingClientRect = false;

        if (api.features.implementsTextRange) {
            return function(range) {
                // We need a TextRange
                var textRange = api.util.isTextRange(range.nativeRange) ?
                    range.nativeRange : WrappedRange.rangeToTextRange(range);

                var left = textRange.boundingLeft, top = textRange.boundingTop;
                var width = textRange.boundingWidth, height = textRange.boundingHeight;
                return new Rect(top, left + width, top + height, left);
            };

        } else if (api.features.implementsDomRange) {
            rangeSupportsGetBoundingClientRect = api.util.isHostMethod(testRange, "getBoundingClientRect");

            api.features.rangeSupportsGetBoundingClientRect = rangeSupportsGetBoundingClientRect;

            var createWrappedRange = function(range) {
                return (range instanceof WrappedRange) ? range : new WrappedRange(range);
            };

            if (rangeSupportsGetBoundingClientRect) {
                return function(range) {
                    var nativeRange = createWrappedRange(range).nativeRange;
                    // Test for WebKit getBoundingClientRect bug (https://bugs.webkit.org/show_bug.cgi?id=65324)
                    return clientRectToRect(nativeRange.getBoundingClientRect() || nativeRange.getClientRects()[0]);
                };
            } else {
                // Test that <span> elements support getBoundingClientRect
                var span = document.createElement("span");
                elementSupportsGetBoundingClientRect = api.util.isHostMethod(span, "getBoundingClientRect");

                var getElementBoundingClientRect = elementSupportsGetBoundingClientRect ?
                    function(el) {
                        return clientRectToRect(el.getBoundingClientRect());
                    } :

                    // This implementation is very naive. There are many browser quirks that make it extremely
                    // difficult to get accurate element coordinates in all situations
                    function(el) {
                        var x = 0, y = 0, offsetEl = el, width = el.offsetWidth, height = el.offsetHeight;
                        while (offsetEl) {
                            x += offsetEl.offsetLeft;
                            y += offsetEl.offsetTop;
                            offsetEl = offsetEl.offsetParent;
                        }

                        return new Rect(y, x + width, y + height, x);
                    };

                var getRectFromBoundaries = function(range) {
                    range.splitBoundaries();
                    var span = document.createElement("span");
                    var workingRange = range.cloneRange();
                    workingRange.collapse(true);
                    workingRange.insertNode(span);
                    var startRect = getElementBoundingClientRect(span);
                    span.parentNode.removeChild(span);
                    workingRange.collapseToPoint(range.endContainer, range.endOffset);
                    workingRange.insertNode(span);
                    var endRect = getElementBoundingClientRect(span);
                    span.parentNode.removeChild(span);
                    range.normalizeBoundaries();
                    return mergeRects(startRect, endRect);
                };

                return function(range) {
                    return getRectFromBoundaries(createWrappedRange(range));
                };
            }
        }
    })();

    api.getRangeBoundingClientRect = getRangeBoundingClientRect;

    api.rangePrototype.getBoundingClientRect = function() {
        return getRangeBoundingClientRect(this);
    };

    api.rangePrototype.getBoundingDocumentRect = function() {
        var rect = getRangeBoundingClientRect(this);
        var scrollPos = getScrollPosition(dom.getWindow(this.startContainer));
        return new Rect(rect.top + scrollPos.y, rect.right + scrollPos.x, rect.bottom + scrollPos.y, rect.left + scrollPos.x);
    };

    (function() {
        function createClientBoundaryPosGetter(isStart) {
            return function() {
                var boundaryRange = this.cloneRange();
                boundaryRange.collapse(isStart);
                var rect = getRangeBoundingClientRect(boundaryRange);
                return { x: rect[isStart ? "left" : "right"], y: rect[isStart ? "top" : "bottom"] };
            };
        }

        function createDocumentBoundaryPosGetter(isStart) {
            return function() {
                var pos = this["get" + (isStart ? "Start" : "End") + "ClientPos"]();
                var scrollPos = getScrollPosition(dom.getWindow(this.startContainer));
                return { x: pos.x + scrollPos.x, y: pos.y + scrollPos.y };
            };
        }

        api.rangePrototype.getStartClientPos = createClientBoundaryPosGetter(true);
        api.rangePrototype.getEndClientPos = createClientBoundaryPosGetter(false);

        api.rangePrototype.getStartDocumentPos = createDocumentBoundaryPosGetter(true);
        api.rangePrototype.getEndDocumentPos = createDocumentBoundaryPosGetter(false);
    })();

    (function() {
        function compareRanges(r1, r2) {
            return r1.compareBoundaryPoints(r2.START_TO_START, r2);
        }

        function createSelectionRectGetter(isDocument) {
            return function() {
                var rangeMethodName = "getBounding" + (isDocument ? "Document" : "Client") + "Rect";
                for (var i = 0, rect = null, rangeRect; i < this.rangeCount; ++i) {
                    rangeRect = this.getRangeAt(i)[rangeMethodName]();
                    rect = rect ? mergeRects(rect, rangeRect) : rangeRect;
                }
                return rect;
            };
        }

        function createSelectionBoundaryPosGetter(isStart, isDocument) {
            return function() {
                if (this.rangeCount == 0) {
                    return null;
                }

                var posType = isDocument ? "Document" : "Client";

                var ranges = this.getAllRanges();
                if (ranges.length > 1) {
                    // Order the ranges by position within the DOM
                    ranges.sort(compareRanges);
                }

                return isStart ? ranges[0]["getStart" + posType + "Pos"]() : ranges[ranges.length - 1]["getEnd" + posType + "Pos"]();
            };
        }

        api.selectionPrototype.getBoundingClientRect = createSelectionRectGetter(false);
        api.selectionPrototype.getBoundingDocumentRect = createSelectionRectGetter(true);

        api.selectionPrototype.getStartClientPos = createSelectionBoundaryPosGetter(true, false);
        api.selectionPrototype.getEndClientPos = createSelectionBoundaryPosGetter(false, false);

        api.selectionPrototype.getStartDocumentPos = createSelectionBoundaryPosGetter(true, true);
        api.selectionPrototype.getEndDocumentPos = createSelectionBoundaryPosGetter(false, true);
    })();
});
