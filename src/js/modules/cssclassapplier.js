rangy.createModule("CssClassApplier", function(api, module) {
    api.requireModules( ["WrappedSelection", "WrappedRange"] );

    var dom = api.dom;

    var log = log4javascript.getLogger("rangy.cssclassapplier");

    var tagName = "span";

    // TODO: Investigate best way to implement these

    function hasClass(el, cssClass) {
        return el.className && new RegExp("(^|\\s)" + cssClass + "(\\s|$)").test(el.className);
    }

    function addClass(el, cssClass) {
        if (el.className) {
            if (!hasClass(el, cssClass)) {
                el.className += " " + cssClass;
            }
        } else {
            el.className = cssClass;
        }
    }

    var removeClass = (function() {
        function replacer(matched, whitespaceBefore, whitespaceAfter) {
            return (whitespaceBefore && whitespaceAfter) ? " " : "";
        }

        return function(el, cssClass) {
            if (el.className) {
                el.className = el.className.replace(new RegExp("(^|\\s)" + cssClass + "(\\s|$)"), replacer);
            }
        };
    })();

    function hasMatchingClass(el, cssClassRegex) {
        if (el.className) {
            var classNames = el.className.split(/\s+/);
            var i = classNames.length;
            while (i--) {
                if (cssClassRegex.test(classNames[i])) {
                    return true;
                }
            }
        }
        return false;
    }

    function getSortedClassName(el) {
        return el.className.split(/\s+/).sort().join(" ");
    }

    function hasSameClasses(el1, el2) {
        return getSortedClassName(el1) == getSortedClassName(el2);
    }

    var uniqueCssClassRegex = /rangy_[\d]+/;
    var nextUniqueCssId = 0;

    function generateUniqueCssClass() {
        return "rangy_" + (++nextUniqueCssId);
    }

    function isRangyElement(node) {
        return node.nodeType == 1 && node.tagName.toLowerCase() == tagName && hasMatchingClass(node, uniqueCssClassRegex);
    }

    function makeTextNodeOnlyChild(textNode) {
        var doc = dom.getDocument(textNode);
        var parent = textNode.parentNode, previous = textNode.previousSibling, next = textNode.nextSibling;
        var el, n;
        if (next) {
            el = doc.createElement(tagName);
            el.className = parent.className;
            for (n = next; n; n = textNode.nextSibling) {
                el.appendChild(n);
            }
            dom.insertAfter(el, parent);
        }
        if (previous) {
            el = doc.createElement(tagName);
            el.className = parent.className;
            el.appendChild(textNode);
            dom.insertAfter(el, parent);
        }
    }

    function getAdjacentMergeableTextNode(node, forward) {
        var isTextNode = (node.nodeType == 3);
        var el = isTextNode ? node.parentNode : node;
        var adjacentNode;
        var propName = forward ? "nextSibling" : "previousSibling";
        if (isRangyElement(el)) {
            // Compare element with its sibling
            adjacentNode = el[propName];
            if (adjacentNode && isRangyElement(adjacentNode) && hasSameClasses(el, adjacentNode)) {
                return adjacentNode[forward ? "firstChild" : "lastChild"];
            }
        } else if (isTextNode) {
            // Can merge if the node's previous/next sibling is a text node
            adjacentNode = node[propName];
            if (adjacentNode && adjacentNode.nodeType == 3) {
                return adjacentNode;
            }
        }
        return null;
    }

    function Merge(firstNode) {
        this.isElementMerge = (firstNode.nodeType == 1);
        this.firstTextNode = this.isElementMerge ? firstNode.lastChild : firstNode;
        if (this.isElementMerge) {
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

    var anyCreated = false;

    function setTagName(tagNameParam) {
        if (anyCreated) {
            throw new Error("Too late to set tag name: CssClassAppliers already exist")
        } else {
            tagName = tagNameParam;
        }
    }

    function CssClassApplier(cssClass, normalize) {
        this.cssClass = cssClass;
        this.normalize = normalize;
        this.uniqueCssClass = generateUniqueCssClass();
        anyCreated = true;
    }

    CssClassApplier.setTagName = setTagName;

    CssClassApplier.prototype = {
        isAppliedToTextNode: function(textNode) {
            var el = textNode.parentNode;
            return el.tagName.toLowerCase() == tagName && hasClass(el, this.uniqueCssClass);
        },

        preApply: function(textNodes) {
            if (textNodes.length) {
                var startNode = textNodes[0], endNode = textNodes[textNodes.length - 1];
                var startParent = startNode.parentNode, endParent = endNode.parentNode;

                if (isRangyElement(startParent) && startParent.childNodes.length > 1) {
                    log.debug("Splitting start");
                    makeTextNodeOnlyChild(startNode);
                }

                if (isRangyElement(endParent) && endParent.childNodes.length > 1) {
                    log.debug("Splitting end");
                    makeTextNodeOnlyChild(endNode);
                }
            }
        },

        // Normalizes nodes after applying a CSS class to a Range.
        postApply: function(textNodes, range) {
            log.group("postApply");
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
                range.setStart(rangeStartNode, rangeStartOffset);
                range.setEnd(rangeEndNode, rangeEndOffset);
            }
            log.groupEnd();
        },

        createContainer: function(doc) {
            var el = doc.createElement(tagName);
            el.className = this.cssClass + " " + this.uniqueCssClass;
            return el;
        },

        applyToTextNode: function(textNode) {
            log.group("Apply CSS class. textNode: " + textNode.data);
            var parent = textNode.parentNode;
            if (isRangyElement(parent) && parent.childNodes.length == 1) {
                addClass(parent, this.cssClass);
                addClass(parent, this.uniqueCssClass);
            } else {
                var el = this.createContainer(dom.getDocument(textNode));
                textNode.parentNode.insertBefore(el, textNode);
                el.appendChild(textNode);
            }
            log.groupEnd();
        },

        undoToTextNode: function(textNode) {
            var el = textNode.parentNode;

            // Check whether the text node has siblings
            var nextNode = textNode.nextSibling, previousNode = textNode.previousSibling;
            var parent = el.parentNode;
            log.group("Undo, text node is " + textNode.data, el.className);
            if (nextNode && previousNode) {
                // In this case we need to create a new container element for the subsequent text node
                var containerEl = this.createContainer(dom.getDocument(textNode));
                containerEl.appendChild(nextNode);
                dom.insertAfter(containerEl, el);
                containerEl.parentNode.insertBefore(textNode, containerEl);
            } else if (nextNode) {
                parent.insertBefore(textNode, el);
            } else if (previousNode) {
                dom.insertAfter(textNode, el);
            } else {
                removeClass(el, this.cssClass);
                removeClass(el, this.uniqueCssClass);
                log.info("Removed classes. class now: " + el.className, isRangyElement(el));
                log.debug("element contents: " + el.innerHTML);
                if (!isRangyElement(el)) {
                    parent.insertBefore(textNode, el);
                    parent.removeChild(el);
                }
            }
            log.groupEnd();
        },

        applyToRange: function(range) {
            range.splitBoundaries();
            var textNodes = range.getNodes([3]);

            if (textNodes.length) {
                if (this.normalize) {
                    this.preApply(textNodes, range);
                }

                var textNode;

                for (var i = 0, len = textNodes.length; i < len; ++i) {
                    textNode = textNodes[i];
                    if (!this.isAppliedToTextNode(textNode)) {
                        this.applyToTextNode(textNode);
                    }
                }
                range.setStart(textNodes[0], 0);
                textNode = textNodes[textNodes.length - 1];
                range.setEnd(textNode, textNode.length);
                log.info("Apply set range to '" + textNodes[0].data + "', '" + textNode.data + "'");
                if (this.normalize) {
                    this.postApply(textNodes, range);
                }
            }
        },

        applyToSelection: function(win) {
            //log.group("applyToSelection");
            win = win || window;
            var sel = api.getSelection(win);
            var range, ranges = sel.getAllRanges();
            sel.removeAllRanges();
            var i = ranges.length;
            while (i--) {
                range = ranges[i];
                this.applyToRange(range);
                sel.addRange(range);
            }
            //log.groupEnd();
        },

        undoToRange: function(range) {
            range.splitBoundaries();
            var textNodes = range.getNodes( [3] ), textNode;

            if (textNodes.length) {
                if (this.normalize) {
                    this.preApply(textNodes, range);
                }

                for (var i = 0, len = textNodes.length; i < len; ++i) {
                    textNode = textNodes[i];
                    if (this.isAppliedToTextNode(textNode)) {
                        this.undoToTextNode(textNode);
                    }
                }

                range.setStart(textNodes[0], 0);
                textNode = textNodes[textNodes.length - 1];
                range.setEnd(textNode, textNode.length);
                log.info("Undo set range to '" + textNodes[0].data + "', '" + textNode.data + "'");

                if (this.normalize) {
                    this.postApply(textNodes, range);
                }
            }
        },

        undoToSelection: function(win) {
            win = win || window;
            var sel = api.getSelection(win);
            var ranges = sel.getAllRanges(), range;
            sel.removeAllRanges();
            for (var i = 0, len = ranges.length; i < len; ++i) {
                range = ranges[i];
                this.undoToRange(range);
                sel.addRange(range);
            }
        },

        isAppliedToRange: function(range) {
            range.splitBoundaries();
            var textNodes = range.getNodes( [3] );
            log.info("textNodes", textNodes);
            for (var i = 0, len = textNodes.length; i < len; ++i) {
                if (!this.isAppliedToTextNode(textNodes[i])) {
                    return false;
                }
            }
            return true;
        },

        isAppliedToSelection: function(win) {
            win = win || window;
            var sel = api.getSelection(win);
            var ranges = sel.getAllRanges();
            var i = ranges.length;
            while (i--) {
                if (!this.isAppliedToRange(ranges[i])) {
                    return false;
                }
            }
            log.groupEnd();
            return true;
        },

        toggleRange: function(range) {
            if (this.isAppliedToRange(range)) {
                this.undoToRange(range);
            } else {
                this.applyToRange(range);
            }
        },

        toggleSelection: function(win) {
            if (this.isAppliedToSelection(win)) {
                this.undoToSelection(win);
            } else {
                this.applyToSelection(win);
            }
        },

        detach: function(doc) {
            doc = doc || document;
            var els = doc.getElementsByTagName(tagName), i = els.length, el;
            var elsWithUniqueCssClass = [];
            while (i--) {
                if (hasClass(els[i], this.uniqueCssClass)) {
                    elsWithUniqueCssClass.push(els[i]);
                }
            }

            i = elsWithUniqueCssClass.length;
            while (i--) {
                removeClass(elsWithUniqueCssClass[i], this.uniqueCssClass);
            }
        }
    };

    function createCssClassApplier(cssClass, normalize) {
        return new CssClassApplier(cssClass, normalize);
    }

    api.CssClassApplier = CssClassApplier;
    api.createCssClassApplier = createCssClassApplier;
});
