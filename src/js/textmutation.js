rangy.addInitListener(function(api) {
    var getTextNodesInRange;
    var log = log4javascript.getLogger("rangy.textmutation");

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


/*
    function nextNode(node, includeChildren) {
        var sibling, parent;
        if (includeChildren && node.hasChildNodes()) {
            return node.firstChild;
        } else {
            sibling = node.nextSibling;
            if (sibling) {
                return sibling;
            } else {
                parent = node.parentNode;
                return parent ? nextNode(parent, false) : null;
            }
        }
    }
*/

    function getTextNodesBetween(startTextNode, endTextNode) {
        var textNodes = [];
        for (var n = startTextNode; n !== endTextNode; n = nextNode(n, true)) {
            if (n.nodeType == 3) {
                textNodes.push(n);
            }
        }
        if (endTextNode.nodeType == 3) {
            textNodes.push(endTextNode);
        }
        return textNodes;
    }

    function actOnTextNodesInRange(range, func) {
        var rangeStart = api.getRangeStart(range), rangeEnd = api.getRangeEnd(range);
        var startNode = rangeStart.node, endNode = rangeEnd.node;

        // Split the start and end container text nodes, if necessary
        if (endNode.nodeType == 3) {
            if (rangeEnd.offset < endNode.length) {
                endNode.splitText(rangeEnd.offset);
                api.setRangeEnd(range, endNode, endNode.length);
            }
        } else if (endNode.hasChildNodes()) {
            endNode = lastTextNodeInOrBefore(endNode.childNodes[rangeEnd.offset - 1]);
        } else {
            endNode = lastTextNodeInOrBefore(endNode);
        }

        log.debug(rangeStart);

        if (startNode.nodeType == 3) {
            if (rangeStart.offset > 0) {
                startNode = startNode.splitText(rangeStart.offset);
                api.setRangeStart(range, startNode, 0);
            }
        } else if (startNode.hasChildNodes()) {
            startNode = firstTextNodeInOrAfter(startNode.childNodes[rangeStart.offset]);
        } else {
            startNode = firstTextNodeInOrAfter(startNode);
        }

        var textNodes = getTextNodesBetween(startNode, endNode);
        log.info(textNodes);

        for (var i = 0, len = textNodes.length; i < len; ++i) {
            func(textNodes[i]);
        }
    }

    api.actOnTextNodesInRange = actOnTextNodesInRange;


    var nextCssId = 0;

    function addClassToRanges(ranges, cssClass) {
        var uniqueCssClass = "rangy_" + (++nextCssId);

        function addClassToTextNode(textNode) {
            var span = api.getDocument(textNode).createElement("span");
            span.className = cssClass + " " + uniqueCssClass;
            textNode.parentNode.insertBefore(span, textNode);
            span.appendChild(textNode);
        }

        for (var i = 0, len = ranges.length; i < len; ++i) {
            actOnTextNodesInRange(ranges[i], addClassToTextNode);
        }

        return uniqueCssClass;
    }

    function addClassToRange(range, cssClass) {
        return addClassToRanges([range], cssClass);
    }

    api.addClassToRanges = addClassToRanges;
    api.addClassToRange = addClassToRange;

    api.addClassToSelection = function(cssClass, win) {
        try {
            var ranges = api.getAllSelectionRanges(api.getSelection(win));
            return addClassToRanges(ranges, cssClass);
        } catch(ex) {
            log.fatal("addClassToSelection failed", ex);
        }
    };


});
