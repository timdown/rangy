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
    var dom = api.dom, util = api.util, DomPosition = dom.DomPosition;

    var log = log4javascript.getLogger("rangy.textrange");

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

    var defaultOptions = {
        normalizeWhiteSpace: false
    };

    // "A block node is either an Element whose "display" property does not have
    // resolved value "inline" or "inline-block" or "inline-table" or "none", or a
    // Document, or a DocumentFragment."
    function isBlockNode(node) {
        return node
            && ((node.nodeType == 1 && !/^(inline(-block|-table)?|none)$/.test(getComputedDisplay(node)))
            || node.nodeType == 9 || node.nodeType == 11);
    }

    function isTextNodePre(textNode) {
        var el = textNode.parentNode;
        return !!el &&
            el.nodeType == 1 &&
            !/^(pre|(-moz-)?pre-wrap)$/.test(getComputedStyleProperty(el, "whiteSpace"))
    }

    var inlineDisplayRegex = /^inline(-block|-table)?$/i;

    function isNonInlineElement(node) {
        return node && node.nodeType == 1 && !inlineDisplayRegex.test(getComputedDisplay(node));
    }

    function getLastDescendantOrSelf(node) {
        var lastChild = node.lastChild;
        return lastChild ? getLastDescendantOrSelf(lastChild) : node;
    }

    function containsPositions(node) {
        return dom.isCharacterDataNode(node)
            || !/^(area|base|basefont|br|col|frame|hr|img|input|isindex|link|meta|param)$/i.test(node.nodeName);
    }

    var breakingSpaceRegex = /^[\u0009-\u000d\u0020\u0085\u1680\u180E\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]$/;

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
        return getAncestors(node) . concat([node]);
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

    function isVisibleTextNode(node) {
        return node
            && node.nodeType == 3
            && !isHidden(node)
            && !isVisibilityHiddenTextNode(node)
            && !isCollapsedWhitespaceNode(node)
            && !/^(script|style)$/i.test(node.parentNode.nodeName);
    }

    function isVisibleElement(el) {

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
    function getComputedDisplay(el) {
        var display = getComputedStyleProperty(el, "display");
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

    function isIgnoredNode(node) {
        var type = node.nodeType;
        return type == 7 /* PROCESSING_INSTRUCTION */
            || type == 8 /* COMMENT */
            || (type == 1 && getComputedDisplay(node) == "none");
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

    function getLeadingSpace(el) {
        var leadingSpaceChar = "";
        switch (getComputedDisplay(el)) {
            case "inline":
                if (el.tagName.toLowerCase() == "br") {
                    //leadingSpaceChar = "\n";
                } else {
                    var child = el.firstChild;
                    while (child) {
                        if (!isIgnoredNode(child)) {
                            return child.nodeType == 1 ? getLeadingSpace(child) : ""
                        }
                        child = child.nextSibling;
                    }
                }
            case "inline-block":
            case "inline-table":
            case "none":
            case "table-cell":
            case "table-column":
            case "table-column-group":
                break;
            default:
                leadingSpaceChar = "\n";
                break;
        }
        return leadingSpaceChar ?
            new TextPosition(leadingSpaceChar, new DomPosition(el.parentNode, dom.getNodeIndex(el))) : "";
    }

    function getTrailingSpace(el) {
        var trailingSpaceChar = "";
        if (el.tagName.toLowerCase() == "br") {
            //trailingSpaceChar = "\n";
        } else {
            switch (getComputedDisplay(el)) {
                case "inline":
                    var child = el.lastChild;
                    while (child) {
                        if (!isIgnoredNode(child)) {
                            trailingSpaceChar = (child.nodeType == 1) ? getTrailingSpace(child) : "";
                            break;
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
                    trailingSpaceChar = "\t";
                    break;
                default:
                    trailingSpaceChar = hasInnerText(el) ? "\n" : "";
                    break;
            }
        }
        return trailingSpaceChar ?
            new TextPosition(trailingSpaceChar, new DomPosition(el.parentNode, dom.getNodeIndex(el) + 1), true, true) : "";
    }

    /*----------------------------------------------------------------------------------------------------------------*/

    function Iterator() {}

    Iterator.prototype = {
        peekNext: function() {
            return (typeof this._next != UNDEF) ? this._next : (this._next = this._getNext(this.current));
        },

        hasNext: function() {
            return !!this.peekNext();
        },

        next: function(item) {
            if (typeof item != UNDEF) {
                this.setCurrent(item);
            }
            this.current = this.peekNext();
            delete this._next;
            return this.current;
        },

        peekPrevious: function() {
            return (typeof this._previous != UNDEF) ? this._previous : (this._previous = this._getPrevious(this.current));
        },

        hasPrevious: function() {
            return !!this.peekPrevious();
        },

        setCurrent: function(item) {
            this.current = item;
            delete this._previous;
            delete this._next;
        },

        previous: function(item) {
            if (typeof item != UNDEF) {
                this.setCurrent(item);
            }
            this.current = this.peekPrevious();
            delete this._previous;
            return this.current;
        }
    };

    function extendIterator(constructor, props) {
        constructor.prototype = new Iterator();
        util.extend(constructor.prototype, props);
    }

    function PositionIterator(node, offset) {
        if (node instanceof DomPosition) {
            offset = node.offset;
            node = node.node;
        }
        this.current = new DomPosition(node, offset);
    }

    extendIterator(PositionIterator, {
        _getNext: function(current) {
            var node = current.node, offset = current.offset;
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
        },

        _getPrevious: function(current) {
            var node = current.node, offset = current.offset;
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
    });

    api.PositionIterator = PositionIterator;

    /*----------------------------------------------------------------------------------------------------------------*/

    /*
    Create filtered iterator that skips

    - Whole whitespace nodes that do not affect rendering
    - Hidden (CSS visibility/display) elements
    - Script and style elements
    - <br> elements that do not affect rendering (No. Too difficult. All non-hidden <br>s are counted).
    - collapsed whitespace characters

    We also need to consider implicit text characters between elements (line breaks between blocks, tabs between table
    cells etc.)

    Final iterator will move between text positions, including those between elements. For example, in
    <td>1</td>    <td>2</td>, text position for the tab character at will be <td>1</td>|    <td>2</td>
     */

    // This iterator iterates over positions within visible nodes
    function VisiblePositionIterator(node, offset) {
        if (node instanceof DomPosition) {
            offset = node.offset;
            node = node.node;
        }
        this._iterator = new PositionIterator(node, offset);
        this.current = new DomPosition(node, offset);
    }

    extendIterator(VisiblePositionIterator, {
        _getNext: function(current) {
            var iterator = this._iterator;
            iterator.setCurrent(current);

            var next = iterator.next();
            if (!next) {
                return null;
            }
            var node = next.node;
            log.debug("node: " + dom.inspectNode(node) + ", isCollapsedNode(node): " + isCollapsedNode(node), iterator.current.inspect())
            if (isCollapsedNode(node)) {
                // We're skipping this node and all its descendants
                var newPos = new DomPosition(node.parentNode, dom.getNodeIndex(node) + 1);
                iterator.setCurrent(newPos);
                log.info("New pos: " + newPos.inspect() + ", old: " + current.inspect())
            }
            return iterator.current;
        },

        _getPrevious: function(current) {
            var iterator = this._iterator;
            iterator.setCurrent(current);
            var previous = iterator.previous();
            if (!previous) {
                return null;
            }
            var node = previous.node;
            if (isCollapsedNode(node)) {
                // We're skipping this node and all its descendants
                var newPos = new DomPosition(node.parentNode, dom.getNodeIndex(node));
                iterator.setCurrent(newPos);
            }
            return iterator.current;
        }
    });

    api.VisiblePositionIterator = VisiblePositionIterator;

    /*----------------------------------------------------------------------------------------------------------------*/

    /*

    Now, the final iterator which iterates over text positions. Each text position is separated by exactly one
    character.

    To get to this, this iterator iterates over visible positions using an underlying VisiblePositionIterator and
    performs the following steps:

    - Ellision of spaces, including between nodes
    - Inclusion of spaces between nodes

    Rules:
    - In <b>1 </b><i> 2</i>, the visible space is inside the earlier (<b>) element.
    - In <div>1 </div>, the final space is ignored.

     */

    function TextPositionIterator(start, end, position) {
        log.info("TextPositionIterator", start.inspect(), end.inspect())
        this._iterator = new VisiblePositionIterator();
/*
        start = start ? this.adjustPosition(start) : null;
        end = end ? this.adjustPosition(end) : null;
        position = position ? this.adjustPosition(position) : start;
*/
        position = position || start;
        this.current = position;
        this.start = start;
        this.end = end;
    }

    extendIterator(TextPositionIterator, {
        _getTextNodeProperties: function(textNode) {
            if (!this.textNodeProperties || this.textNodeProperties.node != textNode) {
                var spaceRegex = null, elideSpaces = false;
                var cssWhitespace = getComputedStyleProperty(textNode.parentNode, "whiteSpace");
                if (cssWhitespace == "pre-line") {
                    spaceRegex = spacesMinusLineBreaksRegex;
                    elideSpaces = true;
                } else if (cssWhitespace == "normal" || cssWhitespace == "nowrap") {
                    spaceRegex = spacesRegex;
                    elideSpaces = true;
                }

                this.textNodeProperties = {
                    node: textNode,
                    text: textNode.data,
                    spaceRegex: spaceRegex,
                    elideSpaces: elideSpaces
                };
            }
            return this.textNodeProperties;
        },

        // TODO: This method is getting in an inifite loop. Fix.
        getCharacterBetween: function(position, nextPosition) {
            var iterator = this._iterator;

            if (!nextPosition || !position) {
                if (!nextPosition) {
                    nextPosition = iterator.next(position);
                } else {
                    position = iterator.previous(position);
                }
            }
            log.info("getCharacterBetween on " + position + ", " + nextPosition);

            var currentNode = position.node,
                nextNode = nextPosition.node,
                nextOffset = nextPosition.offset;

            var props, character, isCharacterCollapsible = false, isTrailingSpace = false, leadingSpace;
            var previousPosition, previousChar;

            if (nextNode.nodeType == 3) {
                // Advance to the next position within the text node, eliding spaces as necessary
                props = this._getTextNodeProperties(nextNode);
                if (props.elideSpaces) {
                    if (nextOffset > 0 && props.spaceRegex.test(props.text.charAt(nextOffset - 1))) {
                        isCharacterCollapsible = true;
                        if (nextOffset > 1 && props.spaceRegex.test(props.text.slice(nextOffset - 2, nextOffset - 1))) {
                            // Character is a collapsible space preceded by another collapsible space, so should be skipped
                            log.debug("Character is a collapsible space preceded by another collapsible space, skipping");
                            return ["", false];
                        }
                    }
                }

                // Handle space
                if (isCharacterCollapsible) {
                    // Check if we're at the end and therefore may need to skip this
                    if (nextOffset == props.text.length || props.spaceRegex.test(props.text.slice(nextOffset))) {
                        // Need to look ahead later to check whether this character is rendered or not
                        log.debug("Character is a collapsible space at the end of a text node. Checking next character.");
                        isTrailingSpace = true;
                        character = "";
                    } else {
                        log.debug("Character is a collapsible space mid-text node NOT preceded by another collapsible space, returning as collapsible space.");
                        return [" ", true];
                    }
                } else {
                    // No space elision in this case
                    log.debug("Character is non-collapsible, returning as non-collapsible.");
                    return [props.text.charAt(nextOffset - 1), false];
                }
            } else if (nextNode.nodeType == 1
                    && nextOffset == 0
                    //&& ( !(previousPosition = iterator.previous(position))
               // Next line is suspicious
                        //|| !(previousChar = this.getCharacterBetween(previousPosition, position))
                        //|| previousChar[0] !== "\n")
                    && (leadingSpace = getLeadingSpace(nextNode)) !== "") {

                log.warn("*** IN DODGY CASE. leadingSpace: '" + leadingSpace + "', previousPosition: " + iterator.previous(position))
                return [leadingSpace, true];

            } else if (!dom.isCharacterDataNode(nextNode)) {
                // The offset is a child node offset. Check the node we've just passed.
                var nodePassed = nextNode.childNodes[nextOffset - 1];
                if (nodePassed) {
                    if (nodePassed.nodeType == 1 && !isCollapsedNode(nodePassed)) {
                        // Special case for <br> elements
                        log.debug("Passed the end of an element");
                        return (nodePassed.tagName.toLowerCase() == "br")
                            ? (log.debug("br, returning line break"), ["\n", true])
                            : (log.debug("Non-br, returning trailing space '" + getTrailingSpace(nodePassed) + "'"), [getTrailingSpace(nodePassed), true]);
                    } else {
                        log.debug("Passed the end of a non-element or collapsed node, returning empty");
                        return ["", false];
                    }
                }

/*
            } else if (nextNode == currentNode)  {
                // The offset is a child node offset. Check the node we've just passed.
                var nodePassed = nextNode.childNodes[nextOffset - 1];
                if (nodePassed) {
                    log.info("nodePassed: " + dom.inspectNode(nodePassed))
                    if (nodePassed.nodeType == 1) {
                        // Special case for <br> elements
                        log.debug("Passed the end of an element");
                        return (nodePassed.tagName.toLowerCase() == "br")
                            ? (log.debug("br, returning line break"), ["\n", true])
                            : (log.debug("Non-br, returning trailing space '" + getTrailingSpace(nodePassed) + "'"), [getTrailingSpace(nodePassed), true]);
                    } else {
                        log.debug("Passed the end of a non-element node, returning empty");
                        return ["", false];
                    }
                } else {
                    throw new Error("No child node at index " + (nextOffset - 1) + " in " + dom.inspectNode(nextNode));
                }
*/
            }

            // Now we have no character as yet. Check if the next character is rendered
            if (nextNode) {
                // No character has definitely been traversed over, so skip forward recursively until we do
                //var tempNext = this.getCharacterBetween(nextPosition, null);
                if (isTrailingSpace) {
                    var tempNext;
                    log.info("GOT TRAILING SPACE, GETTING NEXT CHAR");
                    while ( (nextPosition && (tempNext = this.getCharacterBetween(nextPosition, null)) && !tempNext[0]) ) {
                        nextPosition = iterator.next(nextPosition);
                        log.info("nextPosition: " + nextPosition);
                    }
                    if (tempNext) {
                        log.info("GOT NEXT CHAR POSITION " + nextPosition + ", char '" + tempNext[0] + "'", tempNext[0].length);
                        /*if (tempNext[0] === " ") {
                            log.debug("Next char is collapsible space so returning space");
                            return [" ", false];
                        } else*/ if (tempNext[0] === "\n") {
                            log.debug("Next char is line break so returning empty");
                            return ["", false];
                        } else {
                            log.debug("Next char is not line break so returning space");
                            return [" ", false];
                        }
                    }
                    log.debug("No further character found, so returning empty")
                    return ["", false];
                } else {
                    log.debug("Between nodes. Returning empty.");
                    return ["", false];
                }

/*
                if (isTrailingSpace && tempNext && tempNext[1]) {
                    // The next character is collapsible space, so the trailing space is rendered
                    log.debug("Next char is collapsible space so returning collapsible space");
                    return [" ", true];
                } else {
                    log.debug("Next char is not collapsible space so returning empty")
                    return ["", false];
                }
*/
            }

            return null;
        },

        adjustPosition: function(position, forward) {
            log.info("adjustPosition on " + position.inspect());

            var iterator = this._iterator, nextPosition;
            iterator.setCurrent(position);

            while (true) {
                nextPosition = forward ? iterator.next(position) : iterator.previous(position);
                if (!nextPosition
                        || this.getCharacterBetween(forward ? position : nextPosition, forward ? nextPosition : position)[0]) {
                    log.debug("adjustPosition returning " + position);
                    return position;
                }
                position = nextPosition;
            }
        },

        _getNext: function(position) {
            log.info("_getNext on " + position.inspect() + "");

            var iterator = this._iterator, currentPosition = position, nextPosition, character;

            while (true) {
                nextPosition = iterator.next(currentPosition);
                if (!nextPosition || currentPosition.equals(this.end)) {
                    return null;
                }
                character = this.getCharacterBetween(currentPosition, nextPosition);
                if (character[0]) {
                    nextPosition.character = character[0];
                    nextPosition.collapsible = character[1];
                    return nextPosition;
                }
                currentPosition = nextPosition;
            }
        },

        _getPrevious: function(position) {
            log.info("_getPrevious on " + position.inspect());

            var iterator = this._iterator, currentPosition = position, nextPosition, character;

            while (true) {
                nextPosition = iterator.previous(currentPosition);
                if (!nextPosition || nextPosition.equals(this.start)) {
                    return null;
                }
                character = this.getCharacterBetween(currentPosition, nextPosition);
                if (character[0]) {
                    nextPosition.character = character[0];
                    nextPosition.collapsible = character[1];
                    return nextPosition;
                }
                currentPosition = nextPosition;
            }
        }
    });

    api.TextPositionIterator = TextPositionIterator;

    /*----------------------------------------------------------------------------------------------------------------*/

    function appendTextNodeText(textNode, spaceRegex, collapseSpaces, chars, trailingSpace) {
        var text = textNode.data, textNodeChars = [], position, lastCharWasSpace = false, charCount;
        log.debug("addTextNodeText '" + text + "', existing chars: " + chars.join(""));

        for (var i = 0, len = text.length, textChar; i < len; ++i) {
            textChar = text.charAt(i);
            log.debug("At index " + i + " in text node " + text + ", char is " + textChar);
            position = new DomPosition(textNode, i);

            if (collapseSpaces) {
                if (spaceRegex.test(textChar)) {
                    // "If the character at position is from set, append a single space (U+0020) to newdata and advance
                    // position until the character at position is not from set."
                    if (lastCharWasSpace) {
                        log.debug("Character is a collapsible space preceded by another collapsible space, skipping");
                    } else {
                        log.debug("Character is a collapsible space not preceded by another collapsible space, adding");
                        textNodeChars.push( new TextPosition(" ", position) );
                        lastCharWasSpace = true;
                    }
                } else {
                    if (textChar == "\n") {
                        // "Otherwise, if the character at position is a line feed (U+000A), delete the last character
                        // of newdata if it's a space (U+0020), then append a line feed (U+000A) to newdata, then advance
                        // position until the character at position is not from set."
                        log.debug("Character is a line break in pre-line element");
                        if (lastCharWasSpace) {
                            textNodeChars.pop();
                        }
                        textNodeChars.push( new TextPosition("\n", position) );
                    } else {
                        log.debug("Character is not a space, adding");
                        textNodeChars.push( new TextPosition(textChar, position) );
                    }
                    lastCharWasSpace = false;
                }
            } else {
                log.debug("No collapsible spaces, so adding");
                textNodeChars.push( new TextPosition(textChar, position) );
            }
        }

        // "If trailing space is true and data does not begin with a space character, append a space to the end of s."
        // This is adapted somewhat: trailingSpace is either null or the trailing space from the preceding node
        if (trailingSpace && textNodeChars[0].character != " ") {
            log.debug("Appending trailing space from previous node");
            chars.push(trailingSpace);
        }

        // "If s is empty or ends with a space character, and data begins with a space (U+0020), and whitespace is
        // "normal", "no-wrap", or "pre-line", delete the space from the beginning of data."
        if (collapseSpaces
                && (textNodeChars.length > 0)
                && (textNodeChars[0].character == " ")
                && (chars.length == 0 || chars[chars.length - 1].character == " ")) {
            log.debug("Plain text '" + chars.join("") + "' is empty or ends with space, data '" + textNodeChars.join("")
                + "' begins with space, spaces are elided, deleting leading space");
            textNodeChars.shift();
        }

        // "If whitespace is "normal", "no-wrap", or "pre-line", and the last character of data is a space (U+0020),
        // delete the last character of data and set trailing space to true. Otherwise, set trailing space to false."
        var newTrailingSpace = (collapseSpaces && (charCount = textNodeChars.length) > 0 && textNodeChars[charCount - 1].character == " ") ?
            textNodeChars.pop() : null;

        // "If the computed value of node's "text-transform" property is not "normal", apply the appropriate
        // transformation to data."
        // TODO: Consider whether to implement this

        // "Append data to s."
        chars.push.apply(chars, textNodeChars);

        return newTrailingSpace;
    }

    function hasSubsequentNonIgnoredSibling(node) {
        var sibling = node;
        while (sibling = sibling.nextSibling) {
            if (!isCollapsedNode(node)) {
                return true;
            }
        }
        return false;
    }

    function appendPlainText(el, trailingSpace, chars) {
        var spaceRegex, elideSpaces, nodeType, leadingSpace, plainText, childTrailingSpace;
        if (isCollapsedNode(el)) {
            return;
        }
        chars = chars || [];
        var cssWhitespace = getComputedStyleProperty(el, "whiteSpace");
        if (cssWhitespace == "pre-line") {
            spaceRegex = spacesMinusLineBreaksRegex;
            elideSpaces = true;
        } else if (cssWhitespace == "normal" || cssWhitespace == "nowrap") {
            spaceRegex = spacesRegex;
            elideSpaces = true;
        }

        for (var childIndex = 0, len = el.childNodes.length, child; childIndex < len; ++childIndex) {
            child = el.childNodes[childIndex];
            if (!isCollapsedNode(child)) {
                nodeType = child.nodeType;
                if (nodeType == 3) {
                    trailingSpace = appendTextNodeText(child, spaceRegex, elideSpaces, chars, trailingSpace);
                    log.debug("Added text node " + dom.inspectNode(child) + ", chars is now " + chars.join("") + " (length: " + chars.length + ")");
                } else if (nodeType == 1) {
/*
                    if (child.tagName.toLowerCase() == "br") {
                        //trailingSpace = new TextPosition("\n", new DomPosition(el, childIndex));
                        // "If trailing space is true and data does not begin with a space character, append a space to the end of s."
                        // This is adapted somewhat: trailingSpace is either null or the trailing space from the preceding node
                        if (trailingSpace) {
                            log.debug("Appending trailing space from previous node before br");
                            chars.push(trailingSpace);
                            trailingSpace = null;
                        }
                        // Delete the last character of s if it's a space (U+0020), then append a line feed (U+000A) to
                        // s
                        log.debug("br element, adding line break. preceding char: '" + (chars[chars.length - 1] || {}).character + "'");
                        if (chars.length > 0 && chars[chars.length - 1].character == " ") {
                            log.debug("deleting space character preceding br");
                            chars.pop();
                        }
                        chars.push(new TextPosition("\n", new DomPosition(el, childIndex)));
                        log.debug("Adding line break for br now " + chars.map(function(ch) { return "[" + ch.character.charCodeAt(0) + "]";}).join(""));
                    } else {
*/
                        // "If the last character of s is not a newline (U+000A), and the leading whitespace for child is
                        // not the empty string, append the leading whitespace for child to s and set trailing space to
                        // false."
                        // Amendment: if s is empty, do not add the leading white space
                        if (chars.length > 0
                                && chars[chars.length - 1].character != "\n"
                                && (leadingSpace = getLeadingSpace(child)) != "") {
                            chars.push(leadingSpace);
                            log.debug("Appending leading whitespace for " + dom.inspectNode(child));
                            trailingSpace = null;
                        }

                        // "Append the plaintext of child to s with flag trailing space, and assign the result to
                        // (s, trailing space)."
                        plainText = appendPlainText(child, trailingSpace, chars);
                        trailingSpace = plainText[1];

                        // "If node has another child after child that is not an ignored node, and the trailing whitespace
                        // of child is not the empty string, append the trailing whitespace of child to s and set trailing
                        // space to false."
                        if (hasSubsequentNonIgnoredSibling(child) && (childTrailingSpace = getTrailingSpace(child)) != ""/* && child.tagName.toLowerCase() != "br"*/) {
                            chars.push(childTrailingSpace);
                            log.debug("Appending trailing whitespace '" + childTrailingSpace + "' for " + dom.inspectNode(child));
                            trailingSpace = false;
                        }
                    //}
                }
            }

            child = child.nextSibling;
        }

        return [chars, trailingSpace];
    }

    function getTextNodeProperties(textNode) {
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

    /*
    Current plan: getCharacterAt returns character that could possibly be at a position.
    When iterating forward with preceding string, ???
     */
    function getPossibleCharacterAt(pos, nodeInfo) {
        var node = pos.node, offset = pos.offset;
        var visibleChar = "", isTrailingSpace = false, collapsible = false;
        if (offset > 0) {
            if (node.nodeType == 3) {
                var text = node.data;
                var textChar = text.charAt(offset - 1);
                log.debug("Got char '" + textChar + "' in data '" + text + "'");
                if (!nodeInfo) {
                    nodeInfo = getTextNodeProperties(node);
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
                        visibleChar = "\n";
                    } else {
                        visibleChar = getTrailingSpace(nodePassed).character || "";
                    }
                }
            }
        }
        return new TextPosition(visibleChar, pos, isTrailingSpace, collapsible);
    }

    function getPreviousPossibleCharacter(pos, nodeInfo) {
        var iterator = new VisiblePositionIterator(pos.node, pos.offset);
        var previousPos, previous;
        while ( (previousPos = iterator.previous()) ) {
            previous = getPossibleCharacterAt(previousPos);
            if (previous.character !== "") {
                return previous;
            }
        }
        return null;
    }

    function getNextPossibleCharacter(pos, nodeInfo) {
        var iterator = new VisiblePositionIterator(pos.node, pos.offset);
        var nextPos, next;
        while ( (nextPos = iterator.next()) ) {
            next = getPossibleCharacterAt(nextPos);
            if (next.character !== "") {
                return next;
            }
        }
        return null;
    }

    function getCharacterAt(pos, nodeInfo, precedingChars) {
        var possible = getPossibleCharacterAt(pos, nodeInfo);
        var possibleChar = possible.character;
        var next, preceding;
        log.debug("*** getCharacterAt got possible char '" + possibleChar + "' at position " + pos);
        if (!possibleChar) {
            return possible;
        }
        if (spacesRegex.test(possibleChar)) {
            if (!precedingChars) {
                // Work backwards until we have a non-space character
                var iterator = new VisiblePositionIterator(pos.node, pos.offset);
                var previousPos, previous, previousPossibleChar;
                precedingChars = [];
                while ( (previousPos = iterator.previous()) ) {
                    previous = getPossibleCharacterAt(previousPos);
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
            // TODO: Implement tedious checks
            preceding = precedingChars[precedingChars.length - 1];

            log.info("possible.collapsible: " + possible.collapsible + ", preceding: '" + preceding + "', next: '" + getNextPossibleCharacter(pos) + "'");

            // Disallow a collapsible space that follows a trailing space or line break, or is the first character
            if (possibleChar === " " && possible.collapsible && (!preceding || preceding.isTrailingSpace || preceding.character === "\n")) {
                log.info("Preceding character is a trailing space or non-existent and current possible character is a collapsible space, so space is collapsed");
                possible.character = "";
            }

            // Disallow a collapsible space that is followed by a line break or is the last character
            else if ( !(next = getNextPossibleCharacter(pos)) || (next.character == "\n"/* && possible.collapsible*/)) {
                log.debug("Character is a space which is followed by a line break or nothing, collapsing");
                possible.character = "";
            }

            return possible;
        } else {
            return possible;
        }
    }

    /*----------------------------------------------------------------------------------------------------------------*/

    util.extend(dom, {
        nextNode: nextNode,
        previousNode: previousNode,
        hasInnerText: hasInnerText
    });

    /*----------------------------------------------------------------------------------------------------------------*/

    util.extend(api.selectionPrototype, {
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

    util.extend(api.rangePrototype, {
        text: function() {
            log.info("text called on range " + this.inspect());
            var startPos = new DomPosition(this.startContainer, this.startOffset);
            var iterator = new VisiblePositionIterator();

            // Adjust the end position to ensure that it is actually reached
            var endPos = getPreviousPossibleCharacter(new DomPosition(this.endContainer, this.endOffset)).position;
            endPos = new VisiblePositionIterator(endPos.node, endPos.offset).next();

            iterator.setCurrent(startPos);

            var chars = [], pos = startPos, textPos;
            while ( pos && !pos.equals(endPos) ) {
                textPos = getCharacterAt(pos);
                if (textPos.character !== "") {
                    log.info("*** GOT CHAR " + textPos.character + "[" + textPos.character.charCodeAt(0) + "]");
                    chars.push(textPos.character)
                }
                pos = iterator.next();
            }

            return chars.join("");
/*
            log.info("text called on range " + this.inspect());
            var iterator = new TextPositionIterator(new DomPosition(this.startContainer, this.startOffset),
                new DomPosition(this.endContainer, this.endOffset));
            var chars = [], pos;
            while ( (pos = iterator.next()) ) {
                log.info("*** GOT CHAR " + pos.character + "[" + pos.character.charCodeAt(0) + "], collapsible " + pos.collapsible);
                if (chars.length > 0 || !pos.collapsible) {
                    log.info("*** INCLUDED CHAR");
                    chars.push(pos.character);
                } else {
                    log.info("*** IGNORED COLLAPSIBLE LEADING SPACE CHAR");
                }
            }
            return chars.join("");
*/
        },

        htmlText: function() {

        },

        expand: function() {

        },

        moveStart: function() {

        },

        moveEnd: function() {

        },

        findText: function() {

        },

        move: function() {

        },

        pasteHTML: function() {

        },

        select: function() {

        }
    });

    // Returns array of Ranges
    api.findAll = function() {

    };

    api.innerText = function(el) {
        var range = api.createRange(el);
        range.selectNodeContents(el);
        var text = range.text();
        range.detach();
        return text;

/*
        var innerText = appendPlainText(el)[0];
        log.debug("chars: " + innerText.map(function(ch) { return "[" + ch.character.charCodeAt(0) + "]";}).join(""));
        return innerText.join("");
*/
    };

    api.textRange = {
        isBlockNode: isBlockNode,
/*
        isCollapsedBr: isCollapsedBr,
*/
        isCollapsedWhitespaceNode: isCollapsedWhitespaceNode,
        PositionIterator: PositionIterator,
        VisiblePositionIterator: VisiblePositionIterator

    };

});
