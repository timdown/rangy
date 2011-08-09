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

    function getAncestorElement(node, tagName) {
        tagName = tagName.toLowerCase();
        while (node) {
            if (node.nodeType == 1 && node.tagName.toLowerCase() == tagName) {
                return node;
            }
            node = node.parentNode;
        }
        return null;
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

    function mergeRects(rects) {
        var tops = [], bottoms = [], lefts = [], rights = [];
        for (var i = 0, len = rects.length, rect; i < len; ++i) {
            rect = rects[i];
            if (rect) {
                tops.push(rect.top);
                bottoms.push(rect.bottom);
                lefts.push(rect.left);
                rights.push(rect.right);
            }
        }
        return new Rect(
            Math.min.apply(Math, tops),
            Math.max.apply(Math, rights),
            Math.max.apply(Math, bottoms),
            Math.min.apply(Math, lefts)
        );
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

        if (api.features.implementsTextRange && elementSupportsGetBoundingClientRect) {
            rangeProto.getBoundingClientRect = function() {
                // We need a TextRange
                var textRange = WrappedRange.rangeToTextRange(this);

                // Work around table problems (table cell bounding rects seem not to count if TextRange spans cells)
                var cells = this.getNodes([1], function(el) {
                    return /^t[dh]$/i.test(el.tagName);
                });

                // Merge rects for each cell selected by the range into overall rect
                var rect, rects = [];
                if (cells.length > 0) {
                    var lastTable = getAncestorElement(this.startContainer, "table");

                    for (var i = 0, cell, tempTextRange, table, subRange, subRect; cell = cells[i]; ++i) {
                        // Handle non-table sections of the range
                        table = getAncestorElement(cell, "table");
                        if (!lastTable || table != lastTable) {
                            // There is a section of the range prior to the current table, or lying between tables.
                            // Merge in its rect
                            subRange = this.cloneRange();
                            if (lastTable) {
                                subRange.setStartAfter(lastTable);
                            }
                            subRange.setEndBefore(table);
                            rects.push(WrappedRange.rangeToTextRange(subRange).getBoundingClientRect());
                        }

                        if (this.containsNode(cell)) {
                            rects.push(cell.getBoundingClientRect());
                        } else {
                            tempTextRange = textRange.duplicate();
                            tempTextRange.moveToElementText(cell);
                            if (tempTextRange.compareEndPoints("StartToStart", textRange) == -1) {
                                tempTextRange.setEndPoint("StartToStart", textRange);
                            } else if (tempTextRange.compareEndPoints("EndToEnd", textRange) == 1) {
                                tempTextRange.setEndPoint("EndToEnd", textRange);
                            }
                            rects.push(tempTextRange.getBoundingClientRect());
                        }
                        lastTable = table;
                    }

                    // Merge in the rect for any content lying after the final table
                    var endTable = getAncestorElement(this.endContainer, "table");
                    if (!endTable && lastTable) {
                        subRange = this.cloneRange();
                        subRange.setStartAfter(lastTable);
                        rects.push(WrappedRange.rangeToTextRange(subRange).getBoundingClientRect());
                    }
                    rect = mergeRects(rects);
                } else {
                    rect = textRange.getBoundingClientRect();
                }

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
                        var rects = [startRect, endRect];

                        // Merge in rectangles for all elements in the range
                        var elements = range.getNodes([1], function(el) {
                            return range.containsNode(el);
                        });

                        for (var i = 0, len = elements.length; i < len; ++i) {
                            rects.push(getElementBoundingClientRect(elements[i]));
                        }
                        rect = mergeRects(rects)
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

    // Add Selection methods
    (function() {
        function compareRanges(r1, r2) {
            return r1.compareBoundaryPoints(r2.START_TO_START, r2);
        }

        function createSelectionRectGetter(isDocument) {
            return function() {
                var rangeMethodName = "getBounding" + (isDocument ? "Document" : "Client") + "Rect";
                var rects = [];
                for (var i = 0, rect = null, rangeRect; i < this.rangeCount; ++i) {
                    rects.push(this.getRangeAt(i)[rangeMethodName]());
                }
                return mergeRects(rects);
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
