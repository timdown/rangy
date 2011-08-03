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
    var BOOLEAN = "boolean", UNDEF = "undefined";
    var getRootContainer = dom.getRootContainer;

    var defaultOptions = {
        applyToEditableOnly: false,
        styleWithCss: false,
        ignoreWhiteSpace: true
    };

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

    function isBefore(nodeA, nodeB) {
        var parentA = nodeA.parentNode, parentB = nodeB.parentNode;
        if (parentA && parentB) {
            return dom.comparePoints(nodeA.parentNode, dom.getNodeIndex(nodeA), nodeB.parentNode, dom.getNodeIndex(nodeB)) == -1;
        } else {
            return !parentA;
        }
    }

    var nodeListToArray;

    // Feature detect the browser's ability or otherwise to convert a NodeList into an array using slice
    (function() {
        var el = document.createElement("div");
        el.appendChild(document.createElement("span"));
        var slice = Array.prototype.slice;
        try {
            if (slice.call(el.childNodes, 0)[0].nodeType == 1) {
                nodeListToArray = function(nodeList) {
                    return slice.call(nodeList, 0);
                }
            }
        } catch (e) {}

        if (!nodeListToArray) {
            nodeListToArray = function(nodeList) {
                for (var i = 0, len = nodeList.length, nodeArray = []; i < len; ++i) {
                    nodeArray[i] = nodeList[i];
                }
                return nodeArray;
            }
        }
    })();

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

    var isEditableElement;

    (function() {
        var testEl = document.createElement("div");
        if (typeof testEl.isContentEditable == BOOLEAN) {
            isEditableElement = function(node) {
                return node && node.nodeType == 1 && node.isContentEditable;
            };
        } else {
            isEditableElement = function(node) {
                if (!node || node.nodeType != 1 || node.contentEditable == "false") {
                    return false;
                }
                return node.contentEditable == "true" || isEditableElement(node.parentNode);
            };
        }
    })();

    // The spec says "An editing host is a node that is either an Element with a contenteditable
    // attribute set to the true state, or the Element child of a Document whose designMode is enabled."
    //
    // Because Safari returns "true" for the contentEditable property of an element that actually inherits its
    // editability from its parent, we use a different definition:
    //
    // "An editing host is a node that is either an Element with a contenteditable attribute set to the true state but
    // whose parent node is not an element or has a contenteditable attribute set to a value other than the true state,
    // or the Element child of a Document whose designMode is enabled."
    function isEditingHost(node) {
        var parent;
        return node && node.nodeType == 1
            && (( (parent = node.parentNode) && parent.nodeType == 9 && parent.designMode == "on")
            || (isEditableElement(node) && !isEditableElement(node.parentNode)));
    }

    // The spec says "Something is editable if it is a node which is not an editing host, does
    // not have a contenteditable attribute set to the false state, and whose
    // parent is an editing host or editable."
    //
    // We're not making any distinction, unless the applyToEditableOnly global option is set to true. Rangy commands can
    // run on non-editable content. The revised definition:
    //
    // "A node is editable if it is not an editing host and is or is the child of an Element whose isContentEditable
    // property returns true."
    function isEditable(node, options) {
        return node &&
            ((options && !options.applyToEditableOnly)
                || (((isEditableElement(node) || (node.nodeType != 1 && isEditableElement(node.parentNode)))
                     && !isEditingHost(node) ) ));
    }

    // "contained" as defined by DOM Range: "A Node node is contained in a range
    // range if node's furthest ancestor is the same as range's root, and (node, 0)
    // is after range's start, and (node, length of node) is before range's end."
    function isContained(node, range) {
        return getRootContainer(node) == getRootContainer(range.startContainer)
            && dom.comparePoints(node, 0, range.startContainer, range.startOffset) == 1
            && dom.comparePoints(node, dom.getNodeLength(node), range.endContainer, range.endOffset) == -1;
    }

    // "A Node is effectively contained in a Range if either it is contained in the
    // Range; or it is the Range's start node, it is a Text node, and its length is
    // different from the Range's start offset; or it is the Range's end node, it
    // is a Text node, and the Range's end offset is not 0; or it has at least one
    // child, and all its children are effectively contained in the Range."
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
        var children = node.childNodes, childCount = children.length;
        if (childCount != 0) {
            for (var i = 0; i < childCount; ++i) {
                if (!isEffectivelyContained(children[i], range)) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    // Opera 11 puts HTML elements in the null namespace, it seems, and IE 7 has undefined namespaceURI
    function isHtmlNode(node) {
        var ns;
        return typeof (ns = node.namespaceURI) == UNDEF || (ns === null || ns == "http://www.w3.org/1999/xhtml");
    }


    var unwrappableTagNamesRegex = /^(h[1-6]|p|hr|pre|blockquote|ol|ul|li|dl|dt|dd|div|table|caption|colgroup|col|tbody|thead|tfoot|tr|th|td|address)$/i;
    var inlineDisplayRegex = /^inline(-block|-table)?$/i;

    // "An inline node is either a Text node, or an Element whose 'display'
    // property computes to 'inline', 'inline-block', or 'inline-table'."
    function isInlineNode(node) {
        return dom.isCharacterDataNode(node) ||
                (node.nodeType == 1 && inlineDisplayRegex.test(getComputedStyleProperty(node, "display")));
    }

    function isNullOrInlineNode(node) {
        return !node || isInlineNode(node);
    }

    function isNonBrInlineNode(node) {
        return isInlineNode(node) && node.nodeName.toLowerCase() != "br";
    }

    function isCollapsedWhiteSpaceNode(node) {
        if (node.data.length == 0) {
            return true;
        }
        if (/[^\r\n\t ]/.test(node.data)) {
            return false;
        }
        var cssWhiteSpace = getComputedStyleProperty(node.parentNode, "whiteSpace");
        switch (cssWhiteSpace) {
            case "normal":
                return true;
            case "pre":
            case "pre-wrap":
            case "-moz-pre-wrap":
                return false;
            case "pre-line":
                return !/[\r\n]/.test(node.data);
            default:
                return true;
        }
    }

    function isHtmlElement(node, tagNames) {
        if (!node || node.nodeType != 1 || !isHtmlNode(node)) {
            return false;
        }
        switch (typeof tagNames) {
            case "string":
                return node.tagName.toLowerCase() == tagNames.toLowerCase();
            case "object":
                return new RegExp("^(" + tagNames.join(",") + ")$", "i").test(node.tagName);
            default:
                return true;
        }
    }

    function isIgnoredNode(node, options) {
        // Ignore comment nodes
        if (node.nodeType == 8) {
            return true;
        } else if (node.nodeType == 3) {
            // Ignore text nodes that are within <script> and <style> elements
            if (node.parentNode && /^(script|style)$/i.test(node.parentNode.tagName)) {
                //log.fatal("IGNORED NODE " + dom.inspectNode(node));
                return true;
            }

            // Ignore whitespace nodes that are next to an unwrappable element
            if (options.ignoreWhiteSpace && !/[^\r\n\t ]/.test(node.data)
                    && (isUnwrappable(node.previousSibling, options) || isUnwrappable(node.nextSibling, options))) {
                return true;
            }
        }
        return false;
    }

    function elementOnlyHasAttributes(el, attrs) {
        log.debug("elementOnlyHasAttributes. attr length: " + el.attributes.length);
        for (var i = 0, len = el.attributes.length, attrName; i < len; ++i) {
            attrName = el.attributes[i].name;
            //log.info("name: " + attrName + ", specified: " + el.attributes[i].specified);
            if (el.attributes[i].specified && (!attrs || !dom.arrayContains(attrs, attrName))) {
                return false;
            }
        }
        return true;
    }

    // "A modifiable element is a b, em, i, s, span, strong, sub, sup, or u element
    // with no attributes except possibly style; or a font element with no
    // attributes except possibly style, color, face, and/or size; or an a element
    // with no attributes except possibly style and/or href."
    var modifiableElements = "b|em|i|s|span|strike|strong|sub|sup|u";
    var modifiableElementRegex = new RegExp("^(" + modifiableElements + ")$");

    function isModifiableElement(node, context) {
        //log.info("isModifiableElement nodeType " + node.nodeType + ", isHtmlNode " + isHtmlNode(node));
        if (!isHtmlElement(node)) {
            return false;
        }
        if (context && context.command.isModifiableElement) {
            return context.command.isModifiableElement(el, context);
        }
        var tagName = node.tagName.toLowerCase(), allowedAttributes;

        if (modifiableElementRegex.test(tagName)) {
            allowedAttributes = ["style", "class"];
        } else if (tagName == "a") {
            allowedAttributes = ["style", "class", "href"];
        } else if (tagName == "font") {
            allowedAttributes = ["style", "class", "color", "face", "size"];
        } else {
            return false;
        }
        return elementOnlyHasAttributes(node, allowedAttributes);
    }

    var simpleModifiableElements = modifiableElements + "|a|font";
    var simpleModifiableElementRegex = new RegExp("^(" + simpleModifiableElements + ")$");

    function isSimpleModifiableElement(el, context) {
        // "A simple modifiable element is an HTML element for which at least one
        // of the following holds:"
        if (!isHtmlElement(el)) {
            return false;
        }

        if (context && context.command.isSimpleModifiableElement) {
            return context.command.isSimpleModifiableElement(el, context);
        }

        // Only these elements can possibly be a simple modifiable element.
        var tagName = el.tagName.toLowerCase();
        if (!simpleModifiableElementRegex.test(tagName)) {
            return false;
        }

        // Extract attributes once and quit if more than one is found
        var attrName, attrValue, hasAnyAttrs = false;
        for (var i = 0, len = el.attributes.length; i < len; ++i) {
            //log.info("attr specified: " + el.attributes[i].specified + ", name " + el.attributes[i].name);
            if (el.attributes[i].specified) {
                // If it's got more than one attribute, everything after this fails.
                if (hasAnyAttrs) {
                    return false;
                } else {
                    attrName = el.attributes[i].name;
                    attrValue = el.getAttribute(attrName);
                    hasAnyAttrs = true;
                }
            }
        }

        // "It is an a, b, em, font, i, s, span, strike, strong, sub, sup, or u
        // element with no attributes."
        if (!hasAnyAttrs) {
            return true;
        }

        // "It is an a, b, em, font, i, s, span, strike, strong, sub, sup, or u
        // element with exactly one attribute, which is style, which sets no CSS
        // properties (including invalid or unrecognized properties)."
        if (attrName == "style" && el.style.cssText.length == 0) {
            return true;
        }

        // "It is an a element with exactly one attribute, which is href."
        if (tagName == "a" && attrName == "href") {
            return true;
        }

        // "It is a font element with exactly one attribute, which is either color,
        // face, or size."
        if (tagName == "font" && /^(color|face|size)$/.test(attrName)) {
            return true;
        }

        // Check style attribute and bail out if it has more than one property
        if ( attrName != "style" || (typeof el.style.length == "number" && el.style.length > 1) ||
                !/^[a-z\-]+:[^;]+;?\s?$/i.test(el.style.cssText)) {
            return false;
        }

        // "It is a b or strong element with exactly one attribute, which is style,
        // and the style attribute sets exactly one CSS property (including invalid
        // or unrecognized properties), which is "font-weight"."

        if ((tagName == "b" || tagName == "strong") && el.style.fontWeight != "") {
            return true;
        }

        // "It is an i or em element with exactly one attribute, which is style,
        // and the style attribute sets exactly one CSS property (including invalid
        // or unrecognized properties), which is "font-style"."
        if ((tagName == "i" || tagName == "em") && el.style.fontStyle != "") {
            return true;
        }

        // "It is a sub or sub element with exactly one attribute, which is style,
        // and the style attribute sets exactly one CSS property (including invalid
        // or unrecognized properties), which is "vertical-align"."
        if ((tagName == "sub" || tagName == "sup") && el.style.verticalAlign != "") {
            return true;
        }

        // "It is an a, font, or span element with exactly one attribute, which is
        // style, and the style attribute sets exactly one CSS property (including
        // invalid or unrecognized properties), and that property is not
        // "text-decoration"."
        if ((tagName == "a" || tagName == "font" || tagName == "span") && el.style.textDecoration == "") {
            return true;
        }

        // "It is an a, font, s, span, strike, or u element with exactly one
        // attribute, which is style, and the style attribute sets exactly one CSS
        // property (including invalid or unrecognized properties), which is
        // "text-decoration", which is set to "line-through" or "underline" or
        // "overline" or "none"."
        if (/^(a|font|s|span|strike|u)$/.test(tagName) && /^(line-through|underline|overline|none)$/.test(el.style.textDecoration)) {
            return true;
        }

        return false;
    }

    function addRangeMove(rangeMoves, range, oldParent, oldIndex, newParent, newIndex) {
        var sc = range.startContainer, so = range.startOffset,
            ec = range.endContainer, eo = range.endOffset;

        var newSc = sc, newSo = so, newEc = ec, newEo = eo;

        // "If a boundary point's node is the same as or a descendant of node,
        // leave it unchanged, so it moves to the new location."
        //
        // No modifications necessary.

        // "If a boundary point's node is new parent and its offset is greater than
        // new index, add one to its offset."
        if (sc == newParent && so > newIndex) {
            newSo++;
        }
        if (ec == newParent && eo > newIndex) {
            newEo++;
        }

        // "If a boundary point's node is old parent and its offset is old index or
        // old index + 1, set its node to new parent and add new index  old index
        // to its offset."
        if (sc == oldParent && (so == oldIndex  || so == oldIndex + 1)) {
            newSc = newParent;
            newSo += newIndex - oldIndex;
        }
        if (ec == oldParent && (eo == oldIndex || eo == oldIndex + 1)) {
            newEc = newParent;
            newEo += newIndex - oldIndex;
        }

        // "If a boundary point's node is old parent and its offset is greater than
        // old index + 1, subtract one from its offset."
        if (sc == oldParent && so > oldIndex + 1) {
            newSo--;
        }
        if (ec == oldParent && eo > oldIndex + 1) {
            newEo--;
        }

        if (newSc == sc && newSo == so && newEc == ec && newEo == eo) {
            rangeMoves.push([range, newSc, newSo, newEc, newEo]);
        }
    }

    function movePreservingRanges(node, newParent, newIndex, rangesToPreserve) {
        // For convenience, allow newIndex to be -1 to mean "insert at the end".
        if (newIndex == -1) {
            newIndex = newParent.childNodes.length;
        }

        // "When the user agent is to move a Node to a new location, preserving
        // ranges, it must remove the Node from its original parent (if any), then insert it
        // in the new location. In doing so, however, it must ignore the regular
        // range mutation rules, and instead follow these rules:"

        // "Let node be the moved Node, old parent and old index be the old parent
        // and index, and new parent and new index be the new parent and index."
        var oldParent = node.parentNode;
        var oldIndex = dom.getNodeIndex(node);

        var rangeMoves = [];

        for (var i = 0, len = rangesToPreserve.length; i < len; ++i) {
            addRangeMove(rangeMoves, rangesToPreserve[i], oldParent, oldIndex, newParent, newIndex);
        }

        // Now actually move the node.
        if (newParent.childNodes.length == newIndex) {
            newParent.appendChild(node);
        } else {
            newParent.insertBefore(node, newParent.childNodes[newIndex]);
        }

        // Set the new range boundaries
        log.debug("Node move: ", dom.inspectNode(node), "to", dom.inspectNode(newParent), newIndex);
        for (var j = 0, rangeMove; rangeMove = rangeMoves[j++]; ) {
            log.debug("Moving " + rangeMove[0].inspect(), dom.inspectNode(rangeMove[1]), rangeMove[2], dom.inspectNode(rangeMove[3]), rangeMove[4]);
            rangeMove[0].setStart(rangeMove[1], rangeMove[2]);
            rangeMove[0].setEnd(rangeMove[3], rangeMove[4]);
        }
    }

    function decomposeSubtree(rangeIterator, nodes) {
        nodes = nodes || [];
        for (var node, subRangeIterator; node = rangeIterator.next(); ) {
            if (rangeIterator.isPartiallySelectedSubtree()) {
                // The node is partially selected by the Range, so we can use a new RangeIterator on the portion of the
                // node selected by the Range.
                subRangeIterator = rangeIterator.getSubtreeIterator();
                decomposeSubtree(subRangeIterator, nodes);
                subRangeIterator.detach(true);
            } else {
                nodes.push(node);
            }
        }
        return nodes;
    }

    function decomposeRange(range, rangesToPreserve) {
        // "If range's start and end are the same, return an empty list."
        if (range.startContainer == range.endContainer && range.startOffset == range.endOffset) {
            return [];
        }

        range.splitBoundaries(rangesToPreserve);

        // "Let cloned range be the result of calling cloneRange() on range."
        var clonedRange = range.cloneRange();

        // "While the start offset of cloned range is 0, and the parent of cloned
        // range's start node is not null, set the start of cloned range to (parent
        // of start node, index of start node)."
        while (clonedRange.startOffset == 0 && clonedRange.startContainer.parentNode) {
            clonedRange.setStart(clonedRange.startContainer.parentNode, dom.getNodeIndex(clonedRange.startContainer));
        }

        // "While the end offset of cloned range equals the length of its end node,
        // and the parent of clone range's end node is not null, set the end of
        // cloned range to (parent of end node, 1 + index of end node)."
        while (clonedRange.endOffset == dom.getNodeLength(clonedRange.endContainer) && clonedRange.endContainer.parentNode) {
            clonedRange.setEnd(clonedRange.endContainer.parentNode, 1 + dom.getNodeIndex(clonedRange.endContainer));
        }

        // "Return a list consisting of every Node contained in cloned range in
        // tree order, omitting any whose parent is also contained in cloned
        // range."

        var iterator = new rangy.DomRange.RangeIterator(clonedRange, false);
        var nodes = decomposeSubtree(iterator);
        iterator.detach();
        return nodes;
    }

    function moveChildrenPreservingRanges(node, newParent, newIndex, removeNode, rangesToPreserve) {
        var child, children = [];
        while ( (child = node.firstChild) ) {
            movePreservingRanges(child, newParent, newIndex++, rangesToPreserve);
            children.push(child);
        }
        if (removeNode) {
            node.parentNode.removeChild(node);
        }
        return children;
    }

    function replaceWithOwnChildren(element, rangesToPreserve) {
        return moveChildrenPreservingRanges(element, element.parentNode, dom.getNodeIndex(element), true, rangesToPreserve);
    }

    function copyAttributes(fromElement, toElement) {
        var attrs = fromElement.attributes;

        for (var i = 0, len = attrs.length; i < len; ++i) {
            if (attrs[i].specified) {
                // For IE, which doesn't allow copying of the entire style object using get/setAttribute
                if (attrs[i].name == "style") {
                    toElement.style.cssText = toElement.style.cssText;
                } else {
                    toElement.setAttribute(attrs[i].name, attrs[i].value);
                }
            }
        }
    }

});