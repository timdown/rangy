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

    var WrappedRange = api.WrappedRange;

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
                return {
                    top: top,
                    bottom: top + height,
                    left: left,
                    right: left + width,
                    width: width,
                    height: height
                };
            };

        } else if (api.features.implementsDomRange) {
            rangeSupportsGetBoundingClientRect = api.util.isHostMethod(testRange, "getBoundingClientRect");
            api.features.rangeSupportsGetBoundingClientRect = rangeSupportsGetBoundingClientRect;


            var createWrappedRange = function(range) {
                return (range instanceof WrappedRange) ? range : new WrappedRange(range);
            };

            if (rangeSupportsGetBoundingClientRect) {
                return function(range) {
                    return createWrappedRange(range).nativeRange.getBoundingClientRect();
                };
            } else {
                // Test that <span> elements support getBoundingClientRect
                var span = document.createElement("span");
                elementSupportsGetBoundingClientRect = api.util.isHostMethod(span, "getBoundingClientRect");

                var getElementBoundingClientRect = elementSupportsGetBoundingClientRect ?
                    function(el) {
                        return el.getBoundingClientRect();
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

                        return {
                            top: y,
                            bottom: y + height,
                            left: x,
                            right: x + width,
                            width: width,
                            height: height
                        };
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

    (function() {
        function createClientBoundaryPosGetter(isStart) {
            return function() {
                var boundaryRange = this.cloneRange();
                boundaryRange.collapse(isStart);
                var rect = getRangeBoundingClientRect(this);
                return { left: rect.left, top: rect.top };
            };
        }

        api.rangePrototype.getStartClientPos = createClientBoundaryPosGetter(true);
        api.rangePrototype.getEndClientPos = createClientBoundaryPosGetter(false);
    })();

    api.selectionPrototype.getBoundingClientRect = function() {
        for (var i = 0, rect = null, rangeRect; i < this.rangeCount; ++i) {
            rangeRect = getRangeBoundingClientRect(this.getRangeAt(i));
            rect = rect ? mergeRects(rect, rangeRect) : rangeRect;
        }
        return rect;
    };
});
