/**
 * @license Highlighter module for Rangy, a cross-browser JavaScript range and selection library
 * http://code.google.com/p/rangy/
 *
 * Depends on Rangy core, SaveRestore, CssClassApplier and Serializer modules.
 *
 * Copyright %%build:year%%, Tim Down
 * Licensed under the MIT license.
 * Version: %%build:version%%
 * Build date: %%build:date%%
 */
rangy.createModule("Highlighter", function(api, module) {
    api.requireModules( ["SaveRestore", "Serializer", "CssClassApplier"] );

    var log = log4javascript.getLogger("rangy.Highlighter");

    // Puts ranges in last in document first.
    function compareRanges(r1, r2) {
        return r1.compareBoundaryPoints(r1.START_TO_START, r2);
    }

    function contains(arr, val) {
        var i = arr.length;
        while (i--) {
            if (arr[i] === val) {
                return true;
            }
        }
        return false;
    }

    function Highlighter(cssClass, tagNames) {
        // CSS class applier must normalize so that it can restore the DOM exactly after removing highlights
        this.cssClassApplier = api.createCssClassApplier(cssClass, true, tagNames);
        this.ranges = [];
    }

    Highlighter.prototype = {
        highlightRanges: function(ranges) {
            log.info("Current highlight ranges", this.ranges, "Adding new ranges", ranges);
            this.ranges.push.apply(this.ranges, ranges);
            var rangeInfos = api.saveRanges(this.ranges), range;
            log.info(rangeInfos);

            // Temporarily restore each range in turn and add the highlight class if not already applied.
            for (var i = rangeInfos.length; i-- > 0; ) {
                range = api.restoreRange(rangeInfos[i]);
                log.info(range + "," + range.inspect() + this.cssClassApplier.isAppliedToRange(range));
                if (!this.cssClassApplier.isAppliedToRange(range)) {
                    this.cssClassApplier.undoToRange(range);
                    this.cssClassApplier.applyToRange(range);
                }
                rangeInfos[i] = api.saveRanges([range])[0];
            }

            this.ranges = api.restoreRanges(rangeInfos);
            log.info("Current highlight ranges", this.ranges, "rangeInfos", rangeInfos);
        },

        unhighlightRanges: function(ranges) {
            this.ranges.sort(compareRanges);

            var rangeInfos = [];

            for (var i = 0, rangeCount = this.ranges.length; i < rangeCount; ++i) {
                if (contains(ranges, this.ranges[i])) {
                    this.cssClassApplier.undoToRange(this.ranges[i]);
                } else {
                    rangeInfos.push.apply(rangeInfos, api.saveRanges([this.ranges[i]]));
                }
            }
            this.ranges = api.restoreRanges(rangeInfos);
        },

        getIntersectingHighlightedRanges: function(ranges) {
            // Test each range against each of the highlighted ranges to see whether they overlap
            var intersectingHighlightRanges = [];
            for (var i = 0, len = ranges.length, selRange, highlightRange; i < len; ++i) {
                selRange = ranges[i];
                for (var j = 0, jLen = this.ranges.length; j < jLen; ++j) {
                    highlightRange = this.ranges[j];
                    if (selRange.intersectsRange(highlightRange) && !contains(intersectingHighlightRanges, highlightRange)) {
                        intersectingHighlightRanges.push(highlightRange);
                    }
                }
            }
            return intersectingHighlightRanges;
        },

        highlightSelection: function(selection) {
            selection = selection || rangy.getSelection();
            var ranges = selection.getAllRanges();
            for (var i = 0, len = ranges.length, highlightRange; i < len; ++i) {
                ranges[i] = ranges[i].cloneRange();

                // Check for intersection with existing highlights. For each intersection, extend the existing highlight
                // to be the union of the highlight range and the selected range
                for (var j = 0; j < this.ranges.length; ++j) {
                    highlightRange = this.ranges[j];
                    if (ranges[i].intersectsRange(highlightRange)) {
                        ranges[i] = ranges[i].union(highlightRange);
                        this.ranges.splice(j--, 1);
                    }
                }
            }

            selection.removeAllRanges();
            this.highlightRanges(ranges);
        },

        unhighlightSelection: function(selection) {
            selection = selection || rangy.getSelection();
            var ranges = selection.getAllRanges();
            var intersectingHighlightRanges = this.getIntersectingHighlightedRanges(ranges);

            // Now unhighlight all the highlighted ranges that overlap with the selection
            if (intersectingHighlightRanges.length > 0) {
                this.unhighlightRanges(intersectingHighlightRanges);
                selection.removeAllRanges();
            }
        },

        serialize: function() {
            if (this.ranges.length > 0) {
                // Remove all the highlights but preserve the ranges
                var rangeInfos = api.saveRanges(this.ranges), serializedRanges = [];

                // Restore each range in turn and remove the highlight class
                for (var i = rangeInfos.length, range; i-- > 0; ) {
                    range = api.restoreRange(rangeInfos[i]);
                    log.info(range + ", " + range.inspect());
                    this.cssClassApplier.undoToRange(range);
                    serializedRanges.push( api.serializeRange(range, true) );
                }

                return serializedRanges.join("|");
            } else {
                return "";
            }
        },

        deserialize: function(serialized, rootNode, doc) {
            var serializedRanges = serialized.split("|");

            // Deserialize in reverse document order
            for (var i = serializedRanges.length, range; i-- > 0; ) {
                range = api.deserializeRange(serializedRanges[i], rootNode, doc);
                this.cssClassApplier.applyToRange(range);
                this.ranges.push(range);
            }
        }
    };

    api.createHighlighter = function(cssClass, normalize, tagNames) {
        return new Highlighter(cssClass, normalize, tagNames);
    };
});
