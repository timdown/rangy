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
 * - Do not ignore hidden text nodes or those outside normal document flow
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
 */

rangy.createModule("TextRange", function(api, module) {
    api.requireModules( ["WrappedSelection"] );

    var dom = api.dom, util = api.util;

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

    function isVisibleElement(el) {
        return !!el &&
            el.nodeType == 1 &&
            !/^(script|style)$/.test(el.tagName) &&
            getComputedStyleProperty(el, "visibility") != "hidden" &&
            getComputedStyleProperty(el, "display") != "none";
    }

    function isTextNodePre(textNode) {
        var el = textNode.parentNode;
        return !!el &&
            el.nodeType == 1 &&
            !/^(pre|(-moz-)?pre-wrap)$/.test(getComputedStyleProperty(el, "whiteSpace"))
    }

    var inlineDisplayRegex = /^inline(-block|-table)?$/i;

    function isNonInlineElement(node) {
        return node && node.nodeType == 1 && !inlineDisplayRegex.test(getComputedStyleProperty(node, "display"));
    }

    function getBlockContainerOrSelf(node) {
        var nodeType;
        while (node) {
            nodeType = node.nodeType;
            if (nodeType == 9 || nodeType == 11 || (isNonInlineElement(node) && isVisibleElement(node))) {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    var charsBetweenElements = {
        "td|td": "\t"
    };

    function getCharBetweenElements(el1, el2) {
        var tagName1 = el1.tagName.toLowerCase();
        var key = tagName1 + "|" + el2.tagName.toLowerCase();
        if (charsBetweenElements.hasOwnProperty(key)) {
            return charsBetweenElements[key];
        } else if (tagName1 == "br") {
            return "\n";
        } else if (isNonInlineElement(el1)) {
            return "\n";
        }
        return "";
    }

    function getLastDescendantOrSelf(node) {
        var lastChild = node.lastChild;
        return lastChild ? getLastDescendantOrSelf(lastChild) : node;
    }

    var beforeFirstNode = {}, afterLastNode = {};

    function nextNode(node, excludeChildren) {
        if (node == beforeFirstNode) {
            return document;
        }
        var parent, next;
        if ( (!excludeChildren && (next = node.firstChild)) || (next = node.nextSibling) ) {
            return next;
        }
        return (parent = node.parentNode) ? nextNode(parent, true) : null;
    }

    function previousNode(node) {
        if (node == afterLastNode) {
            return document.lastChild ? getLastDescendantOrSelf(document.lastChild) : document;
        }
        var parent = node.parentNode, sibling = node.previousSibling;
        return sibling ? getLastDescendantOrSelf(sibling) : parent;
    }

    function isVisibleTextNode(node) {
        return node.nodeType == 3 && isVisibleElement(node.parentNode);
    }

    function createNextPreviousVisibleTextNodeGetter(isNext) {
        return function(node) {
            while ( (node = (isNext ? nextNode : previousNode)(node)) ) {
                if (isVisibleTextNode(node)) {
                    return node;
                }
            }
            return null;
        }
    }

    var nextVisibleTextNode = createNextPreviousVisibleTextNodeGetter(true);
    var previousVisibleTextNode = createNextPreviousVisibleTextNodeGetter(false);

    function createFirstLastVisibleTextNodeInBlockGetter(isLast) {
        return function(textNode) {
            var adjacentTextNode = (isLast ? nextVisibleTextNode : previousVisibleTextNode)(textNode);
            return !adjacentTextNode || (getBlockContainerOrSelf(textNode) !== getBlockContainerOrSelf(adjacentTextNode));
        }
    }

    var isFirstVisibleTextNodeInBlock = createFirstLastVisibleTextNodeInBlockGetter(false);
    var isLastVisibleTextNodeInBlock = createFirstLastVisibleTextNodeInBlockGetter(true);

    var breakingSpaceRegex = /^[\u0009-\u000d\u0020\u0085\u1680\u180E\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]$/;

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

    function create

    util.extend(dom, {
        nextNode: nextNode,
        previousNode: previousNode
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
            var iterator = new TextIterator(this.startContainer, this.startOffset);


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

    api.elementText = function(el) {
        var range = api.createRange(el);
        range.selectNodeContents(el);
        var text = range.text();
        range.detach();
        return text;
    }
});
