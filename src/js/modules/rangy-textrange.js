/**
 * @license Text Commands module for Rangy.
 * A generic framework for creating text mutation commands for Ranges and Selections
 *
 * Part of Rangy, a cross-browser JavaScript range and selection library
 * http://code.google.com/p/rangy/
 *
 * Depends on Rangy core.
 *
 * Copyright %%build:year%%, Tim Down
 * Licensed under the MIT license.
 * Version: %%build:version%%
 * Build date: %%build:date%%
 */
/**
 * Scope
 *
 * - Add ability to move range boundaries by character or word offsets
 * - Ignore text nodes inside <script> or <style> elements
 * - Do not ignore text nodes that are outside normal document flow
 * - Add a find method to search for text (optionally case sensitive, default insensitive) within the range
 * - Add ability to add custom word boundary finder (regex?)
 * - Add method to range to return a boundary as a text offset within a node
 * - Add method to selection to get the selection as text offsets within an optional node (body otherwise)
 * - Add method to selection to set the selection as text offsets within an optional node (body otherwise) and direction
 * - Add method to selection to return visible text
 * - Add window.find() equivalent
 * - Add innerText equivalent
 *
 * Potential API
 *
 * Range additions
 *
 * -
 *
 *
 * References
 *
 * https://www.w3.org/Bugs/Public/show_bug.cgi?id=13145
 * http://aryeh.name/spec/innertext/innertext.html
 * http://dvcs.w3.org/hg/editing/raw-file/tip/editing.html
 *
 */

