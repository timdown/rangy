rangy.createModule("TextRange", function(api, module) {
    api.requireModules( ["WrappedSelection"] );

    var UNDEF = "undefined";
    var CHARACTER = "character", WORD = "word";
    var dom = api.dom, util = api.util, DomPosition = dom.DomPosition;
    var extend = util.extend;

    var log = log4javascript.getLogger("rangy.textrange");

    var spacesRegex = /^[ \t\f\r\n]+$/;
    var spacesMinusLineBreaksRegex = /^[ \t\f\r]+$/;
    var allWhiteSpaceRegex = /^[\t-\r \u0085\u00A0\u1680\u180E\u2000-\u200B\u2028\u2029\u202F\u205F\u3000]+$/;
    var nonLineBreakWhiteSpaceRegex = /^[\t \u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000]+$/;
    var lineBreakRegex = /^[\n-\r\u0085\u2028\u2029]$/;

    var defaultLanguage = "en";

    var isDirectionBackward = api.Selection.isDirectionBackward;

    // Properties representing whether trailing spaces inside blocks are completely collapsed (as they are in WebKit,
    // but not other browsers). Also test whether trailing spaces before <br> elements are collapsed.
    var trailingSpaceInBlockCollapses = false;
    var trailingSpaceBeforeBrCollapses = false;
    var trailingSpaceBeforeLineBreakInPreLineCollapses = true;

    var getComputedStyleProperty;
    if (typeof window.getComputedStyle != UNDEF) {
        getComputedStyleProperty = function(el, propName, transaction, win) {
            return (win || dom.getWindow(el)).getComputedStyle(el, null)[propName];
        };
    } else if (typeof document.documentElement.currentStyle != UNDEF) {
        getComputedStyleProperty = function(el, propName, transaction) {
            return el.currentStyle[propName];
        };
    } else {
        module.fail("No means of obtaining computed style properties found");
    }

    // "A block node is either an Element whose "display" property does not have
    // resolved value "inline" or "inline-block" or "inline-table" or "none", or a
    // Document, or a DocumentFragment."
    function isBlockNode(node, transaction) {
        return node
            && ((node.nodeType == 1 && !/^(inline(-block|-table)?|none)$/.test(getComputedDisplay(node, transaction)))
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
    function getComputedDisplay(el, win, transaction) {
        var display = getComputedStyleProperty(el, "display", transaction, win);
        var tagName = el.tagName.toLowerCase();
        return (display == "block"
            && tableCssDisplayBlock
            && defaultDisplayValueForTag.hasOwnProperty(tagName))
            ? defaultDisplayValueForTag[tagName] : display;
    }

    function isHidden(node, transaction) {
        var ancestors = getAncestorsAndSelf(node);
        for (var i = 0, len = ancestors.length; i < len; ++i) {
            if (ancestors[i].nodeType == 1 && getComputedDisplay(ancestors[i], transaction) == "none") {
                return true;
            }
        }

        return false;
    }

    function isVisibilityHiddenTextNode(textNode, transaction) {
        var el;
        return textNode.nodeType == 3
            && (el = textNode.parentNode)
            && getComputedStyleProperty(el, "visibility", transaction) == "hidden";
    }

    // Adpated from Aryeh's code.
    // "A whitespace node is either a Text node whose data is the empty string; or
    // a Text node whose data consists only of one or more tabs (0x0009), line
    // feeds (0x000A), carriage returns (0x000D), and/or spaces (0x0020), and whose
    // parent is an Element whose resolved value for "white-space" is "normal" or
    // "nowrap"; or a Text node whose data consists only of one or more tabs
    // (0x0009), carriage returns (0x000D), and/or spaces (0x0020), and whose
    // parent is an Element whose resolved value for "white-space" is "pre-line"."
    function isWhitespaceNode(node, transaction) {
        if (!node || node.nodeType != 3) {
            return false;
        }
        var text = node.data;
        if (text === "") {
            return true;
        }
        var parent = node.parentNode;
        if (!parent || parent.nodeType != 1) {
            return false;
        }
        var computedWhiteSpace = getComputedStyleProperty(node.parentNode, "whiteSpace", transaction);

        return (/^[\t\n\r ]+$/.test(text) && /^(normal|nowrap)$/.test(computedWhiteSpace))
            || (/^[\t\r ]+$/.test(text) && computedWhiteSpace == "pre-line");
    }

    // Adpated from Aryeh's code.
    // "node is a collapsed whitespace node if the following algorithm returns
    // true:"
    function isCollapsedWhitespaceNode(node, transaction) {
        // "If node's data is the empty string, return true."
        if (node.data === "") {
            return true;
        }

        // "If node is not a whitespace node, return false."
        if (!isWhitespaceNode(node, transaction)) {
            return false;
        }

        // "Let ancestor be node's parent."
        var ancestor = node.parentNode;

        // "If ancestor is null, return true."
        if (!ancestor) {
            return true;
        }

        // "If the "display" property of some ancestor of node has resolved value "none", return true."
        if (isHidden(node, transaction)) {
            return true;
        }

        // "While ancestor is not a block node and its parent is not null, set
        // ancestor to its parent."
        while (!isBlockNode(ancestor, transaction) && ancestor.parentNode) {
            ancestor = ancestor.parentNode;
        }
        
        // Ancestor is now the containing block element of node or the root container of node

        // "Let reference be node."
        var reference = node;

        // "While reference is a descendant of ancestor:"
        while (reference != ancestor) {
            // "Let reference be the node before it in tree order."
            reference = previousNode(reference);

            log.info("reference is " + dom.inspectNode(reference), isWhitespaceNode(reference, transaction));

            // "If reference is a block node or a br, return true."
            if (isBlockNode(reference, transaction) || isHtmlElement(reference, "br")) {
                return true;
            }

            // "If reference is a Text node that is not a whitespace node, or is an
            // img, break from this loop."
            if ((reference.nodeType == 3 && !isWhitespaceNode(reference, transaction)) || isHtmlElement(reference, "img")) {
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

            log.info("reference is " + dom.inspectNode(reference), isWhitespaceNode(reference, transaction));

            // "If reference is a block node or a br, return true."
            if (isBlockNode(reference) || isHtmlElement(reference, "br")) {
                return true;
            }

            // "If reference is a Text node that is not a whitespace node, or is an
            // img, break from this loop."
            if ((reference && reference.nodeType == 3 && !isWhitespaceNode(reference, transaction)) || isHtmlElement(reference, "img")) {
                break;
            }
        }

        // "Return false."
        return false;
    }
    

    /*
    
    - Add rangy.domIsFrozen() and rangy.domIsUnfrozen() or similar to indicate that the DOM will not change, thus
      allowing Rangy to persist DOM metadata between calls.
    - Change isCollapsedWhitespaceNode to a function that returns infomration baout whether the whitespace node is the
      last inline descendant of a block or immediately precedes a <br>
    - Add node metadata info object to every position. Also next and previous properties, and property indicating
      whether position character information is complete
      
    - Reimplement hasInnerText() to find or create the position at the start of the node and populate positions until it
      finds a character.
    
     */
    
});