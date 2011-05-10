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

    var options = {
        styleWithCss: true,
        applyToEditableOnly: false
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
                for (var i = 0, len = nodeList.length, nodeArray; i < len; ++i) {
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

    function isEditableElement(node) {
        return node && node.nodeType == 1 && node.isContentEditable;
    }

    // The spec says "An editing host is a node that is either an Element with a contenteditable
    // attribute set to the true state, or a Document whose designMode is enabled."
    // Because Safari returns "true" for the contentEditable property of an element that actually inherits its
    // editability from its parent, we use a different definition:

    // "An editing host is a node that is either an Element whose isContentEditable property returns true but whose
    // parent node is not an element or whose isContentEditable property returns false, or a Document whose designMode
    // is enabled."
    function isEditingHost(node) {
        return node
            && ((node.nodeType == 9 && node.designMode == "on")
            || (isEditableElement(node) && !isEditableElement(node.parentNode)));
    }

    // The spec says "Something is editable if it is a node which is not an editing host, does
    // not have a contenteditable attribute set to the false state, and whose
    // parent is an editing host or editable."

    // We're not making any distinction, unless the applyToEditableOnly option is set to true. Rangy commands can run on
    // non-editable content. The revised definition:

    // "A node is editable if it is not an editing host and is or is the child of an Element whose isContentEditable
    // property returns true."
    function isEditable(node) {
        // This is slightly a lie, because we're excluding non-HTML elements with
        // contentEditable attributes.
        return !options.applyToEditableOnly
            || ( (isEditableElement(node) || isEditableElement(node.parentNode)) && !isEditingHost(node) );
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

    // Opera 11 puts HTML elements in the null namespace, it seems, and IE 7 has undefined namespaceURI
    function isHtmlNode(node) {
        var ns;
        return typeof (ns = node.namespaceURI) == UNDEF || (ns === null || ns == "http://www.w3.org/1999/xhtml");
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

        if (!isEditable(node)) {
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

    function elementOnlyHasAttributes(el, attrs) {
        log.info("elementOnlyHasAttributes. attr length: " + el.attributes.length);
        for (var i = 0, len = el.attributes.length, attrName; i < len; ++i) {
            attrName = el.attributes[i].name;
            log.info("name: " + attrName + ", specified: " + el.attributes[i].specified);
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

    function isModifiableElement(node) {
        log.info("isModifiableElement nodeType " + node.nodeType + ", isHtmlNode " + isHtmlNode(node))
        if (node.nodeType != 1 || !isHtmlNode(node)) {
            return false;
        }
        var tagName = node.tagName.toLowerCase(), allowedAttributes;

        if (modifiableElementRegex.test(tagName)) {
            allowedAttributes = ["style"];
        } else if (tagName == "a") {
            allowedAttributes = ["style", "href"];
        } else if (tagName == "font") {
            allowedAttributes = ["style", "color", "face", "size"];
        } else {
            return false;
        }
        return elementOnlyHasAttributes(node, allowedAttributes);
    }

    var simpleModifiableElements = modifiableElements + "|a|font";
    var simpleModifiableElementRegex = new RegExp("^(" + simpleModifiableElements + ")$");

    function isSimpleModifiableElement(el) {
        // "A simple modifiable element is an HTML element for which at least one
        // of the following holds:"
        if (el.nodeType != 1 || !isHtmlNode(el)) {
            return false;
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
                !/^[a-z\-]+:[^;]+;?$/i.test(el.style.cssText)) {
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

    function getRangeMove(range, oldParent, oldIndex, newParent, newIndex) {
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

        return (newSc == sc && newSo == so && newEc == ec && newEo == eo) ? null :
                function() {
                    range.setStart(newSc, newSo);
                    range.setEnd(newEc, newEo);
                };
    }

    function movePreservingRanges(node, newParent, newIndex, rangesToPreserve) {
        // "When the user agent is to move a Node to a new location, preserving
        // ranges, it must remove the Node from its original parent, then insert it
        // in the new location. In doing so, however, it must ignore the regular
        // range mutation rules, and instead follow these rules:"

        // "Let node be the moved Node, old parent and old index be the old parent
        // and index, and new parent and new index be the new parent and index."
        var oldParent = node.parentNode;
        var oldIndex = dom.getNodeIndex(node);

        var rangeMoves = [];

        for (var i = 0, len = rangesToPreserve.length, rangeMove; i < len; ++i) {
            rangeMove = getRangeMove(rangesToPreserve[i], oldParent, oldIndex, newParent, newIndex);
            if (rangeMove) {
                rangeMoves.push(rangeMove);
            }
        }

        // Now actually move the node.
        if (newParent.childNodes.length == newIndex) {
            newParent.appendChild(node);
        } else {
            newParent.insertBefore(node, newParent.childNodes[newIndex]);
        }

        // Set the new range boundaries
        for (i = 0, len = rangeMoves.length; i < len; ++i) {
            rangeMoves[i]();
        }
    }

    function clearValue(element, command, rangesToPreserve) {
        var child, nodeIndex, parent = element.parentNode;

        // "If element's specified value for command is null, return the empty
        // list."
        if (command.getSpecifiedValue(element) === null) {
            return [];
        }

        // "If element is a simple modifiable element:"
        if (isSimpleModifiableElement(element)) {
            // "Let children be the children of element."
            var children = nodeListToArray(element.childNodes);
            nodeIndex = dom.getNodeIndex(element);

            // "While element has children, insert its first child into its parent
            // immediately before it, preserving ranges."
            while ( (child = element.firstChild) ) {
                movePreservingRanges(child, parent, nodeIndex++, rangesToPreserve);
            }

            // "Remove element from its parent."
            parent.removeChild(element);

            // "Return children."
            return children;
        }

        // Command-specific special cases
        command.clearValue(element);

        // "If the relevant CSS property for command is not null, unset the CSS
        // property property of element."
        if (command.relevantCssProperty !== null) {
            element.style[command.relevantCssProperty] = "";
            if (element.style.cssText == "") {
                element.removeAttribute("style");
            }
        }

        // "If element's specified value for command is null, return the empty
        // list."
        if (command.getSpecifiedValue(element) === null) {
            return [];
        }

        // "Let new element be a new HTML element with name "span", with the
        // same attributes and ownerDocument as element."
        var newElement = dom.getDocument(element).createElement("span"), attrs = element.attributes;

        for (var i = 0, len = attrs.length; i < len; ++i) {
            if (attrs[i].specified) {
                // For IE, which doesn't allow copying of the entire style object using get/setAttribute
                if (attrs[i].name == "style") {
                    newElement.style.cssText = element.style.cssText;
                } else {
                    newElement.setAttribute(attrs[i].name, attrs[i].value);
                }
            }
        }

        // "Insert new element into the parent of element immediately before it."
        element.parentNode.insertBefore(newElement, element);

        // "While element has children, append its first child as the last child of
        // new element, preserving ranges."
        nodeIndex = 0;

        while ( (child = element.firstChild) ) {
            movePreservingRanges(child, newElement, nodeIndex++, rangesToPreserve);
        }

        // "Remove element from its parent."
        parent.removeChild(element);

        // "Return the one-Node list consisting of new element."
        return [newElement];
    }

    // This entire function is a massive hack to work around browser
    // incompatibility.  It wouldn't work in real life, but it's good enough for a
    // test implementation.  It's not clear how all this should actually be specced
    // in practice, since CSS defines no notion of equality, does it?
    function valuesEqual(command, val1, val2) {
        if (val1 === null || val2 === null) {
            return val1 === val2;
        }

        return command.valuesEqual(val1, val2);
    }

    /**
     * "effective value" per edit command spec
     */
    function getEffectiveValue(node, command) {
        var isElement = (node.nodeType == 1);

        // "If neither node nor its parent is an Element, return null."
        if (!isElement && (!node.parentNode || node.parentNode.nodeType != 1)) {
            return null;
        }

        // "If node is not an Element, return the effective value of its parent for
        // command."
        if (!isElement) {
            return getEffectiveValue(node.parentNode, command);
        }

        return command.getEffectiveValue(node);
    }

    function forceCandidate(node, command, newValue, rangesToPreserve, siblingPropName) {
        var candidate = node[siblingPropName];

        // "While candidate is a modifiable element, and candidate has exactly one
        // child, and that child is also a modifiable element, and candidate is
        // not a simple modifiable element or candidate's specified value for
        // command is not new value, set candidate to its child."
        while (isModifiableElement(candidate)
                && candidate.childNodes.length == 1
                && isModifiableElement(candidate.firstChild)
                && (!isSimpleModifiableElement(candidate)
                    || !valuesEqual(command, getSpecifiedValue(candidate, command), newValue))) {
            candidate = candidate.firstChild;
        }

        // "If candidate is a simple modifiable element whose specified value and
        // effective value for command are both new value, and candidate is
        // not the previousSibling/nextSibling of node:"
        if (isSimpleModifiableElement(candidate)
                && valuesEqual(command, getSpecifiedValue(candidate, command), newValue)
                && valuesEqual(command, getEffectiveValue(candidate, command), newValue)
                && candidate != node[siblingPropName]) {

            // "While candidate has children, insert the first child of
            // candidate into candidate's parent immediately before candidate,
            // preserving ranges."
            var child, nodeIndex = getNodeIndex(candidate);
            while ( (child = candidate.firstChild) ) {
                movePreservingRanges(child, candidate.parentNode, nodeIndex++, rangesToPreserve);
            }

            // "Insert candidate into node's parent before node's
            // previousSibling."
            node.parentNode.insertBefore(candidate, node[siblingPropName]);

            // "Append the nextSibling of candidate as the last child of
            // candidate, preserving ranges."
            movePreservingRanges(candidate.nextSibling, candidate, candidate.childNodes.length, rangesToPreserve);
        }
    }

    function forceValue(node, command, newValue, rangesToPreserve) {
        var child, i, len, children, nodeType = node.nodeType;

        // "If node's parent is null, abort this algorithm."
        if (!node.parentNode) {
            return;
        }

        // "If new value is null, abort this algorithm."
        if (newValue === null) {
            return;
        }

        // "If node is an Element, Text, Comment, or ProcessingInstruction node,
        // and is not an unwrappable node:"
        if (/^(1|3|4|7)$/.test("" + nodeType) && !isUnwrappableNode(node)) {
            // "Let candidate be node's previousSibling."
            forceCandidate(node, command, newValue, rangesToPreserve, "previousSibling");

            // "Let candidate be node's nextSibling."
            forceCandidate(node, command, newValue, rangesToPreserve, "nextSibling");

            // "Let previous sibling and next sibling be node's previousSibling and
            // nextSibling."
            var previousSibling = node.previousSibling;
            var nextSibling = node.nextSibling;

            // "If previous sibling is a simple modifiable element whose specified
            // value and effective value for command are both new value, append
            // node as the last child of previous sibling, preserving ranges."
            if (isSimpleModifiableElement(previousSibling)
                    && valuesEqual(command, command.getSpecifiedValue(previousSibling), newValue)
                    && valuesEqual(command, getEffectiveValue(previousSibling, command), newValue)) {
                movePreservingRanges(node, previousSibling, previousSibling.childNodes.length);
            }

            // "If next sibling is a simple modifiable element whose specified value
            // and effective value for command are both new value:"
            if (isSimpleModifiableElement(nextSibling)
                    && valuesEqual(command, command.getSpecifiedValue(nextSibling), newValue)
                    && valuesEqual(command, getEffectiveValue(nextSibling, command), newValue)) {
                // "If node is not a child of previous sibling, insert node as the
                // first child of next sibling, preserving ranges."
                if (node.parentNode != previousSibling) {
                    movePreservingRanges(node, nextSibling, 0, rangesToPreserve);

                // "Otherwise, while next sibling has children, append the first
                // child of next sibling as the last child of previous sibling,
                // preserving ranges.  Then remove next sibling from its parent."
                } else {
                    var nodeIndex = previousSibling.childNodes.length;
                    while ( (child = nextSibling.firstChild) ) {
                        movePreservingRanges(child, previousSibling, nodeIndex++, rangesToPreserve);
                    }
                    nextSibling.parentNode.removeChild(nextSibling);
                }
            }
        }

        // "If the effective value of command is new value on node, abort this
        // algorithm."
        if (valuesEqual(command, getEffectiveValue(node, command), newValue)) {
            return;
        }

        // "If node is an unwrappable node:"
        if (isUnwrappableNode(node)) {
            // "Let children be all children of node, omitting any that are
            // Elements whose specified value for command is neither null nor
            // equal to new value."
            children = [];
            for (i = 0, len = node.childNodes.length, specifiedValue; i < len; ++i) {
                child = node.childNodes[i];
                if (child.nodeType == 1) {
                    specifiedValue = command.getSpecifiedValue(child);
                    if (specifiedValue !== null && !valuesEqual(command, newValue, specifiedValue)) {
                        continue;
                    }
                }
                children.push(child);
            }

            // "Force the value of each Node in children, with command and new
            // value as in this invocation of the algorithm."
            for (i = 0; child = children[i++]; ) {
                forceValue(child, command, newValue, rangesToPreserve, options);
            }

            // "Abort this algorithm."
            return;
        }

        // "If node is a Comment or ProcessingInstruction, abort this algorithm."
        if (nodeType == 4 || nodeType == 7) {
            return;
        }

        // "If the effective value of command is new value on node, abort this
        // algorithm."
        if (valuesEqual(command, getEffectiveValue(node, command), newValue)) {
            return;
        }

        // "Let new parent be null."
        var newParent = null;

        // "If the CSS styling flag is false:"
        if (!options.styleWithCss && command.createNonCssElement) {
            newParent = command.createNonCssElement(node, newValue);
        }

        // "If new parent is null, let new parent be the result of calling
        // createElement("span") on the ownerDocument of node."
        if (!newParent) {
            newParent = dom.getDocument(node).createElement("span");
        }

        // "Insert new parent in node's parent before node."
        node.parentNode.insertBefore(newParent, node);

        // "If the effective value of command for new parent is not new value, and
        // the relevant CSS property for command is not null, set that CSS property
        // of new parent to new value (if the new value would be valid)."
        var property = command.relevantCssProperty;
        if (property !== null && !valuesEqual(command, getEffectiveValue(newParent, command), newValue)) {
            newParent.style[property] = newValue;
        }

        // Perform additional styling (for commands such as strikethrough and underline)
        if (command.styleCssElement) {
            command.styleCssElement(newParent, newValue);
        }

        // "Append node to new parent as its last child, preserving ranges."
        movePreservingRanges(node, newParent, newParent.childNodes.length, rangesToPreserve);

        // "If node is an Element and the effective value of command for node is
        // not new value:"
        if (nodeType == 1 && !valuesEqual(command, getEffectiveValue(node, command), newValue)) {
            // "Insert node into the parent of new parent before new parent,
            // preserving ranges."
            movePreservingRanges(node, newParent.parentNode, dom.getNodeIndex(newParent), rangesToPreserve);

            // "Remove new parent from its parent."
            newParent.parentNode.removeChild(newParent);

            // "If new parent is a span, and either a) command is "underline" or
            // "strikethrough", or b) command is "fontSize" and new value is not
            // "xxx-large", or c) command is not "fontSize" and the relevant CSS
            // property for command is not null:"
            if (newParent.tagName.toLowerCase() == "span"
                    && ((command.hasSpecialSpanStyling && command.hasSpecialSpanStyling(newValue))
                    || property !== null)) {

                // "If the relevant CSS property for command is not null, set that
                // CSS property of node to new value."
                if (property !== null) {
                    node.style[property] = newValue;
                }

                command.styleSpanChildElement(node, newValue);

            // "Otherwise:"
            } else {
                // "Let children be all children of node, omitting any that are
                // Elements whose specified value for command is neither null nor
                // equal to new value."
                children = [];
                var specifiedValue;
                for (i = 0, len = node.childNodes.length; i < len; ++i) {
                    child = node.childNodes[i];
                    if (child.nodeType == 1) {
                        specifiedValue = command.getSpecifiedValue(child);

                        if (specifiedValue !== null && !valuesEqual(command, newValue, specifiedValue)) {
                            continue;
                        }
                    }
                    children.push(child);
                }

                // "Force the value of each Node in children, with command and new
                // value as in this invocation of the algorithm."
                for (i = 0, len = children.length; i < len; ++i) {
                    forceValue(children[i], command, newValue, rangesToPreserve);
                }
            }
        }
    }

    function pushDownValues(node, command, newValue, rangesToPreserve) {
        // "If node's parent is not an Element, abort this algorithm."
        if (!node.parentNode || node.parentNode.nodeType != 1) {
            return;
        }

        // "If the effective value of command is new value on node, abort this
        // algorithm."
        if (valuesEqual(command, command.getEffectiveValue(node, command), newValue)) {
            return;
        }

        // "Let current ancestor be node's parent."
        var currentAncestor = node.parentNode;

        // "Let ancestor list be a list of Nodes, initially empty."
        var ancestorList = [];

        // "While current ancestor is an editable Element and the effective value
        // of command is not new value on it, append current ancestor to ancestor
        // list, then set current ancestor to its parent."
        while (isEditable(currentAncestor) && currentAncestor.nodeType == 1
                && !valuesEqual(command, getEffectiveValue(currentAncestor, command), newValue)) {
            ancestorList.push(currentAncestor);
            currentAncestor = currentAncestor.parentNode;
        }

        // "If ancestor list is empty, abort this algorithm."
        if (ancestorList.length == 0) {
            return;
        }

        // "Let propagated value be the specified value of command on the last
        // member of ancestor list."
        var lastAncestor = ancestorList[ancestorList.length - 1],
            propagatedValue = command.getSpecifiedValue(lastAncestor);

        // "If propagated value is null and is not equal to new value, abort this
        // algorithm."
        if (propagatedValue === null && propagatedValue != newValue) {
            return;
        }

        // "If the effective value of command is not new value on the parent of
        // the last member of ancestor list, and new value is not null, abort this
        // algorithm."
        if (newValue !== null && !valuesEqual(command, getEffectiveValue(lastAncestor.parentNode, command), newValue)) {
            return;
        }

        // "While ancestor list is not empty:"
        while (ancestorList.length) {
            // "Let current ancestor be the last member of ancestor list."
            // "Remove the last member from ancestor list."
            currentAncestor = ancestorList.pop();

            // "If the specified value of current ancestor for command is not null,
            // set propagated value to that value."
            if (getSpecifiedValue(currentAncestor, command) !== null) {
                propagatedValue = getSpecifiedValue(currentAncestor, command);
            }

            // "Let children be the children of current ancestor."
            var children = nodeListToArray(currentAncestor.childNodes);

            // "If the specified value of current ancestor for command is not null,
            // clear the value of current ancestor."
            if (getSpecifiedValue(currentAncestor, command) !== null) {
                clearValue(currentAncestor, command);
            }

            // "For every child in children:"
            for (var i = 0, child; child = children[i++]; ) {
                // "If child is node, continue with the next child."
                if (child == node) {
                    continue;
                }

                // "If child is an Element whose specified value for command
                // is neither null nor equal to propagated value, continue with the
                // next child."
                if (child.nodeType == 1
                        && getSpecifiedValue(child, command) !== null
                        && !valuesEqual(command, propagatedValue, getSpecifiedValue(child, command))) {
                    continue;
                }

                // "If child is the last member of ancestor list, continue with the
                // next child."
                if (child == lastAncestor) {
                    continue;
                }

                // "Force the value of child, with command as in this algorithm
                // and new value equal to propagated value."
                forceValue(child, command, propagatedValue, rangesToPreserve);
            }
        }
    }

    function setChildrenNodeValue(node, command, newValue, rangesToPreserve) {
        var children = nodeListToArray(node.childNodes);
        for (var i = 0, len = children.length; i < len; ++i) {
            setNodeValue(children[i], command, newValue, rangesToPreserve);
        }
    }

    function setNodeValue(node, command, newValue, rangesToPreserve) {
        var i, len, child, children, nodeType = node.nodeType;

        // "If node is a Document, set the value of its Element child (if it has
        // one) and abort this algorithm."
        if (nodeType == 9) {
            for (i = 0; i < node.childNodes.length; ++i) {
                child = node.childNodes[i];
                if (child.nodeType == 1) {
                    setNodeValue(child, command, newValue, rangesToPreserve);
                    break;
                }
            }
            return;
        }

        // "If node is a DocumentFragment, let children be a list of its children.
        // Set the value of each member of children, then abort this algorithm."
        if (nodeType == 11) {
            setChildrenNodeValue(node, command, newValue, rangesToPreserve);
            return;
        }

        // "If node's parent is null, or if node is a DocumentType, abort this
        // algorithm."
        if (!node.parentNode || nodeType == 10) {
            return;
        }

        // "If node is not editable, let children be the children of node. Set the value of each member of children.
        // Abort this algorithm."
        if (!isEditable(node)) {
            setChildrenNodeValue(node, command, newValue, rangesToPreserve);
            return;
        }

        // "If node is an Element:"
        if (nodeType == 1) {
            // "Clear the value of node, and let new nodes be the result."
            var newNodes = clearValue(node, command, rangesToPreserve);

            // "For each new node in new nodes, set the value of new node, with the
            // same inputs as this invocation of the algorithm."
            for (i = 0, len = newNodes.length; i < len; ++i) {
                setNodeValue(newNodes[i], command, newValue, rangesToPreserve);
            }

            // "If node's parent is null, abort this algorithm."
            if (!node.parentNode) {
                return;
            }
        }

        // "Push down values on node."
        pushDownValues(node, command, newValue, rangesToPreserve);

        // "Force the value of node."
        forceValue(node, command, newValue, rangesToPreserve);

        // "Let children be the children of node. Set the value of each member of children."
        setChildrenNodeValue(node, command, newValue, rangesToPreserve);
    }



    function Command() {}

    Command.prototype = {
        relevantCssProperty: null,

        getSpecifiedValue: function() {
            //throw new module.createError("Command '" + this.name + "' does not implement getSpecifiedValue()");
            return null;
        },

        clearValue: function(element) {

        },

        getEffectiveValue: function(element) {
            return getComputedStyleProperty(element, this.relevantCssProperty);
        },

        createNonCssElement: null,

        styleCssElement: null,

        hasSpecialSpanStyling: null,

        styleSpanChildElement: null,


        applyToRange: function(range, rangesToPreserve) {
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
        getComputedStyleProperty: getComputedStyleProperty,
        getFurthestAncestor: getFurthestAncestor,
        isContained: isContained,
        isEffectivelyContained: isEffectivelyContained,
        isHtmlNode: isHtmlNode,
        isInlineNode: isInlineNode,
        isUnwrappable: isUnwrappable,
        blockExtend: blockExtend,
        isModifiableElement: isModifiableElement,
        isSimpleModifiableElement: isSimpleModifiableElement,
        setOption: function(name, value) {
            options[name] = value;
        }
    };

    Command.create = function(commandConstructor, properties) {
        var proto = new Command();
        commandConstructor.prototype = proto;

        if (typeof properties == "object") {
            for (var i in properties) {
                if (properties.hasOwnProperty(i)) {
                    proto[i] = properties[i];
                }
            }
        }
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