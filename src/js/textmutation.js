rangy.createModule("TextMutation", function(api, module) {
    api.requireModules( ["WrappedSelection", "WrappedRange"] );

    var log = log4javascript.getLogger("rangy.textmutation");

    // TODO: Investigate best way to implement these
    function hasClass(el, cssClass) {
        if (el.className) {
            var classNames = el.className.split(" ");
            return api.util.arrayContains(classNames, cssClass);
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

    function getSortedClassName(el) {
        return el.className.split(" ").sort().join(" ");
    }

    function hasSameClasses(el1, el2) {
        return getSortedClassName(el1) == getSortedClassName(el2);
    }

    function fail(reason) {
        alert("TextMutation module for Rangy not supported in your browser. Reason: " + reason);
    }


    var returnFalseFunc = function() { return false; };
    var noOpFunc = function() {};

    function createTextMutator(options) {
        var apply = options.apply || noOpFunc;
        var undo = options.undo || noOpFunc;
        var checkApplied = options.checkApplied || returnFalseFunc;

        function applyToRange(range) {
            range.splitBoundaries();
            var textNodes = range.getNodes( [3] ), textNode;
            if (options.preApplyCallback) {
                options.preApplyCallback(textNodes, range);
            }

            for (var i = 0, len = textNodes.length; i < len; ++i) {
                textNode = textNodes[i];
                if (!checkApplied(textNode)) {
                    apply(textNode);
                }
            }
            range.setStart(textNodes[0], 0);
            textNode = textNodes[textNodes.length - 1];
            range.setEnd(textNode, textNode.length);
            log.info("Apply set range to '" + textNodes[0].data + "', '" + textNode.data + "'");
            if (options.postApplyCallback) {
                options.postApplyCallback(textNodes, range);
            }
        }

        function applyToSelection(win) {
            win = win || window;
            var sel = api.getSelection(win);
            var range, ranges = sel.getAllRanges();
            sel.removeAllRanges();
            for (var i = 0, len = ranges.length; i < len; ++i) {
                range = ranges[i];
                applyToRange(range);
                sel.addRange(range);
            }
        }

        function undoToRange(range) {
            range.splitBoundaries();
            var textNodes = range.getNodes( [3] ), textNode;

            if (options.preUndoCallback) {
                options.preUndoCallback(textNodes, range);
            }

            for (var i = 0, len = textNodes.length; i < len; ++i) {
                textNode = textNodes[i];
                if (checkApplied(textNode)) {
                    undo(textNode);
                }
            }
            range.setStart(textNodes[0], 0);
            textNode = textNodes[textNodes.length - 1];
            range.setEnd(textNode, textNode.length);
            log.info("Undo set range to '" + textNodes[0].data + "', '" + textNode.data + "'");

            if (options.postUndoCallback) {
                options.postUndoCallback(textNodes, range);
            }
        }

        function undoToSelection(win) {
            win = win || window;
            var sel = api.getSelection(win);
            var ranges = sel.getAllRanges(), range;
            sel.removeAllRanges();
            for (var i = 0, len = ranges.length; i < len; ++i) {
                range = ranges[i];
                undoToRange(range);
                sel.addRange(range);
            }
        }

        function isAppliedToRange(range) {
            var textNodes = range.getNodes( [3] );
            for (var i = 0, len = textNodes.length; i < len; ++i) {
                if (!checkApplied(textNodes[i])) {
                    return false;
                }
            }
            return true;
        }

        function isAppliedToSelection(win) {
            win = win || window;
            var sel = api.getSelection(win);
            var ranges = sel.getAllRanges();
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
        };
    }

    var nextCssId = 0;


    function createCssClassMutator(cssClass, normalize) {
        var uniqueCssClass = "rangy_" + (++nextCssId);
        normalize = (typeof normalize == "boolean") ? normalize : true;

        function createSpan(doc) {
            var span = doc.createElement("span");
            span.className = cssClass + " " + uniqueCssClass;
            return span;
        }

        function textNodeHasClass(textNode) {
            return elementHasClass(textNode.parentNode);
        }

        function elementHasClass(el) {
            return el.tagName.toLowerCase() == "span" && hasClass(el, uniqueCssClass);
        }

        function isRangySpan(node) {
            return node.nodeType == 1 && node.tagName.toLowerCase() == "span" && hasMatchingClass(node, /rangy_[\d]+/);
        }

        function Merge(firstNode) {
            this.isSpanMerge = (firstNode.nodeType == 1);
            this.firstTextNode = this.isSpanMerge ? firstNode.lastChild : firstNode;
            if (this.isSpanMerge) {
                this.sortedCssClasses = getSortedClassName(firstNode);
            }
            this.textNodes = [this.firstTextNode];
        }

        Merge.prototype = {
            doMerge: function() {
                var textBits = [], textNode, parent, text;
                for (var i = 0, len = this.textNodes.length; i < len; ++i) {
                    textNode = this.textNodes[i];
                    parent = textNode.parentNode;
                    textBits[i] = textNode.data;
                    if (i) {
                        parent.removeChild(textNode);
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

        function splitCssSpan(textNode) {
            var doc = api.dom.getDocument(textNode);
            var parent = textNode.parentNode, previous = textNode.previousSibling, next = textNode.nextSibling;
            var span, n;
            if (next) {
                span = doc.createElement("span");
                span.className = parent.className;
                for (n = next; n; n = textNode.nextSibling) {
                    span.appendChild(n);
                }
                api.dom.insertAfter(span, parent);
            }
            if (previous) {
                span = doc.createElement("span");
                span.className = parent.className;
                span.appendChild(textNode);
                api.dom.insertAfter(span, parent);
            }
        }

        var preApplyCallback = normalize ?
            function(textNodes, range) {
                log.group("preApplyCallback");
                var startNode = textNodes[0], endNode = textNodes[textNodes.length - 1];
                var startParent = startNode.parentNode, endParent = endNode.parentNode;
                var doc = api.dom.getDocument(startNode);
                var span;

                if (isRangySpan(startParent) && startParent.childNodes.length > 1) {
                    log.debug("Splitting start");
                    splitCssSpan(startNode);
                }

                if (isRangySpan(endParent) && endParent.childNodes.length > 1) {
                    log.debug("Splitting end");
                    splitCssSpan(endNode);
                }
                log.groupEnd();
            } : null;

        function getAdjacentMergeableTextNode(node, forward) {
            var isTextNode = (node.nodeType == 3);
            var el = isTextNode ? node.parentNode : node;
            var adjacentNode;
            var propName = forward ? "nextSibling" : "previousSibling";
            if (isRangySpan(el)) {
                // Compare element with its sibling
                adjacentNode = el[propName];
                if (adjacentNode && isRangySpan(adjacentNode) && hasSameClasses(el, adjacentNode)) {
                    return adjacentNode[forward ? "firstChild" : "lastChild"];
                }
            } else if (isTextNode) {
                // Can merge if the node's previous sibling is a text node
                adjacentNode = node[propName];
                if (adjacentNode && adjacentNode.nodeType == 3) {
                    return adjacentNode;
                }
            }
            return null;
        }

        var postApplyCallback = normalize ?
            function(textNodes, range) {
                log.group("postApplyCallback");
                var firstNode = textNodes[0], lastNode = textNodes[textNodes.length - 1];

                var merges = [], currentMerge;

                var rangeStartNode = firstNode, rangeEndNode = lastNode;
                var rangeStartOffset = 0, rangeEndOffset = lastNode.length;

                var textNode, precedingTextNode;

                for (var i = 0, len = textNodes.length; i < len; ++i) {
                    textNode = textNodes[i];
                    precedingTextNode = getAdjacentMergeableTextNode(textNode, false);
                    log.debug("Checking for merge. text node: " + textNode.data + ", preceding: " + (precedingTextNode ? precedingTextNode.data : null));
                    if (precedingTextNode) {
                        if (!currentMerge) {
                            currentMerge = new Merge(precedingTextNode);
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
                var nextTextNode = getAdjacentMergeableTextNode(lastNode, true);

                if (nextTextNode) {
                    if (!currentMerge) {
                        currentMerge = new Merge(lastNode);
                        merges.push(currentMerge);
                    }
                    currentMerge.textNodes.push(nextTextNode);
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
                log.groupEnd();
            } : null;


        return createTextMutator({
            apply: function(textNode) {
                log.group("Apply CSS class. textNode: " + textNode.data);
                var parent = textNode.parentNode;
                if (isRangySpan(parent) && parent.childNodes.length == 1) {
                    addClass(parent, cssClass);
                    addClass(parent, uniqueCssClass);
                } else {
                    var span = createSpan(api.dom.getDocument(textNode));
                    textNode.parentNode.insertBefore(span, textNode);
                    span.appendChild(textNode);
                }
                log.groupEnd();
            },

            preApplyCallback: preApplyCallback,

            postApplyCallback: postApplyCallback,

            preUndoCallback: preApplyCallback,

            postUndoCallback: postApplyCallback,

            checkApplied: textNodeHasClass,

            undo: function(textNode) {
                var el = textNode.parentNode;

                // Check whether the text node has siblings
                var nextNode = textNode.nextSibling, previousNode = textNode.previousSibling;
                var parent = el.parentNode;
                log.group("Undo, text node is " + textNode.data, el.className);
                if (nextNode && previousNode) {
                    // In this case we need to create a new span for the subsequent text node
                    var span = createSpan(api.dom.getDocument(textNode));
                    span.appendChild(nextNode);
                    api.dom.insertAfter(span, el);
                    span.parentNode.insertBefore(textNode, span);
                } else if (nextNode) {
                    parent.insertBefore(textNode, el);
                } else if (previousNode) {
                    api.dom.insertAfter(textNode, el);
                } else {
                    removeClass(el, cssClass);
                    removeClass(el, uniqueCssClass);
                    log.info("Removed classes. class now: " + el.className, isRangySpan(el));
                    log.debug("element contents: " + el.innerHTML);
                    if (!isRangySpan(el)) {
                        parent.insertBefore(textNode, el);
                        parent.removeChild(el);
                    }
                }
                log.groupEnd();
            }
        });
    }

    api.createCssClassMutator = createCssClassMutator;
});
