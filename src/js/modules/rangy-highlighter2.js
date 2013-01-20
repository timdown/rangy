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
        return h1.characterRange.start - h2.characterRange.start;
    }

    var nextHighlightId = 1;

    function Highlight(doc, characterRange, cssClassApplier, id) {
        if (id) {
            this.id = id;
            nextHighlightId = Math.max(nextHighlightId, id + 1);
        } else {
            this.id = nextHighlightId++;
        }
        this.characterRange = characterRange;
        this.doc = doc;
        this.cssClassApplier = cssClassApplier;
        this.applied = false;
    }

    Highlight.prototype = {
        getRange: function() {
            var range = api.createRange(this.doc);
            range.selectCharacters(this.doc.body, this.characterRange.start, this.characterRange.end);
            return range;
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

        removeHighlights: function(highlights) {
            for (var i = 0, len = this.highlights.length, highlight; i < len; ++i) {
                highlight = this.highlights[i];
                if (contains(highlights, highlight)) {
                    highlight.unapply();
                    this.highlights.splice(i--, 1);
                }
            }
        },

        getIntersectingHighlights: function(ranges) {
            // Test each range against each of the highlighted ranges to see whether they overlap
            var intersectingHighlights = [], highlights = this.highlights;
            api.transaction(function() {
                for (var i = 0, len = ranges.length, selRange, selCharRange, highlightCharRange, j, highlight; i < len; ++i) {
                    selCharRange = ranges[i].toCharacterRange();
                    for (j = 0; highlight = highlights[j++]; ) {
                        highlightCharRange = highlight.characterRange;
                        if (selCharRange.intersects(highlightCharRange) && !contains(intersectingHighlights, highlight)) {
                            intersectingHighlights.push(highlight);
                        }
                    }
                }
            });

            return intersectingHighlights;
        },

        highlightSelection: function(cssClass, selection) {
            var i, j, len;
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
            api.transaction(function() {
                for (i = 0, len = selection.rangeCount; i < len; ++i) {
                    selCharRanges[i] = selection.getRangeAt(i).toCharacterRange(body);
                }
            });

            var highlightsToRemove = [];

            var selCharRange, highlightCharRange, merged;
            for (i = 0, len = selCharRanges.length; i < len; ++i) {
                selCharRange = selCharRanges[i];
                merged = false;
                //console.log(selCharRange)

                // Check for intersection with existing highlights. For each intersection, create a new highlight
                // which is the union of the highlight range and the selected range
                for (j = 0; j < highlights.length; ++j) {
                    highlightCharRange = highlights[j].characterRange;
                    
                    if (highlightCharRange.intersects(selCharRange)) {
                        // Replace the existing highlight in the list of current highlights and add it to the list for
                        // removal
                        highlightsToRemove.push(highlights[j]);
                        highlights[j] = new Highlight(doc, highlightCharRange.union(selCharRange), cssClassApplier);
                    }
                }
                
                if (!merged) {
                    highlights.push( new Highlight(doc, selCharRange, cssClassApplier) );
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
            for (var i = 0, highlight; highlight = intersectingHighlights[i++]; ) {
                highlight.unapply();
            }
            selection.removeAllRanges();
        },

        selectionOverlapsHighlight: function(selection) {
            selection = selection || api.getSelection();
            return this.getIntersectingHighlights(selection.getAllRanges()).length > 0;
        },

        serialize: function() {
            var highlights = this.highlights;
            highlights.sort(compareHighlights);
            var serializedHighlights = [];
            for (var i = 0, highlight; highlight = highlights[i++]; ) {
                serializedHighlights.push( [
                    highlight.characterRange.start,
                    highlight.characterRange.end,
                    highlight.id,
                    highlight.cssClassApplier.cssClass
                ].join("$") );
            }
            return serializedHighlights.join("|");
        },

        deserialize: function(serialized, rootNode) {
            var serializedHighlights = serialized.split("|");
            var highlights = [];
            if (!rootNode) {
                rootNode = document.body;
            }
            var doc = dom.getDocument(rootNode);
            for (var i = serializedHighlights.length, range, parts, cssClassApplier, highlight; i-- > 0; ) {
                parts = serializedHighlights[i].split("$");
                range = api.createRange(doc);
                range.selectCharacters(rootNode, +parts[0], +parts[1]);
                cssClassApplier = this.cssClassAppliers[parts[3]];
                highlight = new Highlight(doc, new api.CharacterRange(+parts[0], +parts[1]), cssClassApplier, parts[2]);
                highlight.apply();
                highlights.push(highlight);
            }
            this.highlights = highlights;
        }
    };

    api.createHighlighter = function(cssClass, tagNames) {
        return new Highlighter(cssClass, tagNames);
    };
});
