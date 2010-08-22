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
        for (var i = 0, len = ranges.length; i < len; ++i) {
            endEl = insertRangeBoundaryMarker(ranges[i], false);
            startEl = insertRangeBoundaryMarker(ranges[i], true);

            // Update the range after potential changes to ensure it stays selected
            ranges[i].setEndBefore(endEl);
            ranges[i].setStartAfter(startEl);

            rangeInfos.push({
                startMarkerId: startEl.id,
                endMarkerId: endEl.id
            });
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

    function restoreSelection(savedSelection) {
        if (!savedSelection.restored) {
            var rangeInfos = savedSelection.rangeInfos;
            var sel = api.getSelection(savedSelection.win);
            sel.removeAllRanges();
            for (var i = 0, len = rangeInfos.length, rangeInfo, range; i < len; ++i) {
                rangeInfo = rangeInfos[i];
                range = api.createRange(savedSelection.doc);
                setRangeBoundary(savedSelection.doc, range, rangeInfo.startMarkerId, true);
                setRangeBoundary(savedSelection.doc, range, rangeInfo.endMarkerId, false);
                range.normalizeBoundaries();
                sel.addRange(range);
            }
            savedSelection.restored = true;
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
