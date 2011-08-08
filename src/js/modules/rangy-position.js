/**
 * @license Position module for Rangy.
 * Extensions to Range and Selection objects to provide access to pixel positions relative to the viewport or document.
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
    var dom = api.dom, util = api.util;

    // Since Rangy can deal with multiple documents, we have to do the checks every time, unless we cache a
    // getScrollPosition function in each document. This would necessarily pollute the document's global
    // namespace, which I'm choosing to view as a greater evil than a slight performance hit.
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

    function createRelativeRect(rect, dx, dy) {
        return new Rect(rect.top + dy, rect.right + dx, rect.bottom + dy, rect.left + dx);
    }

    function adjustClientRect(rect, doc) {
        // Older IEs have an issue with a two pixel margin on the body element
        var dx = 0, dy = 0;
        var docEl = doc.documentElement, body = dom.getBody(doc);
        var container = (docEl.clientWidth === 0 && typeof body.clientTop == NUMBER) ? body : docEl;
        var clientLeft = container.clientLeft, clientTop = container.clientTop;
        if (clientLeft) {
            dx = -clientLeft;
        }
        if (clientTop) {
            dy = -clientTop;
        }
        return createRelativeRect(rect, dx, dy);
    }

    (function() {

        // Test that <span> elements support getBoundingClientRect
        var span = document.createElement("span");
        var elementSupportsGetBoundingClientRect = util.isHostMethod(span, "getBoundingClientRect");
        span = null;

        // Test for getBoundingClientRect support in Range
        var rangeSupportsGetClientRects = false, rangeSupportsGetBoundingClientRect = false;
        if (api.features.implementsDomRange) {
            var testRange = api.createNativeRange();
            rangeSupportsGetClientRects = util.isHostMethod(testRange, "getClientRects");
            rangeSupportsGetBoundingClientRect = util.isHostMethod(testRange, "getBoundingClientRect");
            testRange.detach();
        }

        util.extend(api.features, {
            rangeSupportsGetBoundingClientRect: rangeSupportsGetBoundingClientRect,
            rangeSupportsGetClientRects: rangeSupportsGetClientRects,
            elementSupportsGetBoundingClientRect: elementSupportsGetBoundingClientRect
        });

        var createClientBoundaryPosGetter = function(isStart) {
            return function() {
                var boundaryRange = this.cloneRange();
                boundaryRange.collapse(isStart);
                var rect = boundaryRange.getBoundingClientRect();
                return { x: rect[isStart ? "left" : "right"], y: rect[isStart ? "top" : "bottom"] };
            };
        };

        var rangeProto = api.rangePrototype;

        if (api.features.implementsTextRange) {
            rangeProto.getBoundingClientRect = function() {
                // We need a TextRange
                var textRange = util.isTextRange(this.nativeRange) ?
                    this.nativeRange : WrappedRange.rangeToTextRange(this);

                var left = textRange.boundingLeft, top = textRange.boundingTop;
                var width = textRange.boundingWidth, height = textRange.boundingHeight;
                var rect = textRange.getBoundingClientRect();
                return adjustClientRect(rect, dom.getDocument(this.startContainer));
            };
        } else if (api.features.implementsDomRange) {
            var createWrappedRange = function(range) {
                return (range instanceof WrappedRange) ? range : new WrappedRange(range);
            };

            if (rangeSupportsGetBoundingClientRect) {
                rangeProto.getBoundingClientRect = function() {
                    var nativeRange = createWrappedRange(this).nativeRange;
                    // Test for WebKit getBoundingClientRect bug (https://bugs.webkit.org/show_bug.cgi?id=65324)
                    var rect = nativeRange.getBoundingClientRect() || nativeRange.getClientRects()[0];
                    return adjustClientRect(rect, dom.getDocument(this.startContainer));
                };

                if (rangeSupportsGetClientRects) {
                    createClientBoundaryPosGetter = function(isStart) {
                        return function() {
                            var rect, nativeRange = createWrappedRange(this).nativeRange;
                            if (isStart) {
                                rect = nativeRange.getClientRects()[0];
                                return { x: rect.left, y: rect.top };
                            } else {
                                var rects = nativeRange.getClientRects();
                                rect = rects[rects.length - 1];
                                return { x: rect.right, y: rect.bottom };
                            }
                        };
                    }
                }
            } else {
                var getElementBoundingClientRect = elementSupportsGetBoundingClientRect ?
                    function(el) {
                        return adjustClientRect(el.getBoundingClientRect(), dom.getDocument(el));
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

                        return adjustClientRect(new Rect(y, x + width, y + height, x), dom.getDocument(el));
                    };

                var getRectFromBoundaries = function(range) {
                    var rect;
                    range.splitBoundaries();
                    var span = document.createElement("span");

                    if (range.collapsed) {
                        range.insertNode(span);
                        rect = getElementBoundingClientRect(span);
                        span.parentNode.removeChild(span);
                    } else {
                        // TODO: This isn't right. I'm not sure it can be made right sensibly. Consider what to do.
                        // This doesn't consider all the line boxes it needs to consider.
                        var workingRange = range.cloneRange();

                        // Get the start rectangle
                        workingRange.collapse(true);
                        workingRange.insertNode(span);
                        var startRect = getElementBoundingClientRect(span);
                        span.parentNode.removeChild(span);

                        // Get the end rectangle
                        workingRange.collapseToPoint(range.endContainer, range.endOffset);
                        workingRange.insertNode(span);
                        var endRect = getElementBoundingClientRect(span);
                        span.parentNode.removeChild(span);

                        // Merge the start and end rects
                        rect = mergeRects(startRect, endRect);

                        // Merge in rectangles for all elements in the range
                        var elements = range.getNodes([1], function(el) {
                            return range.containsNode(el);
                        });
                        for (var i = 0, len = elements.length; i < len; ++i) {
                            rect = mergeRects(rect, getElementBoundingClientRect(elements[i]));
                        }
                    }

                    // Clean up
                    range.normalizeBoundaries();
                    return rect;
                };

                rangeProto.getBoundingClientRect = function(range) {
                    return getRectFromBoundaries(createWrappedRange(range));
                };
            }

            function createDocumentBoundaryPosGetter(isStart) {
                return function() {
                    var pos = this["get" + (isStart ? "Start" : "End") + "ClientPos"]();
                    var scrollPos = getScrollPosition( dom.getWindow(this.startContainer) );
                    return { x: pos.x + scrollPos.x, y: pos.y + scrollPos.y };
                };
            }
        }
        //alert("BLAHA")

        util.extend(rangeProto, {
            getBoundingDocumentRect: function() {
                var scrollPos = getScrollPosition( dom.getWindow(this.startContainer) );
                return createRelativeRect(this.getBoundingClientRect(), scrollPos.x, scrollPos.y);
            },

            getStartClientPos: createClientBoundaryPosGetter(true),
            getEndClientPos: createClientBoundaryPosGetter(false),

            getStartDocumentPos: createDocumentBoundaryPosGetter(true),
            getEndDocumentPos: createDocumentBoundaryPosGetter(false)
        });
    })();

/*    // Add Range methods
    (function() {
        function createClientBoundaryPosGetter(isStart) {
            return function() {
                var boundaryRange = this.cloneRange();
                boundaryRange.collapse(isStart);
                var rect = getRangeBoundingClientRect(boundaryRange);
                console.log(rect, isStart);
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

        util.extend(api.rangePrototype, {
            getBoundingClientRect: function() {
                return getRangeBoundingClientRect(this);
            },

            getBoundingDocumentRect: function() {
                var scrollPos = getScrollPosition(dom.getWindow(this.startContainer));
                return createRelativeRect(getRangeBoundingClientRect(this), scrollPos.x, scrollPos.y);
            },

            getStartClientPos: createClientBoundaryPosGetter(true),
            getEndClientPos: createClientBoundaryPosGetter(false),

            getStartDocumentPos: createDocumentBoundaryPosGetter(true),
            getEndDocumentPos: createDocumentBoundaryPosGetter(false)
        });
    })();*/

    // Add Selection methods
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

                return isStart ?
                    ranges[0]["getStart" + posType + "Pos"]() :
                    ranges[ranges.length - 1]["getEnd" + posType + "Pos"]();
            };
        }

        util.extend(api.selectionPrototype, {
            getBoundingClientRect: createSelectionRectGetter(false),
            getBoundingDocumentRect: createSelectionRectGetter(true),

            getStartClientPos: createSelectionBoundaryPosGetter(true, false),
            getEndClientPos: createSelectionBoundaryPosGetter(false, false),

            getStartDocumentPos: createSelectionBoundaryPosGetter(true, true),
            getEndDocumentPos: createSelectionBoundaryPosGetter(false, true)
        });
    })();
});
