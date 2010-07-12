rangy.addInitListener(function(api) {
    var markerTextChar = "\ufeff";
    var markerTextCharEntity = "&#xfeff;";

    var insertRangeBoundaryMarker;

    var saveSelection, setRangeBoundary, restoreSelection, removeMarkerElement, removeMarkers;

    insertRangeBoundaryMarker = function(range, atStart) {
        var markerId = "selectionBoundary_" + new Date().getTime() + "_" + Math.random().toString().substr(2);
        var markerEl;
        var doc = api.getRangeDocument(range);

        // Clone the Range and collapse to the appropriate boundary point
        range = api.cloneRange(range);
        range.collapse(atStart);

        // Create the marker element containing a single invisible character using DOM methods and insert it
        markerEl = doc.createElement("span");
        markerEl.id = markerId;
        markerEl.appendChild(doc.createTextNode(markerTextChar));
        api.insertNodeAtRangeBoundary(range, markerEl, atStart);

        // Make sure the current range boundary is preserved
        api[atStart ? "setRangeStartAfter" : "setRangeEndBefore"](range, markerEl);

        api.detachRange(range);
        return markerId;
    };

    setRangeBoundary = function(doc, range, markerId, atStart) {
        var markerEl = doc.getElementById(markerId);
        api[atStart ? "setRangeStartAfter" : "setRangeEndBefore"](range, markerEl);
        markerEl.parentNode.removeChild(markerEl);
    };

    saveSelection = function(win) {
        win = win || window;
        var sel = api.getSelection(win);
        var ranges = api.getAllSelectionRanges(sel);
        var rangeInfos = [];
        for (var i = 0, len = ranges.length; i < len; ++i) {
            rangeInfos.push({
                startMarkerId: insertRangeBoundaryMarker(ranges[i], true),
                endMarkerId: insertRangeBoundaryMarker(ranges[i], false)
            });
        }

        // Ensure current selection is unaffected
        api.selectRanges(sel, ranges);
        return {
            win: win,
            doc: win.document,
            rangeInfos: rangeInfos
        };
    };

    restoreSelection = function(savedSelection) {
        var rangeInfos = savedSelection.rangeInfos;
        var sel = api.getSelection(savedSelection.win);
        api.emptySelection(sel);
        for (var i = 0, len = rangeInfos.length, rangeInfo, range; i < len; ++i) {
            rangeInfo = rangeInfos[i];
            range = api.createRange(savedSelection.doc);
            setRangeBoundary(savedSelection.doc, range, rangeInfo.startMarkerId, true);
            setRangeBoundary(savedSelection.doc, range, rangeInfo.endMarkerId, false);
            api.addRangeToSelection(sel, range);
        }
    };

    removeMarkerElement = function(doc, markerId) {
        var markerEl = doc.getElementById(markerId);
        markerEl.parentNode.removeChild(markerEl);
    };

    removeMarkers = function(savedSelection) {
        var rangeInfos = savedSelection.rangeInfos;
        for (var i = 0, len = rangeInfos.length, rangeInfo; i < len; ++i) {
            rangeInfo = rangeInfos[i];
            removeMarkerElement(rangeInfo.startMarkerId);
            removeMarkerElement(rangeInfo.endMarkerId);
        }
    };

    api.saveRestore = {
        saveSelection: saveSelection,
        restoreSelection: restoreSelection,
        removeMarkerElement: removeMarkerElement,
        removeMarkers: removeMarkers
    };
});