rangy.createModule("TextRange", function(api, module) {
    api.requireModules( ["WrappedSelection"] );

    var UNDEF = "undefined";
    var CHARACTER = "character", WORD = "word";
    var dom = api.dom, util = api.util, DomPosition = dom.DomPosition;

    var log = log4javascript.getLogger("rangy.textrange");

    var elementsHaveUniqueId = util.isHostProperty(document.documentElement, "uniqueID");

    var getComputedStyleProperty;
    if (typeof window.getComputedStyle != UNDEF) {
        getComputedStyleProperty = function(el, propName, win) {
            return (win || dom.getWindow(el)).getComputedStyle(el, null)[propName];
        };
    } else if (typeof document.documentElement.currentStyle != UNDEF) {
        getComputedStyleProperty = function(el, propName) {
            return el.currentStyle[propName];
        };
    } else {
        module.fail("No means of obtaining computed style properties found");
    }

    // "A block node is either an Element whose "display" property does not have
    // resolved value "inline" or "inline-block" or "inline-table" or "none", or a
    // Document, or a DocumentFragment."
    function isBlockNode(node) {
        return node
            && ((node.nodeType == 1 && !/^(inline(-block|-table)?|none)$/.test(getComputedDisplay(node)))
            || node.nodeType == 9 || node.nodeType == 11);
    }

    function getLastDescendantOrSelf(node) {
        var lastChild = node.lastChild;
        return lastChild ? getLastDescendantOrSelf(lastChild) : node;
    }

    function containsPositions(node) {
        return dom.isCharacterDataNode(node)
            || !/^(area|base|basefont|br|col|frame|hr|img|input|isindex|link|meta|param)$/i.test(node.nodeName);
    }

    var spacesRegex = /^[ \t\f\r\n]+$/;
    var spacesMinusLineBreaksRegex = /^[ \t\f\r]+$/;

    function getAncestors(node) {
    	var ancestors = [];
    	while (node.parentNode) {
    		ancestors.unshift(node.parentNode);
    		node = node.parentNode;
    	}
    	return ancestors;
    }

    function getAncestorsAndSelf(node) {
        return getAncestors(node).concat([node]);
    }

    // Opera 11 puts HTML elements in the null namespace, it seems, and IE 7 has undefined namespaceURI
    function isHtmlNode(node) {
        var ns;
        return typeof (ns = node.namespaceURI) == UNDEF || (ns === null || ns == "http://www.w3.org/1999/xhtml");
    }

    function isHtmlElement(node, tagNames) {
        if (!node || node.nodeType != 1 || !isHtmlNode(node)) {
            return false;
        }
        switch (typeof tagNames) {
            case "string":
                return node.tagName.toLowerCase() == tagNames.toLowerCase();
            case "object":
                return new RegExp("^(" + tagNames.join("|S") + ")$", "i").test(node.tagName);
            default:
                return true;
        }
    }

    function nextNodeDescendants(node) {
        while (node && !node.nextSibling) {
            node = node.parentNode;
        }
        if (!node) {
            return null;
        }
        return node.nextSibling;
    }

    function nextNode(node, excludeChildren) {
        if (!excludeChildren && node.hasChildNodes()) {
            return node.firstChild;
        }
        return nextNodeDescendants(node);
    }

    function previousNode(node) {
        var previous = node.previousSibling;
        if (previous) {
            node = previous;
            while (node.hasChildNodes()) {
                node = node.lastChild;
            }
            return node;
        }
        var parent = node.parentNode;
        if (parent && parent.nodeType == 1) {
            return parent;
        }
        return null;
    }

    function isHidden(node) {
        var ancestors = getAncestorsAndSelf(node);
        for (var i = 0, len = ancestors.length; i < len; ++i) {
            if (ancestors[i].nodeType == 1 && getComputedDisplay(ancestors[i]) == "none") {
                return true;
            }
        }

        return false;
    }

    function isVisibilityHiddenTextNode(textNode) {
        var el;
        return textNode.nodeType == 3
            && (el = textNode.parentNode)
            && getComputedStyleProperty(el, "visibility") == "hidden";
    }

    // "A whitespace node is either a Text node whose data is the empty string; or
    // a Text node whose data consists only of one or more tabs (0x0009), line
    // feeds (0x000A), carriage returns (0x000D), and/or spaces (0x0020), and whose
    // parent is an Element whose resolved value for "white-space" is "normal" or
    // "nowrap"; or a Text node whose data consists only of one or more tabs
    // (0x0009), carriage returns (0x000D), and/or spaces (0x0020), and whose
    // parent is an Element whose resolved value for "white-space" is "pre-line"."
    function isWhitespaceNode(node) {
        if (!node || node.nodeType != 3) {
            return false;
        }
        var text = node.data;
        if (text == "") {
            return true;
        }
        var parent = node.parentNode;
        if (!parent || parent.nodeType != 1) {
            return false;
        }
        var computedWhiteSpace = getComputedStyleProperty(node.parentNode, "whiteSpace");

        return (/^[\t\n\r ]+$/.test(text) && /^(normal|nowrap)$/.test(computedWhiteSpace))
            || (/^[\t\r ]+$/.test(text) && computedWhiteSpace == "pre-line");
    }

    // "node is a collapsed whitespace node if the following algorithm returns
    // true:"
    function isCollapsedWhitespaceNode(node) {
    	// "If node's data is the empty string, return true."
    	if (node.data == "") {
    		return true;
    	}

    	// "If node is not a whitespace node, return false."
    	if (!isWhitespaceNode(node)) {
    		return false;
    	}

    	// "Let ancestor be node's parent."
    	var ancestor = node.parentNode;

    	// "If ancestor is null, return true."
    	if (!ancestor) {
    		return true;
    	}

    	// "If the "display" property of some ancestor of node has resolved value "none", return true."
        if (isHidden(node)) {
            return true;
        }

    	// "While ancestor is not a block node and its parent is not null, set
    	// ancestor to its parent."
    	while (!isBlockNode(ancestor) && ancestor.parentNode) {
    		ancestor = ancestor.parentNode;
    	}

    	// "Let reference be node."
    	var reference = node;

    	// "While reference is a descendant of ancestor:"
    	while (reference != ancestor) {
    		// "Let reference be the node before it in tree order."
    		reference = previousNode(reference);

    		// "If reference is a block node or a br, return true."
    		if (isBlockNode(reference) || isHtmlElement(reference, "br")) {
    			return true;
    		}

    		// "If reference is a Text node that is not a whitespace node, or is an
    		// img, break from this loop."
    		if ((reference.nodeType == 3 && !isWhitespaceNode(reference)) || isHtmlElement(reference, "img")) {
    			break;
    		}
    	}

    	// "Let reference be node."
    	reference = node;

    	// "While reference is a descendant of ancestor:"
    	var stop = nextNodeDescendants(ancestor);
    	while (reference != stop) {
    		// "Let reference be the node after it in tree order, or null if there
    		// is no such node."
    		reference = nextNode(reference);

    		// "If reference is a block node or a br, return true."
    		if (isBlockNode(reference) || isHtmlElement(reference, "br")) {
    			return true;
    		}

    		// "If reference is a Text node that is not a whitespace node, or is an
    		// img, break from this loop."
    		if ((reference && reference.nodeType == 3 && !isWhitespaceNode(reference)) || isHtmlElement(reference, "img")) {
    			break;
    		}
    	}

    	// "Return false."
    	return false;
    }

    // Test for old IE's incorrect display properties
    var tableCssDisplayBlock;
    (function() {
        var table = document.createElement("table");
        document.body.appendChild(table);
        tableCssDisplayBlock = (getComputedStyleProperty(table, "display") == "block");
        document.body.removeChild(table);
    })();

    api.features.tableCssDisplayBlock = tableCssDisplayBlock;

    var defaultDisplayValueForTag = {
        table: "table",
        caption: "table-caption",
        colgroup: "table-column-group",
        col: "table-column",
        thead: "table-header-group",
        tbody: "table-row-group",
        tfoot: "table-footer-group",
        tr: "table-row",
        td: "table-cell",
        th: "table-cell"
    };

    // Corrects IE's "block" value for table-related elements
    function getComputedDisplay(el, win) {
        var display = getComputedStyleProperty(el, "display", win);
        var tagName = el.tagName.toLowerCase();
        return (display == "block"
                && tableCssDisplayBlock
                && defaultDisplayValueForTag.hasOwnProperty(tagName))
            ? defaultDisplayValueForTag[tagName] : display;
    }

    function isCollapsedNode(node) {
        var type = node.nodeType;
        //log.debug("isCollapsedNode", isHidden(node), /^(script|style)$/i.test(node.nodeName), isCollapsedWhitespaceNode(node));
        return type == 7 /* PROCESSING_INSTRUCTION */
            || type == 8 /* COMMENT */
            || isHidden(node)
            || /^(script|style)$/i.test(node.nodeName)
            || isVisibilityHiddenTextNode(node)
            || isCollapsedWhitespaceNode(node);
    }

    function isIgnoredNode(node, win) {
        var type = node.nodeType;
        return type == 7 /* PROCESSING_INSTRUCTION */
            || type == 8 /* COMMENT */
            || (type == 1 && getComputedDisplay(node, win) == "none");
    }

    function hasInnerText(node) {
        if (!isCollapsedNode(node)) {
            if (node.nodeType == 3) {
                return true;
            } else {
                for (var child = node.firstChild; child; child = child.nextSibling) {
                    if (hasInnerText(child)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function TextPosition(character, position, isTrailingSpace, collapsible) {
        this.character = character;
        this.position = position;
        this.isTrailingSpace = isTrailingSpace;
        this.collapsible = collapsible;
    }

    TextPosition.prototype.toString = function() {
        return this.character;
    };

    function getTrailingSpace(el) {
        if (el.tagName.toLowerCase() == "br") {
            return "";
        } else {
            switch (getComputedDisplay(el)) {
                case "inline":
                    var child = el.lastChild;
                    while (child) {
                        if (!isIgnoredNode(child)) {
                            return (child.nodeType == 1) ? getTrailingSpace(child) : "";
                        }
                        child = child.previousSibling;
                    }
                    break;
                case "inline-block":
                case "inline-table":
                case "none":
                case "table-column":
                case "table-column-group":
                    break;
                case "table-cell":
                    return "\t";
                default:
                    return hasInnerText(el) ? "\n" : "";
            }
        }
        return "";
    }

    /*----------------------------------------------------------------------------------------------------------------*/

    /*
    Next and previous position moving functions that move between all possible positions in the document
     */
    function nextPosition(pos) {
        var node = pos.node, offset = pos.offset;
        if (!node) {
            return null;
        }
        var nextNode, nextOffset, child;
        if (offset == dom.getNodeLength(node)) {
            // Move onto the next node
            nextNode = node.parentNode;
            nextOffset = nextNode ? dom.getNodeIndex(node) + 1 : 0;
        } else {
            if (dom.isCharacterDataNode(node)) {
                nextNode = node;
                nextOffset = offset + 1;
            } else {
                child = node.childNodes[offset];
                // Go into the children next, if children there are
                if (containsPositions(child)) {
                    nextNode = child;
                    nextOffset = 0;
                } else {
                    nextNode = node;
                    nextOffset = offset + 1;
                }
            }
        }
        return nextNode ? new DomPosition(nextNode, nextOffset) : null;
    }

    function previousPosition(pos) {
        var node = pos.node, offset = pos.offset;
        if (!node) {
            return null;
        }
        var previousNode, previousOffset, child;
        if (offset == 0) {
            previousNode = node.parentNode;
            previousOffset = previousNode ? dom.getNodeIndex(node) : 0;
        } else {
            if (dom.isCharacterDataNode(node)) {
                previousNode = node;
                previousOffset = offset - 1;
            } else {
                child = node.childNodes[offset - 1];
                // Go into the children next, if children there are
                if (containsPositions(child)) {
                    previousNode = child;
                    previousOffset = dom.getNodeLength(child);
                } else {
                    previousNode = node;
                    previousOffset = offset - 1;
                }
            }
        }
        return previousNode ? new DomPosition(previousNode, previousOffset) : null;
    }

    /*
    Next and previous position moving functions that filter

    - Whole whitespace nodes that do not affect rendering
    - Hidden (CSS visibility/display) elements
    - Script and style elements
    - collapsed whitespace characters
     */
    function nextVisiblePosition(pos) {
        var next = nextPosition(pos);
        if (!next) {
            return null;
        }
        var node = next.node;
        var newPos = next;
        if (isCollapsedNode(node)) {
            // We're skipping this node and all its descendants
            newPos = new DomPosition(node.parentNode, dom.getNodeIndex(node) + 1);
        }
        return newPos;
    }

    function previousVisiblePosition(pos) {
        var previous = previousPosition(pos);
        if (!previous) {
            return null;
        }
        var node = previous.node;
        var newPos = previous;
        if (isCollapsedNode(node)) {
            // We're skipping this node and all its descendants
            newPos = new DomPosition(node.parentNode, dom.getNodeIndex(node));
        }
        return newPos;
    }

    function createTransaction(win) {
/*
        var doc = win.document;
        var elementInfoCache = {};

        function getElementInfo(el) {
            var id = elementsHaveUniqueId ? el.uniqueID : el.id || "";
            var elementInfo, display;
            if (id && elementInfoCache.hasOwnProperty(id)) {
                elementInfo = elementInfoCache[id];
            }
            if (!elementInfo) {
                display = getComputedDisplay(el, win);
                elementInfo = {
                    display: display,
                    hidden: false
                };
                if (id) {
                    elementInfoCache[id] = elementInfo;
                }
            }

            return elementInfo;
        }



        return {
            win: win,

            isHidden: function(node) {
                var ancestors = getAncestorsAndSelf(node);
                for (var i = 0, len = ancestors.length; i < len; ++i) {
                    if (ancestors[i].nodeType == 1 && getComputedDisplay(ancestors[i]) == "none") {
                        return true;
                    }
                }

                return false;
            }

        }
*/
        return {};
    }

    function getTextNodeProperties(textNode) {
        log.debug("getTextNodeProperties for " + textNode.data);
        var spaceRegex = null, collapseSpaces = false;
        var cssWhitespace = getComputedStyleProperty(textNode.parentNode, "whiteSpace");
        var preLine = (cssWhitespace == "pre-line");
        if (preLine) {
            spaceRegex = spacesMinusLineBreaksRegex;
            collapseSpaces = true;
        } else if (cssWhitespace == "normal" || cssWhitespace == "nowrap") {
            spaceRegex = spacesRegex;
            collapseSpaces = true;
        }

        return {
            node: textNode,
            text: textNode.data,
            spaceRegex: spaceRegex,
            collapseSpaces: collapseSpaces,
            preLine: preLine
        };
    }

    function getPossibleCharacterAt(pos, transaction) {
        var node = pos.node, offset = pos.offset;
        var visibleChar = "", isTrailingSpace = false, collapsible = false;
        if (offset > 0) {
            if (node.nodeType == 3) {
                var text = node.data;
                var textChar = text.charAt(offset - 1);
                log.debug("Got char '" + textChar + "' in data '" + text + "'");
                var nodeInfo = transaction.nodeInfo;
                if (!nodeInfo || nodeInfo.node !== node) {
                    transaction.nodeInfo = nodeInfo = getTextNodeProperties(node);
                }
                var spaceRegex = nodeInfo.spaceRegex;
                if (nodeInfo.collapseSpaces) {
                    if (spaceRegex.test(textChar)) {
                        collapsible = true;
                        // "If the character at position is from set, append a single space (U+0020) to newdata and advance
                        // position until the character at position is not from set."

                        // We also need to check for the case where we're in a pre-line and we have a space preceding a
                        // line break, because such spaces are collapsed
                        if (offset > 1 && spaceRegex.test(text.charAt(offset - 2))) {
                            log.debug("Character is a collapsible space preceded by another collapsible space, skipping");
                        } else if (nodeInfo.preLine && text.charAt(offset) === "\n") {
                            log.debug("Character is a collapsible space which is followed by a line break in a pre-line element, skipping");
                        } else {
                            log.debug("Character is a collapsible space not preceded by another collapsible space, adding");
                            visibleChar = " ";
                        }
                    } else {
                        log.debug("Character is not a space, adding");
                        visibleChar = textChar;
                    }
                } else {
                    log.debug("Spaces are not collapsible, so adding");
                    visibleChar = textChar;
                }
            } else {
                var nodePassed = node.childNodes[offset - 1];
                if (nodePassed && nodePassed.nodeType == 1 && !isCollapsedNode(nodePassed)) {
                    if (nodePassed.tagName.toLowerCase() == "br") {
                        log.debug("Node is br");
                        visibleChar = "\n";
                    } else {
                        log.debug("Getting trailing space for node " + dom.inspectNode(nodePassed));
                        visibleChar = getTrailingSpace(nodePassed);
                        if (visibleChar) {
                            isTrailingSpace = collapsible = true;
                        }
                    }
                }
            }
        }
        return new TextPosition(visibleChar, pos, isTrailingSpace, collapsible);
    }

    function getPreviousPossibleCharacter(pos, transaction) {
        var previousPos = pos, previous;
        while ( (previousPos = previousVisiblePosition(previousPos)) ) {
            previous = getPossibleCharacterAt(previousPos, transaction);
            if (previous.character !== "") {
                return previous;
            }
        }
        return null;
    }

    function getNextPossibleCharacter(pos, transaction) {
        var nextPos = pos, next;
        while ( (nextPos = nextVisiblePosition(nextPos)) ) {
            next = getPossibleCharacterAt(nextPos, transaction);
            if (next.character !== "") {
                return next;
            }
        }
        return null;
    }

    function getCharacterAt(pos, transaction, precedingChars) {
        var possible = getPossibleCharacterAt(pos, transaction);
        var possibleChar = possible.character;
        var next, preceding;
        log.debug("*** getCharacterAt got possible char '" + possibleChar + "' at position " + pos);
        if (!possibleChar) {
            return possible;
        }
        if (spacesRegex.test(possibleChar)) {
            if (!precedingChars) {
                // Work backwards until we have a non-space character
                var previousPos = pos, previous, previousPossibleChar;
                precedingChars = [];
                while ( (previousPos = previousVisiblePosition(previousPos)) ) {
                    previous = getPossibleCharacterAt(previousPos, transaction);
                    previousPossibleChar = previous.character;
                    if (previousPossibleChar !== "") {
                        log.debug("Found preceding character '" + previousPossibleChar + "' at position " + previousPos);
                        precedingChars.unshift(previous);
                        if (previousPossibleChar != " " && previousPossibleChar != "\n") {
                            break;
                        }
                    }
                }
            }
            preceding = precedingChars[precedingChars.length - 1];

            log.info("possible.collapsible: " + possible.collapsible + ", trailing space: " + possible.isTrailingSpace + ", preceding: '" + preceding + "'");

            // Disallow a collapsible space that follows a trailing space or line break, or is the first character
            if (possibleChar === " " && possible.collapsible && (!preceding || preceding.isTrailingSpace || preceding.character === "\n")) {
                log.info("Preceding character is a trailing space or non-existent and current possible character is a collapsible space, so space is collapsed");
                possible.character = "";
            }

            // Disallow a collapsible space that is followed by a line break or is the last character
            else if (possible.collapsible && (!(next = getNextPossibleCharacter(pos, transaction)) || (next.character == "\n"))) {
                log.debug("Character is a space which is followed by a line break or nothing, collapsing");
                possible.character = "";
            }

            // Collapse a br element that is followed by a trailing space
            else if (possibleChar === "\n" && !possible.collapsible && (!(next = getNextPossibleCharacter(pos, transaction)) || next.isTrailingSpace)) {
                log.debug("Character is a br which is followed by a trailing space or nothing, collapsing");
                possible.character = "";
            }

            return possible;
        } else {
            return possible;
        }
    }

/*
    function getNextCharacter(pos, transaction, endPos) {
        var textPos;
        while ( pos && (!endPos || !pos.equals(endPos)) ) {
            textPos = getCharacterAt(pos, transaction);
            if (textPos.character !== "") {
                log.info("*** GOT CHAR " + textPos.character + "[" + textPos.character.charCodeAt(0) + "]");
                return textPos;
            }
            pos = nextVisiblePosition(pos);
        }
        return null;
    }
*/

    function movePositionBy(pos, unit, count) {
        var charsMoved = 0, newPos = pos;
        if (count !== 0) {
            var transaction = createTransaction(dom.getWindow(pos.node));
            switch (unit) {
                case CHARACTER:
                    var textPos;
                    if (count > 0) {
                        while ( (pos = nextVisiblePosition(pos)) && charsMoved < count) {
                            textPos = getCharacterAt(pos, transaction);
                            if (textPos.character !== "") {
                                log.info("*** movePositionBy forward GOT CHAR " + textPos.character + "[" + textPos.character.charCodeAt(0) + "]");
                                ++charsMoved;
                                newPos = pos;
                            }
                        }
                    } else {
                        while (pos && charsMoved > count) {
                            textPos = getCharacterAt(pos, transaction);
                            if (textPos.character !== "") {
                                log.info("*** movePositionBy backward GOT CHAR " + textPos.character + "[" + textPos.character.charCodeAt(0) + "]");
                                --charsMoved;
                                pos = previousVisiblePosition(pos);
                                newPos = pos;
                            }
                        }
                    }
                    break;
                default:
                    throw new Error("movePositionBy: unit '" + unit + "' not implemented");
            }
        }
        return {
            position: newPos,
            charsMoved: charsMoved
        };
    }

    function getAdjustedRangeEnd(range, transaction) {
        // Adjust the end position to ensure that it is actually reached
        var endPos = getPreviousPossibleCharacter(new DomPosition(range.endContainer, range.endOffset), transaction).position;
        return nextVisiblePosition(endPos);
    }

    function createRangeCharacterIterator(range) {
        log.info("getRangeCharacters called on range " + range.inspect());
        var startPos = new DomPosition(range.startContainer, range.startOffset);
        var transaction = createTransaction(dom.getWindow(range.startContainer));

        // Adjust the end position to ensure that it is actually reached
        var endPos = getPreviousPossibleCharacter(new DomPosition(range.endContainer, range.endOffset), transaction).position;
        endPos = nextVisiblePosition(endPos);

        var pos = startPos, finished = false;

        function next() {
            var textPos = null;
            if (!finished) {
                pos = nextVisiblePosition(pos);
                if (pos) {
                    textPos = getCharacterAt(pos, transaction);
                    if (textPos.character !== "") {
                        log.info("*** next GOT CHAR " + textPos.character + "[" + textPos.character.charCodeAt(0) + "]");
                    }
                    if (pos.equals(endPos)) {
                        finished = true;
                    }
                } else {
                    finished = true;
                }
            }
            return textPos;
        }

        return {
            next: function() {
                var textPos;
                while ( (textPos = next()) ) {
                    if (textPos.character) {
                        return textPos;
                    }
                }
            }
        };
    }

    function getRangeCharacters(range) {
        log.info("getRangeCharacters called on range " + range.inspect());

        var chars = [], it = createRangeCharacterIterator(range), textPos;
        while ( (textPos = it.next()) ) {
            log.info("*** GOT CHAR " + textPos.character + "[" + textPos.character.charCodeAt(0) + "]");
            chars.push(textPos);
        }

        return chars;
    }

    /*----------------------------------------------------------------------------------------------------------------*/

    util.extend(dom, {
        nextNode: nextNode,
        previousNode: previousNode,
        hasInnerText: hasInnerText
    });

    /*----------------------------------------------------------------------------------------------------------------*/

    util.extend(api.rangePrototype, {
        text: function() {
            return getRangeCharacters(this).join("");
        },

        // Unit can be "character" or "word"
        moveStart: function(unit, count) {
            if (arguments.length == 1) {
                unit = CHARACTER;
            }
            var moveResult = movePositionBy(new DomPosition(this.startContainer, this.startOffset), unit, count);
            var newPos = moveResult.position;
            this.setStart(newPos.node, newPos.offset);
            return moveResult.charsMoved;
        },

        moveEnd: function(unit, count) {
            if (arguments.length == 1) {
                unit = CHARACTER;
            }
            var moveResult = movePositionBy(new DomPosition(this.startContainer, this.startOffset), unit, count);
            var newPos = moveResult.position;
            this.setEnd(newPos.node, newPos.offset);
            return moveResult.charsMoved;
        },

        moveToNodePosition: function(node, unit, startCount, endCount) {
            this.selectNodeContents();
            this.moveEnd(unit, endCount);
            this.moveStart(unit, startCount);
        },

        toNodePosition: function(node) {
/*
            var range = this.cloneRange();
            range.setStart(node, 0);
            range.setEnd();
*/


        },

        htmlText: function() {

        },

        expand: function() {

        },

        move: function() {

        },

        // Search term can be string or regex. Returns array of ranges matching the search term
        match: function(searchTerm, caseSensitive) {
            var that = this;
            var rangeChars = getRangeCharacters(this), rangeText = rangeChars.join("");
            var matchRanges = [];

            function createMatchRange(startIndex, endIndex) {
                var matchRange = that.cloneRange();
                var startPos = previousVisiblePosition(rangeChars[startIndex].position);
                var endPos = rangeChars[endIndex - 1].position;

                matchRange.setStart(startPos.node, startPos.offset);
                matchRange.setEnd(endPos.node, endPos.offset);

                return matchRange;
            }

            if (typeof searchTerm == "string") {
                if (!caseSensitive) {
                    rangeText = rangeText.toLowerCase();
                    searchTerm = searchTerm.toLowerCase();
                }
                var index = 0, searchTermLength = searchTerm.length, endIndex;
                while ( (index = rangeText.indexOf(searchTerm, index)) != -1 ) {
                    endIndex = index + searchTermLength;
                    matchRanges.push( createMatchRange(index, endIndex) );
                    index = endIndex;
                }
            } else {
                var result;
                while ( (result = searchTerm.exec(rangeText)) ) {
                    endIndex = result.index + result[0].length;
                    matchRanges.push( createMatchRange(result.index, endIndex) );
                    if (!searchTerm.global) {
                        break;
                    }
                }
            }
            return matchRanges;
        },

        findText: function(searchTerm, caseSensitive) {
            var that = this;
            var it = createRangeCharacterIterator(this);
            var text = "", chars = [], textPos, currentChar, matchStartIndex, matchEndIndex;
            var isRegex = false, result, insideRegexMatch;

            function moveToMatch(startIndex, endIndex) {
                var startPos = previousVisiblePosition(chars[startIndex].position);
                var endPos = chars[endIndex - 1].position;
                that.setStart(startPos.node, startPos.offset);
                that.setEnd(endPos.node, endPos.offset);
            }

            if (typeof searchTerm == "string") {
                if (!caseSensitive) {
                    searchTerm = searchTerm.toLowerCase();
                }
            } else {
                isRegex = true;
            }

            while ( (textPos = it.next()) ) {
                chars.push(textPos);
                currentChar = textPos.character;
                if (!isRegex && !caseSensitive) {
                    currentChar = currentChar.toLowerCase();
                }
                text += currentChar;

                if (isRegex) {
                    result = searchTerm.exec(text);
                    if (result) {
                        if (insideRegexMatch) {
                            // Check whether the match is now over
                            matchStartIndex = result.index;
                            matchEndIndex = matchStartIndex + result[0].length;
                            if (matchEndIndex < text.length) {
                                moveToMatch(matchStartIndex, matchEndIndex);
                                return true;
                            }
                        } else {
                            insideRegexMatch = true;
                        }
                    }
                } else if ( (matchStartIndex = text.indexOf(searchTerm)) != -1) {
                    // A text match has been found, so adjust the range
                    moveToMatch(matchStartIndex, matchStartIndex + searchTerm.length);
                    return true;
                }
            }

            // Check whether regex match extends to the end of the range
            if (insideRegexMatch) {
                moveToMatch(matchStartIndex, matchEndIndex);
                return true;
            }

            return false;
        },

        pasteHTML: function() {

        },

        select: function() {

        }
    });

    util.extend(api.selectionPrototype, {
        toNodePosition: function(node) {

        },

        modify: function() {

        },

        expand: function() {

        },

        moveAnchor: function() {

        },

        moveFocus: function() {

        },

        moveStart: function() {

        },

        moveEnd: function() {

        },

        find: function() {

        }
    });

    // Returns array of Ranges
    api.findAll = function(text, options) {

    };

    api.innerText = function(el) {
        var range = api.createRange(el);
        range.selectNodeContents(el);
        var text = range.text();
        range.detach();
        return text;
    };

    api.textRange = {
        isBlockNode: isBlockNode,
/*
        isCollapsedBr: isCollapsedBr,
*/
        isCollapsedWhitespaceNode: isCollapsedWhitespaceNode,
        nextPosition: nextPosition,
        previousPosition: previousPosition,
        nextVisiblePosition: nextVisiblePosition,
        previousVisiblePosition: previousVisiblePosition
    };

});
