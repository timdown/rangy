/*        if (selectRange) {
            api.selectRange = selectRange;

            // Create the save and restore API

            // Test document for DOM methods
            if ( areHostMethods(doc, ["getElementById", "createElement", "createTextNode"]) ) {
                testNode = doc.createElement("span");

                // Test DOM node for required methods
                if ( areHostMethods(testNode, ["appendChild", "removeChild"]) ) {

                    // Test Range/TextRange has required methods
                    if ( areHostMethods(testRange, ["collapse", "insertNode", "setStartAfter", "setEndBefore", "cloneRange", "detach"])
                            || areHostMethods(testRange, ["collapse", "pasteHTML", "setEndPoint", "moveToElementText", "duplicate"]) ) {

                        insertRangeBoundaryMarker = function(selectionInfo, atStart) {
                            var markerId = "selectionBoundary_" + new Date().getTime() + "_" + Math.random().toString().substr(2);
                            var range, markerEl;

                            if (selectionInfo.isDomRange) {
                                // Clone the Range and collapse to the appropriate boundary point
                                range = selectionInfo.range.cloneRange();
                                range.collapse(atStart);

                                // Create the marker element containing a single invisible character using DOM methods and insert it
                                markerEl = doc.createElement("span");
                                markerEl.id = markerId;
                                markerEl.appendChild( doc.createTextNode(markerTextChar) );
                                range.insertNode(markerEl);

                                // Make sure the current range boundary is preserved
                                selectionInfo.range[atStart ? "setStartAfter" : "setEndBefore"](markerEl);

                                range.detach();
                            } else {
                                // Clone the TextRange and collapse to the appropriate boundary point
                                range = selectionInfo.range.duplicate();
                                range.collapse(atStart);

                                // Create the marker element containing a single invisible character by creating literal HTML and insert it
                                range.pasteHTML('<span id="' + markerId + '">' + markerTextCharEntity + '</span>');
                                markerEl = doc.getElementById(markerId);

                                // Make sure the current range boundary is preserved
                                range.moveToElementText(markerEl);
                                selectionInfo.range.setEndPoint(atStart ? "StartToEnd" : "EndToStart", range);
                            }

                            return markerId;
                        };

                        setRangeBoundary = function(range, markerId, isDomRange, atStart) {
                            var markerEl = doc.getElementById(markerId);
                            var tempRange;

                            if (isDomRange) {
                                range[atStart ? "setStartAfter" : "setEndBefore"](markerEl);
                            } else {
                                tempRange = range.duplicate();
                                tempRange.moveToElementText(markerEl);
                                range.setEndPoint(atStart ? "StartToEnd" : "EndToStart", tempRange);
                            }

                            // Remove the marker element
                            markerEl.parentNode.removeChild(markerEl);
                        };

                        api.removeMarkerElement = function(markerId) {
                            var markerEl = doc.getElementById(markerId);
                            markerEl.parentNode.removeChild(markerEl);
                        };

                        api.saveSelection = function() {
                            var selectionInfo = getSelectionInfo( getSelection() );
                            var savedSelection = {
                                startMarkerId: insertRangeBoundaryMarker(selectionInfo, true),
                                endMarkerId: insertRangeBoundaryMarker(selectionInfo, false),
                                isDomRange: selectionInfo.isDomRange
                            };

                            // Ensure current selection is unaffected
                            selectRange( getSelection(), selectionInfo.range );

                            return savedSelection;
                        };

                        api.restoreSelection = function(savedSelection) {
                            var range = createRange();
                            setRangeBoundary(range, savedSelection.startMarkerId, savedSelection.isDomRange, true);
                            setRangeBoundary(range, savedSelection.endMarkerId, savedSelection.isDomRange, false);

                            // Select the range
                            selectRange( getSelection(), range );
                        };

                        api.removeMarkers = function(savedSelection) {
                            removeMarkerElement(savedSelection.startMarkerId);
                            removeMarkerElement(savedSelection.endMarkerId);
                        };

                        api.saveRestoreSupported = true;
                    }
                }
            }
        }*/
