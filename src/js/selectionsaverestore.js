rangy.createModule("WrappedSelection", function(api, module) {
    api.requireModules( ["DomRange", "WrappedRange"] );

    var dom = api.dom;

    var markerTextChar = "\ufeff";

    function insertRangeBoundaryMarker(range, atStart) {
        var markerId = "selectionBoundary_" + new Date().getTime() + "_" + Math.random().toString().substr(2);
        var markerEl;
        var doc = dom.getDocument(range.startContainer);

        // Clone the Range and collapse to the appropriate boundary point
        var boundaryRange = range.cloneRange();
        boundaryRange.collapse(atStart);

        // Create the marker element containing a single invisible character using DOM methods and insert it
        markerEl = doc.createElement("span");
        markerEl.id = markerId;
        markerEl.appendChild(doc.createTextNode(markerTextChar));
        boundaryRange.insertNode(markerEl);

        // Make sure the current range boundary is preserved
        range[atStart ? "setStartAfter" : "setEndBefore"](markerEl);

        boundaryRange.detach();
        return markerId;
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
        var rangeInfos = [];
        for (var i = 0, len = ranges.length; i < len; ++i) {
            rangeInfos.push({
                startMarkerId: insertRangeBoundaryMarker(ranges[i], true),
                endMarkerId: insertRangeBoundaryMarker(ranges[i], false)
            });
        }

        // Ensure current selection is unaffected
        sel.setRanges(ranges);
        return {
            win: win,
            doc: win.document,
            rangeInfos: rangeInfos
        };
    }

    function restoreSelection(savedSelection) {
        var rangeInfos = savedSelection.rangeInfos;
        var sel = api.getSelection(savedSelection.win);
        sel.removeAllRanges();
        for (var i = 0, len = rangeInfos.length, rangeInfo, range; i < len; ++i) {
            rangeInfo = rangeInfos[i];
            range = api.createRange(savedSelection.doc);
            setRangeBoundary(savedSelection.doc, range, rangeInfo.startMarkerId, true);
            setRangeBoundary(savedSelection.doc, range, rangeInfo.endMarkerId, false);
            sel.addRange(range);
        }
    }

    function removeMarkerElement(doc, markerId) {
        var markerEl = doc.getElementById(markerId);
        markerEl.parentNode.removeChild(markerEl);
    }

    function removeMarkers(savedSelection) {
        var rangeInfos = savedSelection.rangeInfos;
        for (var i = 0, len = rangeInfos.length, rangeInfo; i < len; ++i) {
            rangeInfo = rangeInfos[i];
            removeMarkerElement(savedSelection.doc, rangeInfo.startMarkerId);
            removeMarkerElement(savedSelection.doc, rangeInfo.endMarkerId);
        }
    }

    api.saveRestore = {
        saveSelection: saveSelection,
        restoreSelection: restoreSelection,
        removeMarkerElement: removeMarkerElement,
        removeMarkers: removeMarkers
    };
});
