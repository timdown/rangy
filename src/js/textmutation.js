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
        //log.info("getTextNodesInRange", startNode.nodeValue, rangeStart.offset, endNode.nodeValue, rangeEnd.offset);

        // Split the start and end container text nodes, if necessary
        if (endNode.nodeType == 3) {
            if (split && rangeEnd.offset < endNode.length) {
                endNode.splitText(rangeEnd.offset);
                api.setRangeEnd(range, endNode, endNode.length);
            }
        } else if (endNode.hasChildNodes()) {
            endNode = lastTextNodeInOrBefore(endNode.childNodes[rangeEnd.offset - 1]);
        } else {
            endNode = lastTextNodeInOrBefore(endNode);
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
            startNode = firstTextNodeInOrAfter(startNode.childNodes[rangeStart.offset]);
        } else {
            startNode = firstTextNodeInOrAfter(startNode);
        }
        //log.info("Now: ", startNode.nodeValue, rangeStart.offset, endNode.nodeValue, rangeEnd.offset);

        //log.info("getTextNodesInRange start and end nodes equal: " + (startNode === endNode));

        return (startNode === endNode) ? [startNode] : getTextNodesBetween(startNode, endNode);
    }

    function createTextMutator(action, checkApplied, undoAction, state) {
        state = state || {};

        function applyToRange(range) {
            var textNodes = getTextNodesInRange(range, true), textNode;
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


    function createCssClassMutator(cssClass) {
        var state = {
            uniqueCssClass: "rangy_" + (++nextCssId)
        };

        function createSpan(doc) {
            var span = doc.createElement("span");
            span.className = cssClass + " " + state.uniqueCssClass;
            return span;
        }

        return createTextMutator(
            function(textNode, state) {
                log.warn("Apply CSS class. textNode: " + textNode.data);
                var span = createSpan(api.getDocument(textNode));
                textNode.parentNode.insertBefore(span, textNode);
                span.appendChild(textNode);
            },

            function(textNode, state) {
                var el = textNode.parentNode;
                return el.tagName.toLowerCase() == "span" && hasClass(el, state.uniqueCssClass);
            },

            function(textNode, state) {
                log.warn("Undo CSS class. textNode: " + textNode.data);
                var el = textNode.parentNode;

                // Check whether the text node has siblings
                var nextNode = textNode.nextSibling, previousNode = textNode.previousSibling;
                if (nextNode && previousNode) {
                    // In this case we need to create a new span for the subsequent text node
                    var span = createSpan(api.getDocument(textNode));
                    span.appendChild(nextNode);
                    api.insertAfter(span, el);
                    span.parentNode.insertBefore(textNode, span);
                } else if (nextNode) {
                    el.parentNode.insertBefore(textNode, el);
                } else if (previousNode) {
                    api.insertAfter(textNode, el);
                } else {
                    el.parentNode.insertBefore(textNode, el);
                    el.parentNode.removeChild(el);
                }
            },

            state
        );
    }

    api.createCssClassMutator = createCssClassMutator;
});
