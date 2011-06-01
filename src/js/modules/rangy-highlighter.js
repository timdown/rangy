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

    // Puts highlights in order, last in document first.
    function compareHighlights(h1, h2) {
        return h2.range.compareBoundaryPoints(h1.range.START_TO_START, h1.range);
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

    var nextHighlightId = 1;

    function Highlight(range, cssClassApplier, id) {
        if (id) {
            this.id = id;
            nextHighlightId = Math.max(nextHighlightId, id + 1);
        } else {
            this.id = nextHighlightId++;
        }
        this.range = range;
        this.cssClassApplier = cssClassApplier;
    }

    Highlight.prototype = {
        containsElement: function(el) {
            return this.range.containsNodeContents(el.firstChild);
        },

        toString: function() {
            return "[Highlight(ID: " + this.id + ", class: " + this.cssClassApplier.cssClass + ", range: " + this.range.inspect() + ")]";
        }
    };

    /*
    - Highlight object with range, class applier and id
    - Serialize range plus class and id
     */

    function Highlighter() {
        // CSS class applier must normalize so that it can restore the DOM exactly after removing highlights
        this.cssClassAppliers = {};
        this.highlights = [];
    }

    Highlighter.prototype = {
        addCssClassApplier: function(cssClassApplier) {
            this.cssClassAppliers[cssClassApplier.cssClass] = cssClassApplier;
        },

        getHighlightForElement: function(el) {
            for (var i = 0, len = this.highlights.length; i < len; ++i) {
                if (this.highlights[i].containsElement(el)) {
                    return this.highlights[i];
                }
            }
            return null;
        },

        highlightRanges: function(ranges, cssClassApplier) {
            log.info("Current highlights ", this.highlights, "Adding new ranges", ranges);

            var originalHighlights = this.highlights.slice(0);

            for (var i = 0, len = ranges.length; i < len; ++i) {
                this.highlights.push( new Highlight(ranges[i], cssClassApplier) );
            }

            this.highlights.sort(compareHighlights);

            var highlightRanges = [];
            for (i = 0, len = this.highlights.length; i < len; ++i) {
                highlightRanges[i] = this.highlights[i].range;
            }

            var rangeInfos = api.saveRanges(highlightRanges), range;
            log.info(rangeInfos);

            // Temporarily restore each highlight range in turn and add the highlight class if not already applied.
            for (i = rangeInfos.length; i-- > 0; ) {
                range = api.restoreRange(rangeInfos[i]);
                var applierForRange = cssClassApplier;

                for (var c in this.cssClassAppliers) {
                    if (this.cssClassAppliers.hasOwnProperty(c)) {
                        if (this.cssClassAppliers[c].isAppliedToRange(range)) {
                            applierForRange = this.cssClassAppliers[c];
                        }
                        this.cssClassAppliers[c].undoToRange(range);
                    }
                }
                applierForRange.applyToRange(range);
                rangeInfos[i] = api.saveRanges([range])[0];
            }

            var restoredRanges = api.restoreRanges(rangeInfos), newHighlights = [], highlight;
            for (i = 0, len = this.highlights.length; i < len; ++i) {
                highlight = this.highlights[i];
                highlight.range = restoredRanges[i];
                if (!contains(originalHighlights, highlight)) {
                    newHighlights.push(highlight);
                }
            }

            return newHighlights;
        },

        removeHighlights: function(highlights) {
            var ranges = [];
            for (var i = 0, len = highlights.length; i < len; ++i) {
                ranges[i] = highlights[i].range;
            }

            this.highlights.sort(compareHighlights);

            var rangeInfos = [], highlightRange;

            for (i = 0; i < this.highlights.length; ++i) {
                highlightRange = this.highlights[i].range;
                if (contains(ranges, highlightRange)) {
                    for (var c in this.cssClassAppliers) {
                        if (this.cssClassAppliers.hasOwnProperty(c)) {
                            this.cssClassAppliers[c].undoToRange(highlightRange);
                        }
                    }
                    this.highlights.splice(i--, 1);
                } else {
                    rangeInfos.push.apply(rangeInfos, api.saveRanges( [highlightRange] ));
                }
            }
            var restoredRanges = api.restoreRanges(rangeInfos);
            for (i = 0; i < this.highlights.length; ++i) {
                this.highlights[i].range = restoredRanges[i];
            }
        },

        getIntersectingHighlights: function(ranges) {
            // Test each range against each of the highlighted ranges to see whether they overlap
            var intersectingHighlights = [];
            for (var i = 0, len = ranges.length, selRange, highlightRange; i < len; ++i) {
                selRange = ranges[i];
                for (var j = 0, jLen = this.highlights.length; j < jLen; ++j) {
                    highlightRange = this.highlights[j].range;
                    if (selRange.intersectsRange(highlightRange) && !contains(intersectingHighlights, highlightRange)) {
                        intersectingHighlights.push(this.highlights[j]);
                    }
                }
            }
            return intersectingHighlights;
        },

        highlightSelection: function(cssClass, selection) {
            selection = selection || rangy.getSelection();
            var cssClassApplier = this.cssClassAppliers[cssClass];
            if (!cssClassApplier) {
                throw new Error("No CSS class applier found for class '" + cssClass + "'");
            }

            var ranges = selection.getAllRanges();
            for (var i = 0, len = ranges.length, highlightRange; i < len; ++i) {
                ranges[i] = ranges[i].cloneRange();

                // Check for intersection with existing highlights. For each intersection, extend the existing highlight
                // to be the union of the highlight range and the selected range
                for (var j = 0; j < this.highlights.length; ++j) {
                    highlightRange = this.highlights[j].range;
                    if (ranges[i].intersectsRange(highlightRange)) {
                        ranges[i] = ranges[i].union(highlightRange);
                        this.highlights.splice(j--, 1);
                    }
                }
            }

            selection.removeAllRanges();
            return this.highlightRanges(ranges, cssClassApplier);
        },

        unhighlightSelection: function(selection) {
            selection = selection || rangy.getSelection();
            var intersectingHighlights = this.getIntersectingHighlights(selection.getAllRanges());

            // Now unhighlight all the highlighted ranges that overlap with the selection
            if (intersectingHighlights.length > 0) {
                this.removeHighlights(intersectingHighlights);
                selection.removeAllRanges();
            }
        },

        selectionOverlapsHighlight: function(selection) {
            selection = selection || rangy.getSelection();
            return this.getIntersectingHighlights(selection.getAllRanges()).length > 0;
        },

        serialize: function() {
            if (this.highlights.length > 0) {
                this.highlights.sort(compareHighlights);

                // Remove all the highlights but preserve the ranges
                var highlightRanges = [];
                for (var i = 0, len = this.highlights.length; i < len; ++i) {
                    highlightRanges[i] = this.highlights[i].range;
                }

                var rangeInfos = api.saveRanges(highlightRanges), serializedHighlights = [], highlight, range;

                // Restore each range in turn and remove the highlight class
                for (i = rangeInfos.length; i-- > 0; ) {
                    range = api.restoreRange(rangeInfos[i]);
                    highlight = this.highlights[i];
                    log.info(range + ", " + range.inspect());
                    highlight.cssClassApplier.undoToRange(range);
                    serializedHighlights.push( highlight.id + "$" + highlight.cssClassApplier.cssClass
                            + "$" + api.serializeRange(range, true) );
                }

                this.highlights.length = 0;

                return serializedHighlights.join("|");
            } else {
                return "";
            }
        },

        deserialize: function(serialized, rootNode, doc) {
            var serializedHighlights = serialized.split("|");

            // Deserialize in reverse document order
            for (var i = serializedHighlights.length, range, parts, cssClassApplier; i-- > 0; ) {
                parts = serializedHighlights[i].split("$");
                range = api.deserializeRange(parts[2], rootNode, doc);
                cssClassApplier = this.cssClassAppliers[parts[1]];
                cssClassApplier.applyToRange(range);
                this.highlights.push( new Highlight(range, cssClassApplier, parseInt(parts[0], 10)) );
            }
        }
    };

    api.createHighlighter = function(cssClass, tagNames) {
        return new Highlighter(cssClass, tagNames);
    };
});
