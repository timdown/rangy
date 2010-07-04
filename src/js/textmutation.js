rangy.addInitListener(function(api) {
    var log = log4javascript.getLogger("rangy.textmutation");

    // TODO: Investigate best way to implement these
    function hasClass(el, cssClass) {
        if (el.className) {
            var classNames = el.className.split(" ");
            return api.arrayContains(classNames, cssClass);
        }
        return false;
    }

    function hasMatchingClass(el, cssClassRegex) {
        if (el.className) {
            var classNames = el.className.split(" ");
            var i = classNames.length;
            while (i--) {
                if (cssClassRegex.test(classNames[i])) {
                    return true;
                }
            }
        }
        return false;
    }

    function addClass(el, cssClass) {
        if (!hasClass(el, cssClass)) {
            if (el.className) {
                el.className += " " + cssClass;
            } else {
                el.className = cssClass;
            }
        }
    }

    function removeClass(el, cssClass) {
        if (hasClass(el, cssClass)) {
            // Rebuild the className property
            var existingClasses = el.className.split(" ");
            var newClasses = [];
            for (var i = 0, len = existingClasses.length; i < len; i++) {
                if (existingClasses[i] != cssClass) {
                    newClasses[newClasses.length] = existingClasses[i];
                }
            }
            el.className = newClasses.join(" ");
        }
    }

    function replaceClass(el, newCssClass, oldCssClass) {
        removeClass(el, oldCssClass);
        addClass(el, newCssClass);
    }

    function createNextPreviousNodeMover(isNext) {
        var f = function(node, includeChildren) {
            var sibling, parentNode;
            if (includeChildren && node.hasChildNodes()) {
                return node[isNext ? "firstChild" : "lastChild"];
            } else {
                sibling = node[isNext ? "nextSibling" : "previousSibling"];
                if (sibling) {
                    return sibling;
                } else {
                    parentNode = node.parentNode;
                    return parentNode ? f(node.parentNode, false) : null;
                }
            }
        };
        return f;
    }

    var previousNode = createNextPreviousNodeMover(false);
    var nextNode = createNextPreviousNodeMover(true);

    function createTextNodeFinder(first) {
        return function(node) {
            var n, f = first ? nextNode : previousNode;
            for ( n = node; n; n = f(n, true) ) {
                if (n.nodeType == 3) {
                    return n;
                }
            }
            return null;
        };
    }

    var firstTextNodeInOrAfter = createTextNodeFinder(true);
    var lastTextNodeInOrBefore = createTextNodeFinder(false);


    function fail(reason) {
        alert("TextMutation module for Rangy not supported in your browser. Reason: " + reason);
    }

    // Check for existence of working splitText method of a text node
    var testTextNode = document.createTextNode("test"), secondTextNode;
    document.body.appendChild(testTextNode);
    if (api.isHostMethod(testTextNode, "splitText")) {
        secondTextNode = testTextNode.splitText(2);
        if (testTextNode.data != "te" || !testTextNode.nextSibling || testTextNode.nextSibling.data != "st") {
            fail("incorrect implementation of text node splitText() method");
        }
    } else {
        fail("missing implementation of text node splitText() method");
    }
    document.body.removeChild(testTextNode);
    if (secondTextNode) {
        document.body.removeChild(secondTextNode);
    }

    function getTextNodesBetween(startTextNode, endTextNode) {
        var textNodes = [];
        for (var n = startTextNode; n && n !== endTextNode; n = nextNode(n, true)) {
            if (n.nodeType == 3) {
                textNodes.push(n);
            }
        }
        if (endTextNode.nodeType == 3) {
            textNodes.push(endTextNode);
        }
        return textNodes;
    }

    function getTextNodesInRange(range, split) {
        var rangeStart = api.getRangeStart(range), rangeEnd = api.getRangeEnd(range);
        var startNode = rangeStart.node, endNode = rangeEnd.node, tempNode;
        var startOffset = rangeStart.offset, endOffset = rangeEnd.offset;
        log.info("getTextNodesInRange", startNode.nodeValue, rangeStart.offset, endNode.nodeValue, rangeEnd.offset);

        // Split the start and end container text nodes, if necessary
        if (endNode.nodeType == 3) {
            if (split && rangeEnd.offset < endNode.length) {
                endNode.splitText(rangeEnd.offset);
                api.setRangeEnd(range, endNode, endNode.length);
            }
        } else if (endNode.hasChildNodes()) {
            tempNode = endNode.childNodes[rangeEnd.offset - 1] || previousNode(endNode.childNodes[rangeEnd.offset], true);
            endNode = lastTextNodeInOrBefore(tempNode);
            endOffset = endNode.length;
        } else {
            endNode = lastTextNodeInOrBefore(endNode);
            endOffset = endNode.length;
        }

        if (startNode.nodeType == 3) {
            //log.info("Start node is text: " + startNode.nodeValue, endNode.nodeValue);
            if (split && rangeStart.offset > 0) {
                tempNode = startNode.splitText(rangeStart.offset);
                if (endNode === startNode) {
                    endNode = tempNode;
                }
                startNode = tempNode;
                api.setRangeStart(range, startNode, 0);
            }
        } else if (startNode.hasChildNodes()) {
            tempNode = startNode.childNodes[rangeStart.offset] || nextNode(startNode.childNodes[rangeStart.offset - 1], true);
            startNode = firstTextNodeInOrAfter(tempNode);
            startOffset = 0;
        } else {
            startNode = firstTextNodeInOrAfter(startNode);
            startOffset = 0;
        }

        log.info("start:" + startNode + ", end:" + endNode);
        //log.info("Now: ", startNode.nodeValue, rangeStart.offset, endNode.nodeValue, rangeEnd.offset);

        //log.info("getTextNodesInRange start and end nodes equal: " + (startNode === endNode));

        return (startNode === endNode) ? [startNode] : getTextNodesBetween(startNode, endNode);
    }

    function createTextMutator(action, preActionCallback, actionCallback, checkApplied, undoAction, undoCallback, state) {
        state = state || {};

        function applyToRange(range) {
            var textNodes = getTextNodesInRange(range, true), textNode;

            if (preActionCallback) {
                preActionCallback(textNodes, range, state);
            }

            for (var i = 0, len = textNodes.length; i < len; ++i) {
                textNode = textNodes[i];
                if (!checkApplied(textNode, state)) {
                    action(textNode, state);
                }
            }
            api.setRangeStart(range, textNodes[0], 0);
            textNode = textNodes[textNodes.length - 1];
            api.setRangeEnd(range, textNode, textNode.length);
            log.info("Apply set range to '" + textNodes[0].data + "', '" + textNode.data + "'");
            if (actionCallback) {
                actionCallback(textNodes, range, state)
            }
        }

        function applyToSelection(win) {
            win = win || window;
            var sel = api.getSelection(win);
            var ranges = api.getAllSelectionRanges(sel), range;
            api.emptySelection(sel);
            for (var i = 0, len = ranges.length; i < len; ++i) {
                range = ranges[i];
                applyToRange(range);
                api.addRangeToSelection(sel, range);
            }
        }

        function undoToRange(range) {
            var textNodes = getTextNodesInRange(range, true), textNode;
            for (var i = 0, len = textNodes.length; i < len; ++i) {
                textNode = textNodes[i];
                if (checkApplied(textNode, state)) {
                    undoAction(textNode, state);
                }
            }
            api.setRangeStart(range, textNodes[0], 0);
            textNode = textNodes[textNodes.length - 1];
            api.setRangeEnd(range, textNode, textNode.length);
            log.info("Undo set range to '" + textNodes[0].data + "', '" + textNode.data + "'");
            if (undoCallback) {
                undoCallback(textNodes, range, state)
            }
        }

        function undoToSelection(win) {
            win = win || window;
            var sel = api.getSelection(win);
            var ranges = api.getAllSelectionRanges(sel), range;
            api.emptySelection(sel);
            for (var i = 0, len = ranges.length; i < len; ++i) {
                range = ranges[i];
                undoToRange(range);
                api.addRangeToSelection(sel, range);
            }
        }

        function isAppliedToRange(range) {
            var textNodes = getTextNodesInRange(range, false);
            for (var i = 0, len = textNodes.length; i < len; ++i) {
                if (!checkApplied(textNodes[i], state)) {
                    return false;
                }
            }
            return true;
        }

        function isAppliedToSelection(win) {
            win = win || window;
            var sel = api.getSelection(win);
            var ranges = api.getAllSelectionRanges(sel);
            for (var i = 0, len = ranges.length; i < len; ++i) {
                if (!isAppliedToRange(ranges[i])) {
                    return false;
                }
            }
            return true;
        }

        return {
            applyToSelection: applyToSelection,
            applyToRange: applyToRange,

            isAppliedToRange: isAppliedToRange,
            isAppliedToSelection: isAppliedToSelection,

            undoToRange: undoToRange,
            undoToSelection: undoToSelection,

            toggleRange: function(range) {
                if (isAppliedToRange(range)) {
                    undoToRange(range);
                } else {
                    applyToRange(range);
                }
            },

            toggleSelection: function(win) {
                if (isAppliedToSelection(win)) {
                    undoToSelection(win);
                } else {
                    applyToSelection(win);
                }
            }
        }
    }

    var nextCssId = 0;


    function createCssClassMutator(cssClass, normalize) {
        var state = {
            uniqueCssClass: "rangy_" + (++nextCssId)
        };

        function createSpan(doc) {
            var span = doc.createElement("span");
            span.className = cssClass + " " + state.uniqueCssClass;
            return span;
        }

        function textNodeHasClass(textNode) {
            return elementHasClass(textNode.parentNode);
        }

        function elementHasClass(el) {
            return el.tagName.toLowerCase() == "span" && hasClass(el, state.uniqueCssClass);
        }

        function nodeHasClass(node) {
            return node && node.nodeType == 1 && elementHasClass(node);
        }

        function isRangySpan(el) {
            return el.tagName.toLowerCase() == "span" && hasMatchingClass(el, /rangy_[\d]+/);
        }

        function Merge(firstTextNode) {
            this.firstTextNode = firstTextNode;
            this.textNodes = [firstTextNode];
        }

        Merge.prototype = {
            doMerge: function() {
                var textBits = [], node, parent, text;
                for (var i = 0, len = this.textNodes.length; i < len; ++i) {
                    node = this.textNodes[i], parent = node.parentNode;
                    textBits[i] = node.data;
                    if (i) {
                        parent.removeChild(node);
                        if (!parent.hasChildNodes()) {
                            parent.parentNode.removeChild(parent);
                        }
                    }
                }
                this.firstTextNode.data = text = textBits.join("");
                return text;
            },

            getLength: function() {
                var i = this.textNodes.length, len = 0;
                while (i--) {
                    len += this.textNodes[i].length;
                }
                return len;
            },

            toString: function() {
                var textBits = [];
                for (var i = 0, len = this.textNodes.length; i < len; ++i) {
                    textBits[i] = "'" + this.textNodes[i].data + "'";
                }
                return "[Merge(" + textBits.join(",") + ")]";
            }
        };

        var postApplyCallback = normalize ?
            function(textNodes, range, state) {
                var firstNode = textNodes[0], lastNode = textNodes[textNodes.length - 1];

                var merges = [], currentMerge;

                var rangeStartNode = firstNode, rangeEndNode = lastNode;
                var rangeStartOffset = 0, rangeEndOffset = lastNode.length;

                var textNode, precedingNode;

                for (var i = 0, len = textNodes.length; i < len; ++i) {
                    textNode = textNodes[i];
                    precedingNode = textNode.parentNode.previousSibling;
                    if (nodeHasClass(precedingNode)) {
                        if (!currentMerge) {
                            currentMerge = new Merge(precedingNode.lastChild);
                            merges.push(currentMerge);
                        }
                        currentMerge.textNodes.push(textNode);
                        if (textNode === firstNode) {
                            rangeStartNode = currentMerge.firstTextNode;
                            rangeStartOffset = rangeStartNode.length;
                        }
                        if (textNode === lastNode) {
                            rangeEndNode = currentMerge.firstTextNode;
                            rangeEndOffset = currentMerge.getLength();
                        }
                    } else {
                        currentMerge = null;
                    }
                }

                // Test whether the first node after the range needs merging
                var nextNode = lastNode.parentNode.nextSibling;

                if (nodeHasClass(nextNode)) {
                    if (!currentMerge) {
                        currentMerge = new Merge(lastNode);
                        merges.push(currentMerge);
                    }
                    currentMerge.textNodes.push(nextNode.firstChild);
                }

                // Do the merges
                if (merges.length) {
                    log.info("Merging. Merges:", merges);
                    for (i = 0, len = merges.length; i < len; ++i) {
                        merges[i].doMerge();
                    }
                    log.info(rangeStartNode.nodeValue, rangeStartOffset, rangeEndNode.nodeValue, rangeEndOffset);

                    // Set the range boundaries
                    api.setRangeStart(range, rangeStartNode, rangeStartOffset);
                    api.setRangeEnd(range, rangeEndNode, rangeEndOffset);
                }
            } : null;


        return createTextMutator(
            function(textNode, state) {
                log.warn("Apply CSS class. textNode: " + textNode.data);
                var parent = textNode.parentNode;
                if (isRangySpan(parent) && parent.childNodes.length == 1) {
                    addClass(parent, cssClass);
                    addClass(parent, state.uniqueCssClass);
                } else {
                    var span = createSpan(api.getDocument(textNode));
                    textNode.parentNode.insertBefore(span, textNode);
                    span.appendChild(textNode);
                }
            },

            function(textNodes, range, state) {
                var startNode = textNodes[0], endNode = textNodes[textNodes.length - 1];
                var startParent = startNode.parentNode, endParent = endNode.parentNode;
                var doc = api.getDocument(startNode);
                var span;

                if (isRangySpan(startParent) && startNode === startParent.lastChild) {
                    span = doc.createElement("span");
                    span.className = startParent.className;
                    span.appendChild(startNode);
                    api.insertAfter(span, startParent);
                }

                if (isRangySpan(endParent) && endNode === endParent.firstChild) {
                    span = doc.createElement("span");
                    span.className = endParent.className;
                    span.appendChild(endNode);
                    startParent.parentNode.insertBefore(span, startParent);
                }
            },

            postApplyCallback,

            textNodeHasClass,

            function(textNode, state) {
                log.warn("Undo CSS class. textNode: " + textNode.data);
                var el = textNode.parentNode;

                // Check whether the text node has siblings
                var nextNode = textNode.nextSibling, previousNode = textNode.previousSibling;
                var parent = el.parentNode;
                if (nextNode && previousNode) {
                    // In this case we need to create a new span for the subsequent text node
                    var span = createSpan(api.getDocument(textNode));
                    span.appendChild(nextNode);
                    api.insertAfter(span, el);
                    span.parentNode.insertBefore(textNode, span);
                } else if (nextNode) {
                    parent.insertBefore(textNode, el);
                } else if (previousNode) {
                    api.insertAfter(textNode, el);
                } else if (isRangySpan(parent)) {
                    removeClass(parent, cssClass);
                    removeClass(parent, state.uniqueCssClass);
                } else {
                    parent.insertBefore(textNode, el);
                    parent.removeChild(el);
                }
            },

            null,

            state
        );
    }

    api.createCssClassMutator = createCssClassMutator;
});
