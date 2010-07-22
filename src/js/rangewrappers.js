rangy.addInitListener(function(api) {
    var WrappedRange;
    var dom = DomRange.util.dom;
    var DomPosition = DomRange.DomPosition;

    var log = log4javascript.getLogger("rangy.WrappedRange");

    /*----------------------------------------------------------------------------------------------------------------*/

    // Gets the boundary of a TextRange expressed as a node and an offset within that node. This method is an optimized
    // version of code found in Tim Cameron Ryan's IERange (http://code.google.com/p/ierange/)
    function getTextRangeBoundaryPosition(textRange, isStart) {
        var workingRange = textRange.duplicate();
        workingRange.collapse(isStart);
        var containerElement = workingRange.parentElement();
        var workingNode = dom.getDocument(containerElement).createElement("span");
        var comparison, workingComparisonType = isStart ? "StartToStart" : "StartToEnd";
        var boundaryPosition, boundaryNode;

        // Move the working range through the container's children, starting at
        // the end and working backwards, until the working range reaches or goes
        // past the boundary we're interested in
        do {
            containerElement.insertBefore(workingNode, workingNode.previousSibling);
            workingRange.moveToElementText(workingNode);
        } while ( (comparison = workingRange.compareEndPoints(workingComparisonType, textRange)) > 0 &&
                workingNode.previousSibling);

        // We've now reached or gone past the boundary of the text range we're interested in
        // so have identified the node we want
        boundaryNode = workingNode.nextSibling;
        if (comparison == -1 && boundaryNode) {
            // This must be a data node (text, comment, cdata) since we've overshot. The working
            // range is collapsed at the start of the node containing the text range's boundary,
            // so we move the end of the working range to the boundary point and measure the
            // length of its text to get the boundary's offset within the node
            workingRange.setEndPoint(isStart ? "EndToStart" : "EndToEnd", textRange);
            boundaryPosition = new DomPosition(boundaryNode, workingRange.text.length);
        } else {
            // We've hit the boundary exactly, so this must be an element
            boundaryPosition = new DomPosition(containerElement, dom.getNodeIndex(workingNode));
        }

        // Clean up
        workingNode.parentNode.removeChild(workingNode);

        return boundaryPosition;
    }

    // Returns a TextRange representing the boundary of a TextRange expressed as a node and an offset within that node.
    // This method is an optimized version of code found in Tim Cameron Ryan's IERange
    // (http://code.google.com/p/ierange/)
    function createBoundaryTextRange(boundaryPosition, isStart) {
        var boundaryNode, boundaryParent;
        var nodeIsDataNode = dom.isCharacterDataNode(boundaryPosition.node);
        var childNodes;

        if (nodeIsDataNode) {
            boundaryNode = boundaryPosition.node;
            boundaryParent = boundaryNode.parentNode;
        } else {
            childNodes = boundaryPosition.node.childNodes;
            boundaryNode = (boundaryPosition.offset < childNodes.length) ? childNodes[boundaryPosition.offset] : null;
            boundaryParent = boundaryPosition.node;
        }

        // Position the range immediately before the node containing the boundary
        var doc = dom.getDocument(boundaryPosition.node);
        var workingNode = doc.createElement("span");
        if (boundaryNode) {
            boundaryParent.insertBefore(workingNode, boundaryNode);
        } else {
            boundaryParent.appendChild(workingNode);
        }

        var workingRange = doc.body.createTextRange();
        workingRange.moveToElementText(workingNode);

        // Clean up
        boundaryParent.removeChild(workingNode);

        // Move the working range to the text offset, if required
        if (nodeIsDataNode) {
            workingRange[isStart ? "moveStart" : "moveEnd"]("character", boundaryPosition.offset);
        }

        return workingRange;
    }

    /*----------------------------------------------------------------------------------------------------------------*/

    if (api.features.rangesAreTextRanges) {
        WrappedRange = function(textRange) {
            var start = getTextRangeBoundaryPosition(textRange, true),
                end = getTextRangeBoundaryPosition(textRange, false);

            this.setStart(start.node, start.offset);
            this.setEnd(end.node, end.offset);
        };

        WrappedRange.prototype = new DomRange(document);
    } else {

    }

    // Add WrappedRange as the Range property of the global object to allow expression like Range.END_TO_END to work
    var globalObj = (function() { return this; })();
    if (typeof globalObj.Range == "undefined") {
        globalObj.Range = WrappedRange;
    }


    api.getSelectedRange = function() {
        if (window.getSelection) {
            //return new WrappedRange(window.getSelection().getRangeAt(0));
            return window.getSelection().getRangeAt(0);
        } else {
            return new WrappedRange(document.selection.createRange());
        }
    };

    api.reselect = function() {
        var r;
        if (window.getSelection) {
            //return new WrappedRange(window.getSelection().getRangeAt(0));
            r = window.getSelection().getRangeAt(0);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(r);
        } else {
            r = new WrappedRange(document.selection.createRange());
            var startRange = createBoundaryTextRange(r, true);
            var endRange = createBoundaryTextRange(r, false);
            var newRange = document.body.createTextRange();
            newRange.setEndPoint("StartToStart", startRange);
            newRange.setEndPoint("EndToEnd", endRange);
            newRange.select();
        }
    };
});