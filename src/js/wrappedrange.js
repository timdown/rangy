rangy.createModule("WrappedRange", function(api, module) {
    api.requireModules( ["DomRange"] );

    var WrappedRange;
    var dom = api.dom;
    var DomPosition = dom.DomPosition;
    var DomRange = rangy.DomRange;

    var log = log4javascript.getLogger("rangy.RangeWrappers");

    /*----------------------------------------------------------------------------------------------------------------*/

    // Gets the boundary of a TextRange expressed as a node and an offset within that node. This method is an improved
    // version of code found in Tim Cameron Ryan's IERange (http://code.google.com/p/ierange/), fixing problems that
    // library has with line breaks in preformatted text, optimizations and other bugs

    function BoundaryResult(position, cleanUpFunc, alteredDom) {
        this.position = position;
        this.cleanUpFunc = cleanUpFunc;
        this.alteredDom = alteredDom;
    }

    BoundaryResult.prototype.cleanUp = function() {
        if (this.cleanUpFunc) {
            this.cleanUpFunc();
        }
    };

    function getTextRangeBoundaryPosition(textRange, isStart) {
        var workingRange = textRange.duplicate();
        //log.debug("getTextRangeBoundaryPosition. Uncollapsed textrange parent is " + workingRange.parentElement().nodeName);
        var wholeRangeContainerElement = workingRange.parentElement();
        workingRange.collapse(isStart);
        //log.debug("getTextRangeBoundaryPosition. Collapsed textrange parent is " + workingRange.parentElement().nodeName);
        var containerElement = workingRange.parentElement();

        // Sometimes collapsing a TextRange that's at the start of a text node can move it into the previous node, so
        // check for that
        if (!dom.isAncestorOf(wholeRangeContainerElement, containerElement, true)) {
            containerElement = wholeRangeContainerElement;
            log.debug("Collapse has moved TextRange outside its original container, so correcting");
        }

        log.debug("getTextRangeBoundaryPosition start " + isStart + ", containerElement is " + containerElement.nodeName);

        // Deal with nodes that cannot "contain rich HTML markup". In practice, this means form inputs, images and
        // similar. See http://msdn.microsoft.com/en-us/library/aa703950%28VS.85%29.aspx
        if (!containerElement.canHaveHTML) {
            return new BoundaryResult(
                    new DomPosition(containerElement.parentNode, dom.getNodeIndex(containerElement)), null, false);
        }

        var workingNode = dom.getDocument(containerElement).createElement("span");
        var comparison, workingComparisonType = isStart ? "StartToStart" : "StartToEnd";
        var previousNode, nextNode, boundaryPosition, boundaryNode, tempRange, normalizedRangeText, cleanUpFunc = null;
        var alteredDom = false;

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
                alteredDom = true;

                // Now we create a function to be called later that glues the text nodes back together and removing the
                // inserted character
                cleanUpFunc = function() {
                    nextNode = boundaryNode.nextSibling;
                    boundaryNode.data = boundaryNode.data.slice(0, -1) + nextNode.data;
                    nextNode.parentNode.removeChild(nextNode);
                    textRange.collapse();
                };
            }
            boundaryPosition = new DomPosition(boundaryNode, normalizedRangeText.length);
        } else {
            // We've hit the boundary exactly, so this must be an element
            log.debug("Hit boundary exactly");

            // If the boundary immediately follows a character data node and this is the end boundary, we should favour
            // a position within that, and likewise for a start boundary precding a character data node
            previousNode = !isStart && workingNode.previousSibling;
            nextNode = isStart && workingNode.nextSibling;
            if (nextNode && dom.isCharacterDataNode(nextNode)) {
                boundaryPosition = new DomPosition(nextNode, 0);
            } else if (previousNode && dom.isCharacterDataNode(previousNode)) {
                boundaryPosition = new DomPosition(previousNode, previousNode.length);
            } else {
                boundaryPosition = new DomPosition(containerElement, dom.getNodeIndex(workingNode));
            }
        }

        // Clean up
        workingNode.parentNode.removeChild(workingNode);

        log.info("textrange text: " + textRange.text);

        return new BoundaryResult(boundaryPosition, cleanUpFunc, alteredDom);
    }

    // Returns a TextRange representing the boundary of a TextRange expressed as a node and an offset within that node.
    // This method is an optimized version of code found in Tim Cameron Ryan's IERange
    // (http://code.google.com/p/ierange/)
    function createBoundaryTextRange(boundaryPosition, isStart) {
        var boundaryNode, boundaryParent, boundaryOffset = boundaryPosition.offset;
        var doc = dom.getDocument(boundaryPosition.node);
        var workingNode, childNodes, workingRange = doc.body.createTextRange();
        var isAtStartOfElementContent = false, isAtEndOfElementContent = false;
        var nodeIsDataNode = dom.isCharacterDataNode(boundaryPosition.node);

        // There is a shortcut we can take that prevents the need to insert anything into the DOM if the boundary is at
        // either end of the contents of an element, which is to use TextRange's moveToElementText method

        if (nodeIsDataNode) {
            boundaryNode = boundaryPosition.node;
            boundaryParent = boundaryNode.parentNode;

            // Check if the boundary is at the start of end of the contents of an element
            if (boundaryParent.nodeType == 1) {
                if (boundaryOffset == 0 && !boundaryNode.previousSibling) {
                    isAtStartOfElementContent = true;
                } else if (boundaryOffset == boundaryNode.length && !boundaryNode.nextSibling) {
                    isAtEndOfElementContent = true;
                }
            }
        } else {
            childNodes = boundaryPosition.node.childNodes;

            // Check if the boundary is at the start of end of the contents of an element
            if (boundaryPosition.node.nodeType == 1) {
                if (boundaryOffset == 0) {
                    isAtStartOfElementContent = true;
                } else if (boundaryOffset == childNodes.length) {
                    isAtEndOfElementContent = true;
                }
            }

            boundaryNode = (boundaryOffset < childNodes.length) ? childNodes[boundaryOffset] : null;
            boundaryParent = boundaryPosition.node;
        }

        // Check if we can just use moveToElementText
        if (isAtStartOfElementContent || isAtEndOfElementContent) {
            log.info("createBoundaryTextRange moving to text of element " + boundaryParent.nodeName);
            workingRange.moveToElementText(boundaryParent);
            workingRange.collapse(isAtStartOfElementContent);
        } else {
            // Position the range immediately before the node containing the boundary
            workingNode = doc.createElement("span");

            // insertBefore is supposed to work like appendChild if the second parameter is null. However, a bug report
            // for IERange suggests that it can crash the browser: http://code.google.com/p/ierange/issues/detail?id=12
            if (boundaryNode) {
                boundaryParent.insertBefore(workingNode, boundaryNode);
            } else {
                boundaryParent.appendChild(workingNode);
            }

            workingRange.moveToElementText(workingNode);

            // Clean up
            boundaryParent.removeChild(workingNode);

            // Move the working range to the text offset, if required
            if (nodeIsDataNode) {
                workingRange[isStart ? "moveStart" : "moveEnd"]("character", boundaryOffset);
            }
        }

        return workingRange;
    }

    /*----------------------------------------------------------------------------------------------------------------*/

    if (api.features.implementsDomRange) {
        // This is a wrapper around the browser's native DOM Range. It has two aims:
        // - Provide workarounds for specific browser bugs
        // - provide convenient extensions, as found in Rangy's DomRange

        (function() {
            var rangeProto;
            var rangeProperties = DomRange.rangeProperties;
            var canSetRangeStartAfterEnd;

            function updateRangeProperties(range) {
                var i = rangeProperties.length, prop;
                while (i--) {
                    prop = rangeProperties[i];
                    range[prop] = range.nativeRange[prop];
                }
            }

            var createBeforeAfterNodeSetter;

            WrappedRange = function(range) {
                if (!range) {
                    throw new Error("Range must be specified");
                }
                this.nativeRange = range;
                updateRangeProperties(this);
            };

            rangeProto = WrappedRange.prototype = {
                selectNode: function(node) {
                    this.nativeRange.selectNode(node);
                    updateRangeProperties(this);
                },

                selectNodeContents: function(node) {
                    this.nativeRange.selectNodeContents(node);
                    updateRangeProperties(this);
                },

                deleteContents: function() {
                    this.nativeRange.deleteContents();
                    updateRangeProperties(this);
                },

                extractContents: function() {
                    var frag = this.nativeRange.extractContents();
                    updateRangeProperties(this);
                    return frag;
                },

                cloneContents: function() {
                    return this.nativeRange.cloneContents();
                },

                insertNode: function(node) {
                    this.nativeRange.insertNode(node);
                    updateRangeProperties(this);
                },

                surroundContents: function(node) {
                    this.nativeRange.surroundContents(node);
                    updateRangeProperties(this);
                },

                collapse: function(isStart) {
                    this.nativeRange.collapse(isStart);
                    updateRangeProperties(this);
                },

                cloneRange: function() {
                    return new WrappedRange(this.nativeRange.cloneRange());
                },

                toString: function() {
                    return this.nativeRange.toString();
                },

                detach: function() {
                    this.nativeRange.detach();
                    this.detached = true;
                    var i = rangeProperties.length, prop;
                    while (i--) {
                        prop = rangeProperties[i];
                        this[prop] = null;
                    }
                }
            };

            // Test for Firefox 2 bug that prevents moving the start of a Range to a point after its current end and
            // correct for it

            /*--------------------------------------------------------------------------------------------------------*/

            var testTextNode = document.createTextNode("test");
            document.body.appendChild(testTextNode);
            var range = document.createRange();
            range.setStart(testTextNode, 0);
            range.setEnd(testTextNode, 0);


            try {
                range.setStart(testTextNode, 1);
                canSetRangeStartAfterEnd = true;

                rangeProto.setStart = function(node, offset) {
                    this.nativeRange.setStart(node, offset);
                    updateRangeProperties(this);
                };

                rangeProto.setEnd = function(node, offset) {
                    this.nativeRange.setEnd(node, offset);
                    updateRangeProperties(this);
                };

                createBeforeAfterNodeSetter = function(name, oppositeName) {
                    return function(node) {
                        this.nativeRange[name](node);
                        updateRangeProperties(this);
                    };
                };

            } catch(ex) {
                log.info("Browser has bug (present in Firefox 2 and below) that prevents moving the start of a Range to a point after its current end. Correcting for it.");

                canSetRangeStartAfterEnd = false;

                rangeProto.setStart = function(node, offset) {
                    try {
                        this.nativeRange.setStart(node, offset);
                    } catch (ex) {
                        this.nativeRange.setEnd(node, offset);
                        this.nativeRange.setStart(node, offset);
                    }
                    updateRangeProperties(this);
                };

                rangeProto.setEnd = function(node, offset) {
                    try {
                        this.nativeRange.setEnd(node, offset);
                    } catch (ex) {
                        this.nativeRange.setStart(node, offset);
                        this.nativeRange.setEnd(node, offset);
                    }
                    updateRangeProperties(this);
                };

                createBeforeAfterNodeSetter = function(name, oppositeName) {
                    return function(node) {
                        try {
                            this.nativeRange[name](node);
                        } catch (ex) {
                            this.nativeRange[oppositeName](node);
                            this.nativeRange[name](node);
                        }
                        updateRangeProperties(this);
                    };
                };
            }

            rangeProto.setStartBefore = createBeforeAfterNodeSetter("setStartBefore", "setEndBefore");
            rangeProto.setStartAfter = createBeforeAfterNodeSetter("setStartAfter", "setEndAfter");
            rangeProto.setEndBefore = createBeforeAfterNodeSetter("setEndBefore", "setStartBefore");
            rangeProto.setEndAfter = createBeforeAfterNodeSetter("setEndAfter", "setStartAfter");

            /*--------------------------------------------------------------------------------------------------------*/

            // Test for WebKit bug that has the beahviour of compareBoundaryPoints round the wrong way for constants
            // START_TO_END and END_TO_START: https://bugs.webkit.org/show_bug.cgi?id=20738

            range.selectNodeContents(testTextNode);
            range.setEnd(testTextNode, 3);

            var range2 = document.createRange();
            range2.selectNodeContents(testTextNode);
            range2.setEnd(testTextNode, 4);
            range2.setStart(testTextNode, 2);

            if (range.compareBoundaryPoints(range.START_TO_END, range2) == -1 && range.compareBoundaryPoints(range.END_TO_START, range2) == 1) {
                // This is the wrong way round, so correct for it
                log.info("START_TO_END and END_TO_START wrong way round. Correcting in wrapper.");

                rangeProto.compareBoundaryPoints = function(type, range) {
                    range = range.nativeRange || range;
                    if (type == range.START_TO_END) {
                        type = range.END_TO_START;
                    } else if (type == range.END_TO_START) {
                        type = range.START_TO_END;
                    }
                    return this.nativeRange.compareBoundaryPoints(type, range);
                };
            } else {
                rangeProto.compareBoundaryPoints = function(type, range) {
                    return this.nativeRange.compareBoundaryPoints(type, range.nativeRange || range);
                };
            }

            /*--------------------------------------------------------------------------------------------------------*/

            // Add extension methods from DomRange
            var methodsToInherit = ["compareNode", "comparePoint", "createContextualFragment", "intersectsNode",
                "isPointInRange", "intersectsRange", "splitBoundaries", "normalizeBoundaries", "createNodeIterator",
                "getNodes", "containsNode", "containsNodeContents"];

            var i = methodsToInherit.length, methodName, domRangeProto = DomRange.prototype;
            while (i--) {
                methodName = methodsToInherit[i];
                rangeProto[methodName] = domRangeProto[methodName];
            }

            // Clean up
            document.body.removeChild(testTextNode);
            range.detach();
            range2.detach();

            DomRange.copyComparisonConstants(WrappedRange);
            DomRange.copyComparisonConstants(rangeProto);
        })();

    } else if (api.features.implementsTextRange) {
        // This is a wrapper around a TextRange, providing full DOM Range functionality using rangy's DomRange as a
        // prototype

        WrappedRange = function(textRange) {
            var start, end;
            if (textRange.text) {
                log.warn("Creating Range from TextRange. parent element: " + textRange.parentElement().nodeName);
                end = getTextRangeBoundaryPosition(textRange, false);
                start = getTextRangeBoundaryPosition(textRange, true);
                start.cleanUp();
                end.cleanUp();
                this.alteredDom = start.alteredDom || end.alteredDom;
            } else {
                end = start = getTextRangeBoundaryPosition(textRange, true);
                start.cleanUp();
                this.alteredDom = start.alteredDom;
            }

            this.setStart(start.position.node, start.position.offset);
            this.setEnd(end.position.node, end.position.offset);
        };

        WrappedRange.prototype = new DomRange(document);

        WrappedRange.rangeToTextRange = function(range) {
            var startRange = createBoundaryTextRange(new DomPosition(range.startContainer, range.startOffset), true);
            var endRange = createBoundaryTextRange(new DomPosition(range.endContainer, range.endOffset), false);
            var textRange = dom.getDocument(range.startContainer).body.createTextRange();
            textRange.setEndPoint("StartToStart", startRange);
            textRange.setEndPoint("EndToEnd", endRange);
            return textRange;
        };

        DomRange.copyComparisonConstants(WrappedRange);
        DomRange.copyComparisonConstants(WrappedRange.prototype);

        // Add WrappedRange as the Range property of the global object to allow expression like Range.END_TO_END to work
        var globalObj = (function() { return this; })();
        if (typeof globalObj.Range == "undefined") {
            globalObj.Range = WrappedRange;
        }
    }

    api.WrappedRange = WrappedRange;

    api.createNativeRange = function(doc) {
        if (rangy.features.implementsDomRange) {
            return doc.createRange();
        } else if (rangy.features.implementsTextRange) {
            return doc.body.createTextRange();
        }
    };

    api.createRange = function(doc) {
        return new WrappedRange(api.createNativeRange(doc));
    };

    api.createRangyRange = function(doc) {
        return new DomRange(doc);
    };
});