/**
 * @license Commands module for Rangy.
 * Provides replacements for many document.execCommand() commands, applicable to Ranges and Selections.
 *
 * Part of Rangy, a cross-browser JavaScript range and selection library
 * http://code.google.com/p/rangy/
 *
 * Depends on Rangy core.
 *
 * Algorithm is based on Aryeh Gregor's HTML Editing Commands specification
 * http://aryeh.name/gitweb.cgi?p=editcommands;a=blob_plain;f=editcommands.html;hb=HEAD
 *
 * Parts of this code are based on Aryeh Gregor's implementation of his algorithm
 * http://aryeh.name/spec/editcommands/autoimplementation.html
 *
 * Copyright %%build:year%%, Tim Down
 * Licensed under the MIT license.
 * Version: %%build:version%%
 * Build date: %%build:date%%
 */
rangy.createModule("Commands", function(api, module) {
    /*
    http://aryeh.name/spec/editcommands/autoimplementation.html
    https://bitbucket.org/ms2ger/dom-range/src/tip/test/
    http://aryeh.name/gitweb.cgi?p=editcommands;a=blob_plain;f=editcommands.html;hb=HEAD
     */

    api.requireModules( ["WrappedSelection", "WrappedRange"] );

    var dom = api.dom;
    var log = log4javascript.getLogger("rangy.commands");
    var tagName = "span", BOOLEAN = "boolean", UNDEF = "undefined";
    var getRootContainer = dom.getRootContainer;

    var getComputedStyleProperty;

    if (typeof window.getComputedStyle != UNDEF) {
        getComputedStyleProperty = function(el, propName) {
            return dom.getWindow(el).getComputedStyle(el, null)[propName];
        };
    } else if (typeof document.documentElement.currentStyle != UNDEF) {
        getComputedStyleProperty = function(el, propName) {
            return el.currentStyle[propName];
        };
    } else {
        module.fail("No means of obtaining computed style properties found");
    }

    /**
     * Returns the furthest ancestor of a Node as defined by DOM Range.
     */
    function getFurthestAncestor(node) {
        var root = node;
        while (root.parentNode != null) {
            root = root.parentNode;
        }
        return root;
    }

    /**
     * "contained" as defined by DOM Range: "A Node node is contained in a range
     * range if node's furthest ancestor is the same as range's root, and (node, 0)
     * is after range's start, and (node, length of node) is before range's end."
     */
    function isContained(node, range) {
        var pos1 = dom.comparePoints(node, 0, range.startContainer, range.startOffset);
        var pos2 = dom.comparePoints(node, getNodeLength(node), range.endContainer, range.endOffset);

        return getRootContainer(node) == getRootContainer(range.startContainer)
            && pos1 == 1
            && pos2 == -1;
    }

    /**
     * "A Node is effectively contained in a Range if either it is contained in the
     * Range; or it is the Range's start node, it is a Text node, and its length is
     * different from the Range's start offset; or it is the Range's end node, it
     * is a Text node, and the Range's end offset is not 0; or it has at least one
     * child, and all its children are effectively contained in the Range."
     */
    function isEffectivelyContained(node, range) {
        if (isContained(node, range)) {
            return true;
        }
        var isCharData = dom.isCharacterDataNode(node);
        if (node == range.startContainer && isCharData && dom.getNodeLength(node) != range.startOffset) {
            return true;
        }
        if (node == range.endContainer && isCharData && range.endOffset != 0) {
            return true;
        }
        if (node.childNodes.length != 0) {
            for (var i = 0, len = node.childNodes.length; i < len; ++i) {
                if (!isEffectivelyContained(node.childNodes[i], range)) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    // Opera 11 puts HTML elements in the null namespace, it seems.
    function isHtmlNode(node) {
        var ns;
        return typeof node.namespaceURI != UNDEF && (ns = node.namespaceURI) && ns == "http://www.w3.org/1999/xhtml";
    }


    var unwrappableTagNamesRegex = /^(h[1-6]|p|hr|pre|blockquote|ol|ul|li|dl|dt|dd|div|table|caption|colgroup|col|tbody|thead|tfoot|tr|th|td|address)$/i;
    var inlineDisplayRegex = /^inline(-block|-table)?$/i;

    /**
     * "An inline node is either a Text node, or an Element whose 'display'
     * property computes to 'inline', 'inline-block', or 'inline-table'."
     */
    function isInlineNode(node) {
        return dom.isCharacterDataNode(node) ||
                (node.nodeType == 1 && inlineDisplayRegex.test(getComputedStyleProperty(node, "display")));
    }

    function isNonBrInlineNode(node) {
        return isInlineNode(node) && node.nodeName.toLowerCase() != "br";
    }

    /**
     * "An unwrappable node is an HTML element which may not be used where only
     * phrasing content is expected (not counting unknown or obsolete elements,
     * which cannot be used at all); or any Element whose display property computes
     * to something other than 'inline', 'inline-block', or 'inline-table'; or any
     * node whose parent is not editable."
     */
    function isUnwrappable(node) {
        if (!node || node.nodeType != 1 || !isHtmlNode(node)) {
            return false;
        }

        if (!isInlineNode(node)) {
            return true;
        }

        return unwrappableTagNamesRegex.test(node.tagName);
    }

    function blockExtend(range) {
        // "Let start node, start offset, end node, and end offset be the start
        // and end nodes and offsets of the range."
        var startNode = range.startContainer,
            startOffset = range.startOffset,
            endNode = range.endContainer,
            endOffset = range.endOffset,
            startChildNode,
            endChildNode;

        // "Repeat the following steps:"
        while (true) {
            // "If start node is a Text or Comment node or start offset is 0,
            // set start offset to the index of start node and then set start
            // node to its parent."
            if (dom.isCharacterDataNode(startNode) || startOffset == 0) {
                startOffset = dom.getNodeIndex(startNode);
                startNode = startNode.parentNode;

            // "Otherwise, if start offset is equal to the length of start
            // node, set start offset to one plus the index of start node and
            // then set start node to its parent."
            } else if (startOffset == dom.getNodeLength(startNode)) {
                startOffset = 1 + dom.getNodeIndex(startNode);
                startNode = startNode.parentNode;

            // "Otherwise, if the child of start node with index start offset and
            // its previousSibling are both inline nodes and neither is a br,
            // subtract one from start offset."
            } else if ( (startChildNode = startNode.childNodes[startOffset])
                    && isNonBrInlineNode(startChildNode)
                    && isNonBrInlineNode(startChildNode.previousSibling)) {

                startOffset--;

            // "Otherwise, break from this loop."
            } else {
                break;
            }
        }

        // "Repeat the following steps:"
        while (true) {
            // "If end offset is 0, set end offset to the index of end node and
            // then set end node to its parent."
            if (endOffset == 0) {
                endOffset = dom.getNodeIndex(endNode);
                endNode = endNode.parentNode;

            // "Otherwise, if end node is a Text or Comment node or end offset
            // is equal to the length of end node, set end offset to one plus
            // the index of end node and then set end node to its parent."
            } else if (dom.isCharacterDataNode(endNode) || endOffset == dom.getNodeLength(endNode)) {
                endOffset = 1 + dom.getNodeIndex(endNode);
                endNode = endNode.parentNode;

            // "Otherwise, if the child of end node with index end offset and its
            // nextSibling are both inline nodes and neither is a br, add one
            // to end offset."
            } else if ( (endChildNode = endNode.childNodes[endOffset])
                    && isNonBrInlineNode(endChildNode)
                    && isNonBrInlineNode(endChildNode.previousSibling)) {

                endOffset++;

            // "Otherwise, break from this loop."
            } else {
                break;
            }
        }

        // "Let new range be a new range whose start and end nodes and offsets
        // are start node, start offset, end node, and end offset."
        var newRange = range.cloneRange();
        newRange.setStart(startNode, startOffset);
        newRange.setEnd(endNode, endOffset);

        // "Return new range."
        return newRange;
    }

    function clearValue(element, command) {
        // "If element's specified value for command is null, return the empty
        // list."
        if (getSpecifiedValue(element, command) === null) {
            return [];
        }

        // "If element is a simple modifiable element:"
        if (isSimpleModifiableElement(element)) {
            // "Let children be the children of element."
            var children = Array.prototype.slice.call(element.childNodes);

            // "While element has children, insert its first child into its parent
            // immediately before it, preserving ranges."
            while (element.childNodes.length) {
                movePreservingRanges(element.firstChild, element.parentNode, getNodeIndex(element));
            }

            // "Remove element from its parent."
            element.parentNode.removeChild(element);

            // "Return children."
            return children;
        }

        // "If command is "strikethrough", and element has a style attribute that
        // sets "text-decoration" to some value containing "line-through", delete
        // "line-through" from the value."
        if (command == "strikethrough"
        && element.style.textDecoration.indexOf("line-through") != -1) {
            if (element.style.textDecoration == "line-through") {
                element.style.textDecoration = "";
            } else {
                element.style.textDecoration = element.style.textDecoration.replace("line-through", "");
            }
            if (element.getAttribute("style") == "") {
                element.removeAttribute("style");
            }
        }

        // "If command is "underline", and element has a style attribute that sets
        // "text-decoration" to some value containing "underline", delete
        // "underline" from the value."
        if (command == "underline"
        && element.style.textDecoration.indexOf("underline") != -1) {
            if (element.style.textDecoration == "underline") {
                element.style.textDecoration = "";
            } else {
                element.style.textDecoration = element.style.textDecoration.replace("underline", "");
            }
            if (element.getAttribute("style") == "") {
                element.removeAttribute("style");
            }
        }

        // "If the relevant CSS property for command is not null, unset the CSS
        // property property of element."
        if (getRelevantCssProperty(command) !== null) {
            element.style[getRelevantCssProperty(command)] = '';
            if (element.getAttribute("style") == "") {
                element.removeAttribute("style");
            }
        }

        // "If element is a font element:"
        if (isHtmlNamespace(element.namespaceURI) && element.tagName == "FONT") {
            // "If command is "foreColor", unset element's color attribute, if set."
            if (command == "forecolor") {
                element.removeAttribute("color");
            }

            // "If command is "fontName", unset element's face attribute, if set."
            if (command == "fontname") {
                element.removeAttribute("face");
            }

            // "If command is "fontSize", unset element's size attribute, if set."
            if (command == "fontsize") {
                element.removeAttribute("size");
            }
        }

        // "If element is an a element and command is "createLink" or "unlink",
        // unset the href property of element."
        if (isHtmlElement(element)
        && element.tagName == "A"
        && (command == "createlink" || command == "unlink")) {
            element.removeAttribute("href");
        }

        // "If element's specified value for command is null, return the empty
        // list."
        if (getSpecifiedValue(element, command) === null) {
            return [];
        }

        // "Let new element be a new HTML element with name "span", with the
        // same attributes and ownerDocument as element."
        var newElement = element.ownerDocument.createElement("span");
        for (var j = 0; j < element.attributes.length; j++) {
            // FIXME: Namespaces?
            newElement.setAttribute(element.attributes[j].localName, element.attributes[j].value);
        }

        // "Insert new element into the parent of element immediately before it."
        element.parentNode.insertBefore(newElement, element);

        // "While element has children, append its first child as the last child of
        // new element, preserving ranges."
        while (element.childNodes.length) {
            movePreservingRanges(element.firstChild, newElement, newElement.childNodes.length);
        }

        // "Remove element from its parent."
        element.parentNode.removeChild(element);

        // "Return the one-Node list consisting of new element."
        return [newElement];
    }



    function Command(name, options) {
        this.name = name;
        if (typeof options == "object") {
            for (var i in options) {
                if (options.hasOwnProperty(i)) {
                    this[i] = options[i];
                }
            }
        }
    }

    Command.prototype = {
        relevantCssProperty: null,

        getSpecifiedValue: function(element) {
            
        },


        applyToRange: function(range) {
        },

        applyToSelection: function(win) {
            log.group("applyToSelection");
            win = win || window;
            var sel = api.getSelection(win);
            log.info("applyToSelection " + sel.inspect());
            var range, ranges = sel.getAllRanges();
            sel.removeAllRanges();
            var i = ranges.length;
            while (i--) {
                range = ranges[i];
                this.applyToRange(range);
                sel.addRange(range);
            }
            log.groupEnd();
        },

        undoToRange: function(range) {
            log.info("undoToRange " + range.inspect());
            range.splitBoundaries();
            var textNodes = range.getNodes( [3] ), textNode, appliedAncestor;

            if (textNodes.length) {
                for (var i = 0, len = textNodes.length; i < len; ++i) {
                    textNode = textNodes[i];
                    appliedAncestor = this.getAppliedAncestor(textNode);
                    if (appliedAncestor) {
                        this.undoToTextNode(textNode, range, appliedAncestor);
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

        isAppliedToElement: function(el) {
            return false;
        },

        isAppliedToRange: function(range) {
            var textNodes = range.getNodes( [3] );
            for (var i = 0, len = textNodes.length, selectedText; i < len; ++i) {
                selectedText = this.getTextSelectedByRange(textNodes[i], range);
                log.debug("text node: '" + textNodes[i].data + "', selectedText: '" + selectedText + "'", this.isAppliedToElement(textNodes[i].parentNode));
                if (selectedText != "" && !this.isAppliedToElement(textNodes[i].parentNode)) {
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

        execSelection: function(win, value, options) {
        },

        querySelectionValue: function(win) {
        }
    };

    Command.util = {
        getFurthestAncestor: getFurthestAncestor,
        isContained: isContained,
        isEffectivelyContained: isEffectivelyContained,
        isHtmlNode: isHtmlNode,
        isInlineNode: isInlineNode,
        isUnwrappable: isUnwrappable,
        blockExtend: blockExtend
    };

    var commandsByName = {};

    api.registerCommand = function(name, command) {
        if (!(command instanceof Command)) {
            throw module.createError("Object supplied is not a Command");
        }
        commandsByName[name.toLowerCase()] = command;
    };

    function getCommand(name) {
        var lowerName = name.toLowerCase();
        if (commandsByName.hasOwnProperty(lowerName)) {
            return commandsByName[lowerName];
        } else {
            throw module.createError("No command registered with the name '" + name + "'");
        }
    }

    api.execCommand = function(name, options) {
        var command = getCommand(name);
        command.applyToSelection(options);
    };

    api.getCommand = getCommand;
    api.Command = Command;

});