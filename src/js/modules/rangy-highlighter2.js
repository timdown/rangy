/**
 * Highlighter module for Rangy, a cross-browser JavaScript range and selection library
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
    api.requireModules( ["SaveRestore", "TextRange", "CssClassApplier"] );

    var log = log4javascript.getLogger("rangy.Highlighter");
    var dom = api.dom;
    var contains = dom.arrayContains;

    // Puts highlights in order, last in document first.
    function compareHighlights(h1, h2) {
        return h2.range.compareBoundaryPoints(h1.range.START_TO_START, h1.range);
    }

    var nextHighlightId = 1;

    function Highlight(doc, characterRange, cssClassApplier, id) {
        if (id) {
            this.id = id;
            nextHighlightId = Math.max(nextHighlightId, id + 1);
        } else {
            this.id = nextHighlightId++;
        }
        //this.range = range;
        this.characterRange = characterRange;
        this.doc = doc;
        //this.characterRange = range.toCharacterRange(this.doc.body);
        this.cssClassApplier = cssClassApplier;
        this.applied = false;
    }

    Highlight.prototype = {
        getRange: function() {
            var range = api.createRange(this.doc);
            range.selectCharacters(this.doc.body, this.characterRange.start, this.characterRange.end);
        },
        
        containsElement: function(el) {
            return this.getRange().containsNodeContents(el.firstChild);
        },
        
        unapply: function() {
            this.cssClassApplier.undoToRange(this.getRange());
            this.applied = false;
        },
        
        apply: function() {
            this.cssClassApplier.applyToRange(this.getRange());
            this.applied = true;
        },

        toString: function() {
            return "[Highlight(ID: " + this.id + ", class: " + this.cssClassApplier.cssClass + ", character range: " +
                this.characterRange.start + " - " + this.characterRange.end + ")]";
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
            var highlights = this.highlights;
            for (var i = 0, len = highlights.length; i < len; ++i) {
                if (highlights[i].containsElement(el)) {
                    return highlights[i];
                }
            }
            return null;
        },

/*        highlightRanges: function(ranges, cssClassApplier) {
            log.info("Current highlights ", this.highlights, "Adding new ranges", ranges);

            var highlights = this.highlights, cssClassAppliers = this.cssClassAppliers;
            var originalHighlights = highlights.slice(0);

            for (var i = 0, len = ranges.length; i < len; ++i) {
                highlights.push( new Highlight(ranges[i], cssClassApplier) );
            }

            highlights.sort(compareHighlights);

            var highlightRanges = [];
            for (i = 0, len = highlights.length; i < len; ++i) {
                highlightRanges[i] = highlights[i].range;
            }

            var rangeInfos = api.saveRanges(highlightRanges), range;
            log.info(rangeInfos);

            // Temporarily restore each highlight range in turn and add the highlight class if not already applied.
            for (i = rangeInfos.length; i-- > 0; ) {
                range = api.restoreRange(rangeInfos[i]);
                var applierForRange = cssClassApplier;

                for (var c in cssClassAppliers) {
                    if (cssClassAppliers.hasOwnProperty(c)) {
                        if (cssClassAppliers[c].isAppliedToRange(range)) {
                            applierForRange = cssClassAppliers[c];
                        }
                        cssClassAppliers[c].undoToRange(range);
                    }
                }
                applierForRange.applyToRange(range);
                rangeInfos[i] = api.saveRanges([range])[0];
            }

            var restoredRanges = api.restoreRanges(rangeInfos), newHighlights = [], highlight;
            for (i = 0, len = highlights.length; i < len; ++i) {
                highlight = highlights[i];
                highlight.range = restoredRanges[i];
                if (!contains(originalHighlights, highlight)) {
                    newHighlights.push(highlight);
                }
            }

            return newHighlights;
        },*/

        removeHighlights: function(highlights) {
            var ranges = [];
            var currentHighlights = this.highlights, cssClassAppliers = this.cssClassAppliers;

            for (var i = 0, len = highlights.length; i < len; ++i) {
                ranges[i] = highlights[i].range;
            }

            currentHighlights.sort(compareHighlights);

            var rangeInfos = [], highlightRange;

            for (i = 0; i < currentHighlights.length; ++i) {
                highlightRange = currentHighlights[i].range;
                if (contains(ranges, highlightRange)) {
                    for (var c in cssClassAppliers) {
                        if (cssClassAppliers.hasOwnProperty(c)) {
                            cssClassAppliers[c].undoToRange(highlightRange);
                        }
                    }
                    currentHighlights.splice(i--, 1);
                } else {
                    rangeInfos.push.apply(rangeInfos, api.saveRanges( [highlightRange] ));
                }
            }
            var restoredRanges = api.restoreRanges(rangeInfos);
            for (i = 0; i < currentHighlights.length; ++i) {
                currentHighlights[i].range = restoredRanges[i];
            }
        },

        getIntersectingHighlights: function(ranges) {
            // Test each range against each of the highlighted ranges to see whether they overlap
            var intersectingHighlights = [], highlights = this.highlights;
            for (var i = 0, len = ranges.length, selRange, highlightRange; i < len; ++i) {
                selRange = ranges[i];
                for (var j = 0, jLen = highlights.length; j < jLen; ++j) {
                    highlightRange = highlights[j].range;
                    if (selRange.intersectsRange(highlightRange) && !contains(intersectingHighlights, highlightRange)) {
                        intersectingHighlights.push(highlights[j]);
                    }
                }
            }
            return intersectingHighlights;
        },

        highlightRanges: function(cssClassApplier, ranges) {
            
        },

        highlightSelection: function(cssClass, selection) {
            selection = selection || api.getSelection();
            var cssClassApplier = this.cssClassAppliers[cssClass];
            var highlights = this.highlights;
            var doc = dom.getDocument(selection.anchorNode), body = doc.body;

            if (!cssClassApplier) {
                throw new Error("No CSS class applier found for class '" + cssClass + "'");
            }
            
            // Store the existing selection as character ranges
            var serializedSelection = selection.saveCharacterRanges(body);

            // Create an array of selected character ranges 
            var selCharRanges = [];
            for (var i = 0, len = selection.rangeCount, j; i < len; ++i) {
                selCharRanges[i] = selection.getRangeAt(i).toCharacterRange(body);
            }

            var highlightsToRemove = [];

            var selCharRange, highlightCharRange;
            for (i = 0, len = selCharRanges.length; i < len; ++i) {
                selCharRange = selCharRanges[i];

                // Check for intersection with existing highlights. For each intersection, create a new highlight
                // which is the union of the highlight range and the selected range
                for (j = 0; j < highlights.length; ++j) {
                    highlightCharRange = highlights[j].characterRange;

                    if (highlightCharRange.start < selCharRange.end && highlightCharRange.end > selCharRange.start) {
                        highlights.push( new Highlight(
                            doc,
                            {
                                start: Math.min(highlightCharRange.start, selCharRanges.start),
                                end: Math.max(highlightCharRange.end, selCharRanges.end)
                            },
                            cssClassApplier
                        ) );
                        
                        // Remove the existing highlight from the list of current highlights and add it to the list for
                        // removal
                        highlightsToRemove.push(highlights[i]);
                        highlights.splice(j--, 1);
                    }
                }
            }
            
            // Remove the old highlights
            for (i = 0, len = highlightsToRemove.length; i < len; ++i) {
                highlightsToRemove[i].unapply();
            }
            
            // Apply new highlights
            for (i = 0, len = highlights.length; i < len; ++i) {
                if (!highlights[i].applied) {
                    highlights[i].apply();
                }
            }
            
            // Restore selection
            selection.restoreCharacterRanges(body, serializedSelection);

            return highlights;
        },

        unhighlightSelection: function(selection) {
            selection = selection || api.getSelection();
            var intersectingHighlights = this.getIntersectingHighlights(selection.getAllRanges());

            // Now unhighlight all the highlighted ranges that overlap with the selection
            if (intersectingHighlights.length > 0) {
                this.removeHighlights(intersectingHighlights);
                selection.removeAllRanges();
            }
        },

        selectionOverlapsHighlight: function(selection) {
            selection = selection || api.getSelection();
            return this.getIntersectingHighlights(selection.getAllRanges()).length > 0;
        },

        serialize: function() {
            var highlights = this.highlights;
            if (highlights.length > 0) {
                highlights.sort(compareHighlights);

                // Remove all the highlights but preserve the ranges
                var highlightRanges = [];
                for (var i = 0, len = highlights.length; i < len; ++i) {
                    highlightRanges[i] = highlights[i].range;
                }

                var rangeInfos = api.saveRanges(highlightRanges), serializedHighlights = [], highlight, range;

                // Restore each range in turn and remove the highlight class
                for (i = rangeInfos.length; i-- > 0; ) {
                    range = api.restoreRange(rangeInfos[i]);
                    highlight = highlights[i];
                    log.info(range + ", " + range.inspect());
                    highlight.cssClassApplier.undoToRange(range);
                    serializedHighlights.push( highlight.id + "$" + highlight.cssClassApplier.cssClass
                            + "$" + api.serializeRange(range, true) );
                }

                highlights.length = 0;

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
