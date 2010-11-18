/**
 * @license Selection save and restore module for Rangy.
 * Saves and restores user selections using marker invisible elements in the DOM.
 *
 * Part of Rangy, a cross-browser JavaScript range and selection library
 * http://code.google.com/p/rangy/
 *
 * Depends on Rangy core.
 *
 * Copyright 2010, Tim Down
 * Licensed under the MIT license.
 * Version: %%build:version%%
 * Build date: %%build:date%%
 */
rangy.createModule("SaveRestore", function(api, module) {
    api.requireModules( ["DomUtil", "DomRange", "WrappedRange"] );

    var dom = api.dom;

    var markerTextChar = "\ufeff";

    function insertRangeBoundaryMarker(range, atStart) {
        var markerId = api.util.randomString("selectionBoundary_");
        var markerEl;
        var doc = dom.getDocument(range.startContainer);

        // Clone the Range and collapse to the appropriate boundary point
        var boundaryRange = range.cloneRange();
        boundaryRange.collapse(atStart);

        // Create the marker element containing a single invisible character using DOM methods and insert it
        markerEl = doc.createElement("span");
        markerEl.id = markerId;
        markerEl.style.lineHeight = "0";
        markerEl.appendChild(doc.createTextNode(markerTextChar));

        boundaryRange.insertNode(markerEl);
        boundaryRange.detach();
        return markerEl;
    }

    function setRangeBoundary(doc, range, markerId, atStart) {
        var markerEl = doc.getElementById(markerId);
        range[atStart ? "setStartBefore" : "setEndBefore"](markerEl);
        markerEl.parentNode.removeChild(markerEl);
    }

    function saveSelection(win) {
        win = win || window;
        var sel = api.getSelection(win);
        var ranges = sel.getAllRanges();
        var rangeInfos = [], startEl, endEl;
        for (var i = 0, len = ranges.length, range; i < len; ++i) {
            range = ranges[i];
            if (range.collapsed) {
                endEl = insertRangeBoundaryMarker(range, false);
                rangeInfos.push({
                    markerId: endEl.id,
                    collapsed: true
                });
                range.collapseBefore(endEl);
            } else {
                endEl = insertRangeBoundaryMarker(range, false);
                startEl = insertRangeBoundaryMarker(range, true);

                // Update the range after potential changes to ensure it stays selected
                range.setEndBefore(endEl);
                range.setStartAfter(startEl);

                rangeInfos.push({
                    startMarkerId: startEl.id,
                    endMarkerId: endEl.id,
                    collapsed: false,
                    backwards: len == 1 && sel.isBackwards()
                });
            }
        }

        // Ensure current selection is unaffected
        sel.setRanges(ranges);
        return {
            win: win,
            doc: win.document,
            rangeInfos: rangeInfos,
            restored: false
        };
    }

    function restoreSelection(savedSelection, preserveDirection) {
        if (!savedSelection.restored) {
            var rangeInfos = savedSelection.rangeInfos;
            var sel = api.getSelection(savedSelection.win);
            sel.removeAllRanges();
            for (var i = 0, len = rangeInfos.length, rangeInfo, range; i < len; ++i) {
                rangeInfo = rangeInfos[i];
                range = api.createRange(savedSelection.doc);
                if (rangeInfo.collapsed) {
                    var markerEl = savedSelection.doc.getElementById(rangeInfo.markerId);
                    var previousNode = markerEl.previousSibling;

                    // Workaround for issue 17
                    if (previousNode && previousNode.nodeType == 3) {
                        markerEl.parentNode.removeChild(markerEl);
                        range.collapseToPoint(previousNode, previousNode.length);
                    } else {
                        range.collapseBefore(markerEl);
                        markerEl.parentNode.removeChild(markerEl);
                    }
                } else {
                    setRangeBoundary(savedSelection.doc, range, rangeInfo.startMarkerId, true);
                    setRangeBoundary(savedSelection.doc, range, rangeInfo.endMarkerId, false);
                }
                range.normalizeBoundaries();
                var backwards = preserveDirection && rangeInfo.backwards && api.features.selectionHasExtend;
                sel.addRange(range, backwards);
            }
            savedSelection.restored = true;
        }
    }

    function removeMarkerElement(doc, markerId) {
        var markerEl = doc.getElementById(markerId);
        if (markerEl) {
            markerEl.parentNode.removeChild(markerEl);
        }
    }

    function removeMarkers(savedSelection) {
        var rangeInfos = savedSelection.rangeInfos;
        for (var i = 0, len = rangeInfos.length, rangeInfo; i < len; ++i) {
            rangeInfo = rangeInfos[i];
            if (savedSelection.collapsed) {
                removeMarkerElement(savedSelection.doc, rangeInfo.markerId);
            } else {
                removeMarkerElement(savedSelection.doc, rangeInfo.startMarkerId);
                removeMarkerElement(savedSelection.doc, rangeInfo.endMarkerId);
            }
        }
    }

    api.saveSelection = saveSelection;
    api.restoreSelection = restoreSelection;
    api.removeMarkerElement = removeMarkerElement;
    api.removeMarkers = removeMarkers;
});
