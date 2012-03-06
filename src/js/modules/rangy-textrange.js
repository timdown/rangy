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

    var dom = api.dom, util = api.util, DomPosition = dom.DomPosition;

    var log = log4javascript.getLogger("rangy.textrange");

    var getComputedStyleProperty;

    if (typeof window.getComputedStyle != "undefined") {
        getComputedStyleProperty = function(el, propName) {
            return dom.getWindow(el).getComputedStyle(el, null)[propName];
        };
    } else if (typeof document.documentElement.currentStyle != "undefined") {
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

    var spacesRegex = /^[ \t\f\r\n]$/;
    var spacesMinusLineBreaksRegex = /^[ \t\f\r]$/;

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
        return typeof (ns = node.namespaceURI) == "undefined" || (ns === null || ns == "http://www.w3.org/1999/xhtml");
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

    // Corrects IE's "block" value for table-related elements
    function getComputedDisplay(el) {
        var display = getComputedStyleProperty(el, "display");
        if (display == "block" && tableCssDisplayBlock) {
            switch (el.tagName.toLowerCase()) {
                case "table":
                    return "table";
                case "caption":
                    return "table-caption";
                case "colgroup":
                    return "table-column-group";
                case "col":
                    return "table-column";
                case "thead":
                    return "table-header-group";
                case "tbody":
                    return "table-row-group";
                case "tfoot":
                    return "table-footer-group";
                case "tr":
                    return "table-header-group";
                case "td":
                case "th":
                    return "table-cell";
            }
        }
        return display;
    }

    function isCollapsedNode(node) {
        var type = node.nodeType;
        log.debug("isCollapsedNode", isHidden(node), /^(script|style)$/i.test(node.nodeName), isCollapsedWhitespaceNode(node));
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

    function getLeadingSpace(el) {
        switch (getComputedDisplay(el)) {
            case "inline":
                var child = el.firstChild;
                while (child) {
                    if (!isIgnoredNode(child)) {
                        return child.nodeType == 1 ? getLeadingSpace(child) : ""
                    }
                    child = child.nextSibling;
                }
                return "";
            case "inline-block":
            case "inline-table":
            case "none":
            case "table-cell":
            case "table-column":
            case "table-column-group":
                return "";
            default:
                return "\n";
        }
    }

    function getTrailingSpace(el) {
        switch (getComputedDisplay(el)) {
            case "inline":
                var child = el.lastChild;
                while (child) {
                    if (!isIgnoredNode(child)) {
                        return child.nodeType == 1 ? getTrailingSpace(child) : ""
                    }
                    child = child.previousSibling;
                }
                return "";
            case "inline-block":
            case "inline-table":
            case "none":
            case "table-column":
            case "table-column-group":
                return "";
            case "table-cell":
                return "\t";
            default:
                return hasInnerText(el) ? "\n" : "";
        }
    }

    /*----------------------------------------------------------------------------------------------------------------*/

    function Iterator() {}

    Iterator.prototype = {
        peekNext: function() {
            return (typeof this._next != "undefined") ? this._next : (this._next = this._getNext());
        },

        hasNext: function() {
            return !!this.peekNext();
        },

        next: function() {
            this.current = this.peekNext();
            delete this._next;
            return this.current;
        },

        peekPrevious: function() {
            return (typeof this._previous != "undefined") ? this._previous : (this._previous = this._getPrevious());
        },

        hasPrevious: function() {
            return !!this.peekPrevious();
        },

        setCurrent: function(item) {
            this.current = item;
            delete this._previous;
            delete this._next;
        },

        previous: function() {
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
        _getNext: function() {
            var current = this.current, node = current.node, offset = current.offset;
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

        _getPrevious: function() {
            var current = this.current, node = current.node, offset = current.offset;
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
        _getNext: function() {
            var iterator = this._iterator;
            iterator.setCurrent(this.current);
            var node = iterator.next().node;
            log.debug("node: " + dom.inspectNode(node) + ", isCollapsedNode(node): " + isCollapsedNode(node), iterator.current.inspect())
            if (isCollapsedNode(node)) {
                // We're skipping this node and all its descendants
                var newPos = new DomPosition(node.parentNode, dom.getNodeIndex(node) + 1);
                iterator.setCurrent(newPos);
                log.info("New pos: " + newPos.inspect() + ", old: " + this.current.inspect())
            }
            return iterator.current;
        },

        _getPrevious: function() {
            var iterator = this._iterator;
            iterator.setCurrent(this.current);
            var node = iterator.previous().node;
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

    function TextPositionIterator(node, offset) {
        if (node instanceof DomPosition) {
            offset = node.offset;
            node = node.node;
        }
        this._iterator = new VisiblePositionIterator(node, offset);
        this.current = {
            position: new DomPosition(node, offset),
            previousChar: "",
            previousCharCollapsible: false,
            trailingSpace: false
        };
    }

    extendIterator(TextPositionIterator, {
        _getTextNodeProperties: function(textNode) {
            if (!this.textNodeProperties || this.textNodeProperties.node != textNode) {
                var spaceRegex = null, elideSpaces = false;
                var cssWhitespace = getComputedStyleProperty(node.parentNode, "whiteSpace");
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

        _nextPosition: function() {
/*            var iterator = this._iterator;
            iterator.setCurrent(this.current);
            var next = iterator.next(), currentNode = this.current.node, nextNode = next.node, nextOffset = next.offset;
            var props, character, isCharacterCollapsible, trailingSpace = false;

            if (nextNode == currentNode) {
                if (nextNode.nodeType == 3) {
                    // Advance to the next position within the text node, eliding spaces as necessary
                    props = this._getTextNodeProperties(nextNode);
                    if (props.elideSpaces) {
                        while ( props.spaceRegex.test(props.text.charAt(nextOffset)) ) {
                            ++nextOffset;
                        }
                        // Check if we're at the end and therefore may need to skip this
                        if (nextOffset == props.text.length) {
                            trailingSpace = true;
                            character = "";
                        } else {
                            character = " ";
                        }
                        isCharacterCollapsible = true;
                    } else {
                        character = props.text.charAt(nextOffset);
                        isCharacterCollapsible = false;
                        ++nextOffset;
                    }
                } else {
                    // The offset is a child node offset. Check the node we've just passed.
                    var previousNode = nextNode.childNodes[nextOffset - 1];
                    if (previousNode) {
                        if (previousNode.nodeType == 1) {
                            // Special case for <br> elements
                            if (previousNode.tagName.toLowerCase() == "br") {
                                character = "\n";
                                isCharacterCollapsible = false;
                            } else {
                                character = getTrailingSpace(previousNode);
                            }
                        }

                    } else {
                        throw new Error("No child node at index " + (nextOffset - 1) + " in " + dom.inspectNode(nextNode));
                    }
                }
            } else {

            }*/
        },

        _getNext: function() {
            var iterator = this._iterator;
            iterator.setCurrent(this.current);
            var next = iterator.next(), currentNode = this.current.node, nextNode = next.node, nextOffset = next.offset;
            var props, character, isCharacterCollapsible, trailingSpace = false;

            if (nextNode == currentNode) {
                if (nextNode.nodeType == 3) {
                    // Advance to the next position within the text node, eliding spaces as necessary
                    props = this._getTextNodeProperties(nextNode);
                    if (props.elideSpaces) {
                        while ( props.spaceRegex.test(props.text.charAt(nextOffset)) ) {
                            ++nextOffset;
                        }
                        // Check if we're at the end and therefore may need to skip this
                        if (nextOffset == props.text.length) {
                            // Look ahead...

                            trailingSpace = true;
                            character = "";
                        } else {
                            character = " ";
                        }
                        isCharacterCollapsible = true;
                    } else {
                        character = props.text.charAt(nextOffset);
                        isCharacterCollapsible = false;
                        ++nextOffset;
                    }
                } else {
                    // The offset is a child node offset. Check the node we've just passed.
                    var previousNode = nextNode.childNodes[nextOffset - 1];
                    if (previousNode) {
                        if (previousNode.nodeType == 1) {
                            // Special case for <br> elements
                            if (previousNode.tagName.toLowerCase() == "br") {
                                character = "\n";
                                isCharacterCollapsible = false;
                            } else {
                                character = getTrailingSpace(previousNode);
                            }
                        }

                    } else {
                        throw new Error("No child node at index " + (nextOffset - 1) + " in " + dom.inspectNode(nextNode));
                    }
                }
            } else {

            }
/*
            var next = this._nextPosition();
            while (next && !next.previousChar) {
                next = this._nextPosition();
            }
            return next;
*/
        },

        _getPrevious: function() {
        }
    });

    api.TextPositionIterator = TextPositionIterator;

    /*----------------------------------------------------------------------------------------------------------------*/


    function VisibleTextPosition(node, offset) {
        // Convert the node and offset into a node and offset within a visible text node
        var nextStartNode, previousStartNode;
        if (dom.isCharacterDataNode(node)) {
            if (!isVisibleTextNode(node)) {
                nextStartNode = previousStartNode = node;
            }
        } else {
            var children = node.childNodes;
            if (offset < children.length) {
                nextStartNode = children[offset];
                previousStartNode = offset > 0 ? nextStartNode : children[0];
            } else if (offset > 0) {
                nextStartNode = children[offset - 1];
                previousStartNode = nextNode(nextStartNode); // What if this is null?
            } else {
                // This case is offset zero in a node with no children
                nextStartNode = previousStartNode = node;
            }
        }

        //if (next)

/*
        if (dom.isCharacterDataNode(node)) {
            if (!isVisibleTextNode(node)) {
                node = nextVisibleTextNode(node);
                if (node) {
                    offset = 0;
                } else {
                    node = previousVisibleTextNode(node);
                    if (node) {
                        offset = node.data.length
                    }
                }
            }
        } else {
            var children = node.childNodes;
            var childNode = (offset < children.length) ? children[offset] : nextNode(node, false);
            node = nextVisibleTextNode(childNode);
            offset = 0;
        }
*/

        this.node = node;
        this.offset = offset;
    }

    VisibleTextPosition.prototype = {

    };

    /*
    Rules for white-space normal:
    - Consecutive breaking spaces render as single space. Only the first space is counted.
    - Breaking spaces at the start of a block level element are not rendered at all
    - Moving from a visible block to a new element adds a line break
    - A visible <br> is collapsible if it is the last visible element in a block and is followed by no rendered text
     */

    function TextIterator(node, offset, endNode, endOffset, options) {
        // Convert the node and offset into a node and offset within a visible text node
        if (dom.isCharacterDataNode(node)) {
            if (!isVisibleTextNode(node)) {
                node = nextVisibleTextNode(node);
                offset = 0;
            }
        } else {
            var children = node.childNodes;
            node = nextVisibleTextNode( (offset < children.length) ? children[offset] : nextNode(node, false) );
            offset = 0;
        }

        this.endNode = endNode;
        this.endOffset = endOffset;

        // Convert the node and offset into a valid text position
        // TODO: Implement

        this.current = {
            node: node,
            offset: offset,
            pre: isTextNodePre(node),
            isFirstInBlock: isFirstVisibleTextNodeInBlock(node),
            isLastInBlock: isLastVisibleTextNodeInBlock(node)
        };
    }

    var nullTextPosition = {};

    TextIterator.prototype = {
        current: null,
        _previous: null,
        _next: null,

        next: function() {
            var next = this._next || this.peekNext();
            this.current = next;
            this._next = null;
            return next;
        },

        previous: function() {
            var previous = this._previous || this.peekPrevious();
            this.current = previous;
            this._previous = null;
            return previous;
        },

        peekPrevious: function() {

        },

        peekNext: function() {
            var current = this.current, offset = current.offset, node = current.node, text = node.data;
            var isFirstInBlock = current.isFirstInBlock;

            while ( breakingSpaceRegex.test(text.charAt(offset)) ) {
                offset++;
                if (offset == text.length) {
                    // Move onto the next text node
                    node = nextVisibleTextNode(node);
                    if (node) {
                        offset = 0;
                        isFirstInBlock = isFirstVisibleTextNodeInBlock(node);
                    } else {
                        return (this._next = nullTextPosition);
                    }
                }
            }
        }
    };

    util.extend(dom, {
        nextNode: nextNode,
        previousNode: previousNode,
        hasInnerText: hasInnerText,
        innerText: function(node) {

        }
    });

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

        }
    });

    util.extend(api.rangePrototype, {
        text: function() {
            //var iterator = new TextIterator(this.startContainer, this.startOffset);


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

    api.find = function() {

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
        PositionIterator: PositionIterator,
        VisiblePositionIterator: VisiblePositionIterator

    };

});
