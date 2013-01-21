/**
 * Highlighter module for Rangy, a cross-browser JavaScript range and selection library
 * http://code.google.com/p/rangy/
 *
 * Depends on Rangy core, TextRange and CssClassApplier modules.
 *
 * Copyright 2013, Tim Down
 * Licensed under the MIT license.
 * Version: 1.3alpha.738
 * Build date: 21 January 2013
 */
rangy.createModule("Highlighter", function(api, module) {
    api.requireModules( ["TextRange", "CssClassApplier"] );

    var dom = api.dom;
    var contains = dom.arrayContains;

    // Puts highlights in order, last in document first.
    function compareHighlights(h1, h2) {
        return h1.characterRange.start - h2.characterRange.start;
    }
    
    var forEach = [].forEach ?
        function(arr, func) {
            arr.forEach(func);
        } :
        function(arr, func) {
            for (var i = 0, len = arr.length; i < len; ++i) {
                func( arr[i] );
            }
        };

    var nextHighlightId = 1;

    /*----------------------------------------------------------------------------------------------------------------*/

    function Highlight(doc, characterRange, classApplier, id) {
        if (id) {
            this.id = id;
            nextHighlightId = Math.max(nextHighlightId, id + 1);
        } else {
            this.id = nextHighlightId++;
        }
        this.characterRange = characterRange;
        this.doc = doc;
        this.classApplier = classApplier;
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
            this.classApplier.undoToRange(this.getRange());
            this.applied = false;
        },
        
        apply: function() {
            this.classApplier.applyToRange(this.getRange());
            this.applied = true;
        },

        toString: function() {
            return "[Highlight(ID: " + this.id + ", class: " + this.classApplier.cssClass + ", character range: " +
                this.characterRange.start + " - " + this.characterRange.end + ")]";
        }
    };

    /*----------------------------------------------------------------------------------------------------------------*/

    /*
    - Highlight object with range, class applier and id
    - Serialize range plus class and id
     */

    function Highlighter(doc) {
        var highlighter = this;
        
        // Class applier must normalize so that it can restore the DOM exactly after removing highlights
        highlighter.doc = doc || document;
        highlighter.classAppliers = {};
        highlighter.highlights = [];
    }

    Highlighter.prototype = {
        addClassApplier: function(classApplier) {
            this.classAppliers[classApplier.cssClass] = classApplier;
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
            api.noMutation(function() {
                forEach(ranges, function(range) {
                    var selCharRange = range.toCharacterRange();
                    forEach(highlights, function(highlight) {
                        highlightCharRange = highlight.characterRange;
                        if (selCharRange.intersects(highlightCharRange) && !contains(intersectingHighlights, highlight)) {
                            intersectingHighlights.push(highlight);
                        }
                    });
                });
            });

            return intersectingHighlights;
        },

        highlightSelection: function(className, selection) {
            var i, j, len;
            selection = selection || api.getSelection();
            var classApplier = this.classAppliers[className];
            var highlights = this.highlights;
            var doc = this.doc, body = doc.body;

            if (!classApplier) {
                throw new Error("No class applier found for class '" + className + "'");
            }
            
            // Store the existing selection as character ranges
            var serializedSelection = selection.saveCharacterRanges(body);

            // Create an array of selected character ranges 
            var selCharRanges = [];
            api.noMutation(function() {
                for (i = 0, len = selection.rangeCount; i < len; ++i) {
                    selCharRanges[i] = selection.getRangeAt(i).toCharacterRange(body);
                }
            });

            var highlightsToRemove = [];

            var selCharRange, highlightCharRange, merged;
            for (i = 0, len = selCharRanges.length; i < len; ++i) {
                selCharRange = selCharRanges[i];
                merged = false;

                // Check for intersection with existing highlights. For each intersection, create a new highlight
                // which is the union of the highlight range and the selected range
                for (j = 0; j < highlights.length; ++j) {
                    highlightCharRange = highlights[j].characterRange;
                    
                    if (highlightCharRange.intersects(selCharRange)) {
                        // Replace the existing highlight in the list of current highlights and add it to the list for
                        // removal
                        highlightsToRemove.push(highlights[j]);
                        highlights[j] = new Highlight(doc, highlightCharRange.union(selCharRange), classApplier);
                    }
                }
                
                if (!merged) {
                    highlights.push( new Highlight(doc, selCharRange, classApplier) );
                }
            }
            
            // Remove the old highlights
            forEach(highlightsToRemove, function(highlightToRemove) {
                highlightToRemove.unapply();
            });
            
            // Apply new highlights
            forEach(highlights, function(highlight) {
                if (!highlight.applied) {
                    highlight.apply();
                }
            });
            
            // Restore selection
            selection.restoreCharacterRanges(body, serializedSelection);

            return highlights;
        },
        
        unhighlightSelection: function(selection) {
            selection = selection || api.getSelection();
            var intersectingHighlights = this.getIntersectingHighlights(selection.getAllRanges());

            // Now unhighlight all the highlighted ranges that overlap with the selection
            forEach(intersectingHighlights, function(highlight) {
                highlight.unapply();
            });

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

            forEach(highlights, function(highlight) {
                var characterRange = highlight.characterRange;
                serializedHighlights.push( [
                    characterRange.start,
                    characterRange.end,
                    highlight.id,
                    highlight.classApplier.cssClass
                ].join("$") );
            });

            return serializedHighlights.join("|");
        },

        deserialize: function(serialized) {
            var serializedHighlights = serialized.split("|");
            var highlights = [];
            var body = this.doc.body;
            for (var i = serializedHighlights.length, range, parts, classApplier, highlight; i-- > 0; ) {
                parts = serializedHighlights[i].split("$");
                range = api.createRange(this.doc);
                range.selectCharacters(body, +parts[0], +parts[1]);
                classApplier = this.classAppliers[parts[3]];
                highlight = new Highlight(this.doc, new api.CharacterRange(+parts[0], +parts[1]), classApplier, parts[2]);
                highlight.apply();
                highlights.push(highlight);
            }
            this.highlights = highlights;
        }
    };
    
    api.Highlighter = Highlighter;

    api.createHighlighter = function(classAppliers) {
        return new Highlighter(classAppliers);
    };
});
