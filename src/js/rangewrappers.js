rangy.createModule("RangeWrappers", function(api, module) {
    api.requireModules( ["DomRange"] );

    var WrappedRange;
    var dom = api.dom;
    var DomPosition = dom.DomPosition;
    var DomRange = rangy.DomRange;

    var log = log4javascript.getLogger("rangy.WrappedRange");

    /*----------------------------------------------------------------------------------------------------------------*/

    // Gets the boundary of a TextRange expressed as a node and an offset within that node. This method is an optimized
    // version of code found in Tim Cameron Ryan's IERange (http://code.google.com/p/ierange/)

    function BoundaryResult(position, cleanUpFunc) {
        this.position = position;
        this.cleanUpFunc = cleanUpFunc;
    }

    BoundaryResult.prototype.cleanUp = function() {
        if (this.cleanUpFunc) {
            this.cleanUpFunc();
        }
    };

    function getTextRangeBoundaryPosition(textRange, isStart) {
        var workingRange = textRange.duplicate();
        workingRange.collapse(isStart);
        var containerElement = workingRange.parentElement();

        // Deal with nodes such as inputs that cannot have children
        if (!containerElement.canHaveChildren) {
            return new BoundaryResult(new DomPosition(containerElement.parentNode, dom.getNodeIndex(containerElement)), null);
        }

        var workingNode = dom.getDocument(containerElement).createElement("span");
        var comparison, workingComparisonType = isStart ? "StartToStart" : "StartToEnd";
        var boundaryPosition, boundaryNode, tempRange, normalizedRangeText, cleanUpFunc = null;

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
        //log.info("boundaryNode: " + boundaryNode.nodeName + ":" + boundaryNode.nodeValue);
        if (comparison == -1 && boundaryNode) {
            // This must be a data node (text, comment, cdata) since we've overshot. The working
            // range is collapsed at the start of the node containing the text range's boundary,
            // so we move the end of the working range to the boundary point and measure the
            // length of its text to get the boundary's offset within the node
            workingRange.setEndPoint(isStart ? "EndToStart" : "EndToEnd", textRange);
            log.info("boundaryNode text: '" + boundaryNode.data + "', textRange text: '" + textRange.text + "'");

            // Ensure offsets are relative to the character data node's text. To do this, and to ensure trailing line
            // breaks are handled correctly, we use the text property of the TextRange to insert a character and split
            // the node in two after the inserted character. This is only
            normalizedRangeText = workingRange.text;

            if (/[\r\n]/.test(boundaryNode.data)) {
                // TODO: Try and stop this clobbering the selection
                // Insert a character. This is a little destructive but we can restore the node afterwards
                tempRange = workingRange.duplicate();
                tempRange.collapse(false);

                // The following line splits the character data node in two and appends a space to the end of the first
                // node. We can use this to our advantage to obtain the text we need to get an offset within the node
                tempRange.text = " ";
                normalizedRangeText = boundaryNode.data.slice(0, -1);

                // Now we create a function to be called later that glues the text nodes back together and removing the
                // inserted character
                cleanUpFunc = function() {
                    var nextNode = boundaryNode.nextSibling;
                    boundaryNode.data = boundaryNode.data.slice(0, -1) + nextNode.data;
                    nextNode.parentNode.removeChild(nextNode);
                    textRange.collapse();
                };
            }
            boundaryPosition = new DomPosition(boundaryNode, normalizedRangeText.length);
        } else {
            // We've hit the boundary exactly, so this must be an element
            boundaryPosition = new DomPosition(containerElement, dom.getNodeIndex(workingNode));
        }

        // Clean up
        workingNode.parentNode.removeChild(workingNode);

        log.info("textrange text: " + textRange.text);

        return new BoundaryResult(boundaryPosition, cleanUpFunc);
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

        // TODO: Is this branching necessary? Can we just use insertBefore with null second param?
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

    if (api.features.implementsDomRange) {

    } else if (api.features.implementsTextRange) {
        WrappedRange = function(textRange) {
            var start, end;
            if (textRange.text) {
                end = getTextRangeBoundaryPosition(textRange, false);
                start = getTextRangeBoundaryPosition(textRange, true);
                start.cleanUp();
                end.cleanUp();
            } else {
                end = start = getTextRangeBoundaryPosition(textRange, true);
                start.cleanUp();
            }

            this.setStart(start.position.node, start.position.offset);
            this.setEnd(end.position.node, end.position.offset);
            log.info("WrappedRange created", this.startContainer, this.startOffset, this.endContainer, this.endOffset);
        };

        WrappedRange.prototype = new DomRange(document);
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
            var startRange = createBoundaryTextRange(new DomPosition(r.startContainer, r.startOffset), true);
            var endRange = createBoundaryTextRange(new DomPosition(r.endContainer, r.endOffset), false);
            var newRange = document.body.createTextRange();
            newRange.setEndPoint("StartToStart", startRange);
            newRange.setEndPoint("EndToEnd", endRange);
            newRange.select();
        }
    };
});