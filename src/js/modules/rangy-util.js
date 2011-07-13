/**
 * @license Utilities module for Rangy.
 * A collection of common selection and range-related tasks, using Rangy
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
rangy.createModule("Util", function(api, module) {
    api.requireModules( ["WrappedSelection", "WrappedRange"] );

    var rangeProto = api.DomRange.prototype;
    var selProto = api.Selection.prototype;

    var getRangeBoundingClientRect = (function() {
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

        function getRectFromBoundaries(range) {
            range.splitBoundaries();
            var span = document.createElement("span");
            var workingRange = range.cloneRange();
            workingRange.collapse(true);
            workingRange.insertNode(span);
            var startRect = span.getBoundingClientRect();
            span.parentNode.removeChild(span);
            workingRange.collapseToPoint(range.endContainer, range.endOffset);
            workingRange.insertNode(span);
            var endRect = span.getBoundingClientRect();
            span.parentNode.removeChild(span);
            range.normalizeBoundaries();
            return mergeRects(startRect, endRect);
        }

        // Test for getBoundingClientRect support in Range
        var testRange = api.createNativeRange();

        var rangeSupportsGetBoundingClientRect = false;
        var textRangeSupportsBoundingProperties = false;
        var elementSupportsGetBoundingClientRect = false;

        if (api.features.implementsDomRange) {
            rangeSupportsGetBoundingClientRect = api.util.isHostMethod(testRange, "getBoundingClientRect");
            api.features.rangeSupportsGetBoundingClientRect = rangeSupportsGetBoundingClientRect;

            return function(range) {
                if (!(range instanceof api.WrappedRange)) {
                    range = new api.WrappedRange(range);
                }
                if (rangeSupportsGetBoundingClientRect) {
                    return range.nativeRange.getBoundingClientRect();
                } else {
                    return getRectFromBoundaries(range);
                }
            };
        } else if (api.features.implementsTextRange) {
            textRangeSupportsBoundingProperties = api.util.areHostProperties(testRange, ["boundingLeft", "boundingTop", "boundingWidth", "boundingHeight"]);

            return function(range) {
                if (!(range instanceof api.WrappedRange)) {
                    range = new api.WrappedRange(range);
                }
                var textRange = range.nativeRange;
                alert("HD")
                if (textRangeSupportsBoundingProperties) {
                    alert(textRange)
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
                } else {
                    return getRectFromBoundaries(range);
                }
            };

        }

        if (!rangeSupportsGetBoundingClientRect && !textRangeSupportsBoundingProperties) {
            // Test that <span> elements support getBoundingClientRect
            var span = document.createElement("span");
            elementSupportsGetBoundingClientRect = api.util.isHostMethod(span, "getBoundingClientRect");
            if (!elementSupportsGetBoundingClientRect) {
                module.fail("Neither range nor elements support getBoundingClientRect() method");
            }
        }
    })();

    api.getRangeBoundingClientRect = getRangeBoundingClientRect;

    
});
