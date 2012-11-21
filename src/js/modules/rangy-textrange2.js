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

    /*----------------------------------------------------------------------------------------------------------------*/

    // This function must create word and non-word tokens for the whole of the text supplied to it
    function defaultTokenizer(chars, wordOptions) {
        var word = chars.join(""), result, tokens = [];

        function createTokenFromRange(start, end, isWord) {
            var tokenChars = chars.slice(start, end);
            var token = {
                isWord: isWord,
                chars: tokenChars,
                toString: function() {
                    return tokenChars.join("");
                }
            };
            for (var i = 0, len = tokenChars.length; i < len; ++i) {
                tokenChars[i].token = token;
            }
            tokens.push(token);
        }

        // Match words and mark characters
        var lastWordEnd = 0, wordStart, wordEnd;
        while ( (result = wordOptions.wordRegex.exec(word)) ) {
            wordStart = result.index;
            wordEnd = wordStart + result[0].length;

            // Create token for non-word characters preceding this word
            if (wordStart > lastWordEnd) {
                createTokenFromRange(lastWordEnd, wordStart, false);
            }

            // Get trailing space characters for word
            if (wordOptions.includeTrailingSpace) {
                while (nonLineBreakWhiteSpaceRegex.test(chars[wordEnd])) {
                    ++wordEnd;
                }
            }
            createTokenFromRange(wordStart, wordEnd, true);
            lastWordEnd = wordEnd;
        }

        // Create token for trailing non-word characters, if any exist
        if (lastWordEnd < chars.length) {
            createTokenFromRange(lastWordEnd, chars.length, false);
        }

        return tokens;
    }

    var defaultCharacterOptions = {
        collapseSpaceBeforeLineBreak: true
    };

    var defaultWordOptions = {
        "en": {
            wordRegex: /[a-z0-9]+('[a-z0-9]+)*/gi,
            includeTrailingSpace: false,
            tokenizer: defaultTokenizer
        }
    };

    function createWordOptions(options) {
        var lang, defaults;
        if (!options) {
            return defaultWordOptions[defaultLanguage];
        } else {
            lang = options.language || defaultLanguage;
            defaults = {};
            extend(defaults, defaultWordOptions[lang] || defaultWordOptions[defaultLanguage]);
            extend(defaults, options);
            return defaults;
        }
    }

    var defaultFindOptions = {
        caseSensitive: false,
        withinRange: null,
        wholeWordsOnly: false,
        wrap: false,
        direction: "forward",
        wordOptions: null,
        characterOptions: null
    };

    var defaultMoveOptions = {
        wordOptions: null,
        characterOptions: null
    };

    var defaultExpandOptions = {
        wordOptions: null,
        characterOptions: null,
        trim: false,
        trimStart: true,
        trimEnd: true
    };

    var defaultWordIteratorOptions = {
        wordOptions: null,
        characterOptions: null,
        direction: "forward"
    };

    /*----------------------------------------------------------------------------------------------------------------*/
    
    /* DOM utility functions */
    

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


    /*
    functions to wrap:
    
    - isWhitespaceNode
    - isCollapsedWhitespaceNode?
    - getComputedDisplay
    - isCollapsedNode
    - isIgnoredNode
    
     */
    
    function createCachingFunction(func, metadataKey) {
        return function() {
            //if ()
        }
    }

    /*----------------------------------------------------------------------------------------------------------------*/

    // Create cachable versions of DOM functions

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

    /*----------------------------------------------------------------------------------------------------------------*/


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



    // Adpated from Aryeh's code.
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
        if (text === "") {
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

    // Adpated from Aryeh's code.
    // "node is a collapsed whitespace node if the following algorithm returns
    // true:"
    function isCollapsedWhitespaceNode(node) {
        // "If node's data is the empty string, return true."
        if (node.data === "") {
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
        
        return false;
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

    /*----------------------------------------------------------------------------------------------------------------*/

    // Possibly overengineered caching system to prevent repeated DOM calls slowing everything down

    function Cache() {
        this.store = {};
    }
    
    Cache.prototype = {
        get: function(key) {
            return this.store.hasOwnProperty(key) ? this.store[key] : null;
        },
        
        set: function(key, value) {
            return this.store[key] = value;
        }
    };
    
    function createCachingPropertyGetter(obj, methodName, func, objProperty) {
        obj[methodName] = function(args) {
            var cache = this.cache;
            if (cache.hasOwnProperty(methodName)) {
                return cache[methodName];
            } else {
                var value = func.call(obj, objProperty ? this[objProperty] : this, args);
                cache[methodName] = value;
                return value;
            }
        };
    }

    /*----------------------------------------------------------------------------------------------------------------*/
    
    function NodeWrapper(node, transaction) {
        this.node = node;
        this.transaction = transaction;
        this.cache = new Cache();
        this.positions = new Cache();
    }

    var nodeProto = {
        getPosition: function(offset) {
            var positions = this.positions;
            return positions.get(offset) || positions.set(offset, new Position(this, offset));
        },
        
        toString: function() {
            return "[NodeWrapper(" + dom.inspectNode(this.node) + ")]";
        }
    };

    NodeWrapper.prototype = nodeProto;

    createCachingPropertyGetter(nodeProto, "isCharacterDataNode", dom.isCharacterDataNode, "node");
    createCachingPropertyGetter(nodeProto, "getNodeIndex", dom.getNodeIndex, "node");
    createCachingPropertyGetter(nodeProto, "getLength", dom.getNodeLength, "node");
    createCachingPropertyGetter(nodeProto, "containsPositions", containsPositions, "node");
    createCachingPropertyGetter(nodeProto, "isWhitespace", isWhitespaceNode, "node");
    createCachingPropertyGetter(nodeProto, "isCollapsedWhitespace", isCollapsedWhitespaceNode, "node");
    createCachingPropertyGetter(nodeProto, "getComputedDisplay", getComputedDisplay, "node");
    createCachingPropertyGetter(nodeProto, "isCollapsed", isCollapsedNode, "node");
    createCachingPropertyGetter(nodeProto, "isIgnored", isIgnoredNode, "node");
    createCachingPropertyGetter(nodeProto, "next", nextNode, "node");
    createCachingPropertyGetter(nodeProto, "previous", previousNode, "node");

    createCachingPropertyGetter(nodeProto, "getTextNodeInfo", function(textNode) {
        log.debug("getTextNodeInfo for " + textNode.data);
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
    }, "node");

    var EMPTY = 0,
        NON_SPACE = 1,
        UNCOLLAPSIBLE_SPACE = 2,
        COLLAPSIBLE_SPACE = 3,
        TRAILING_SPACE_IN_BLOCK = 4,
        TRAILING_SPACE_BEFORE_BR = 5,
        PRE_LINE_TRAILING_SPACE_BEFORE_LINE_BREAK = 6;

    createCachingPropertyGetter(nodeProto, "getInnerTextInfo", function(el, backward) {
        var transaction = this.transaction;
        var posAfterEl = transaction.getPosition(el.parentNode, this.getNodeIndex() + 1);
        var firstPosInEl = transaction.getPosition(el, 0);
        
        var pos = backward ? posAfterEl : firstPosInEl;
        var endPos = backward ? firstPosInEl : posAfterEl;
        
        var hasInnerText = false;
        var hasPossibleTrailingSpaceInBlock = false;
        var hasPossibleTrailingSpaceBeforeBr = false;
        var hasPossiblePreLineSpaceBeforeLineBreak = false;
        
        
        var returnValue = {
            hasInnerText: false,
            hasPossibleTrailingSpaceInBlock: false,
            hasPossibleTrailingSpaceBeforeBr: false,
            hasPossiblePreLineSpaceBeforeLineBreak: false
        };
        
        while (pos !== endPos) {
            pos.prepopulateChar();
            if (pos.finalizedChar && pos.type != EMPTY) {
                returnValue.hasInnerText = true;
                break;
            } else if (pos.type == PRE_LINE_TRAILING_SPACE_BEFORE_LINE_BREAK) {
                returnValue.hasPossiblePreLineSpaceBeforeLineBreak = true;
            }
            // TODO: Remaining cases
        }
        
        return returnValue;
    }, "node");


    createCachingPropertyGetter(nodeProto, "getTrailingSpace", function(el) {
        if (el.tagName.toLowerCase() == "br") {
            return "";
        } else {
            switch (getComputedDisplay(el)) {
                case "inline":
                    var child = el.lastChild;
                    while (child) {
                        if (!isIgnoredNode(child)) {
                            return (child.nodeType == 1) ? this.transaction.getNodeWrapper(child).getTrailingSpace() : "";
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
                    return this.getInnerTextInfo(true) ? "\n" : "";
            }
        }
        return "";
    }, "node");


    /*
        createCachingPropertyGetter(nodeProto, "hasInnerText", function(nodeWrapper) {
            if (!nodeWrapper.isCollapsed()) {
                if (nodeWrapper.node.nodeType == 3) {
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
        });
    */

    /*----------------------------------------------------------------------------------------------------------------*/


    function Position(nodeWrapper, offset) {
        this.offset = offset;
        this.nodeWrapper = nodeWrapper;
        this.node = nodeWrapper.node;
        this.transaction = nodeWrapper.transaction;
        this.cache = new Cache();
    }

    var positionProto = {
        character: "",
        characterType: EMPTY,

        /*
        This method:
        - Fully populates positions that have characters that can be determined independently of any other characters.
        - Populates most types of space positions with a provisional character. The character is finalized later.
         */
        prepopulateChar: function() {
            var pos = this;
            if (!pos.prepopulatedChar) {
                var node = pos.node, offset = pos.offset;
                log.debug("prepopulateChar " + pos);
                var visibleChar = "", charType = EMPTY;
                var finalizedChar = false;
                if (offset > 0) {
                    if (node.nodeType == 3) {
                        var text = node.data;
                        var textChar = text.charAt(offset - 1);
                        log.debug("Got char '" + textChar + "' in data '" + text + "'");

                        var nodeInfo = pos.nodeWrapper.getTextNodeInfo();
                        var spaceRegex = nodeInfo.spaceRegex;
                        if (nodeInfo.collapseSpaces) {
                            if (spaceRegex.test(textChar)) {
                                // "If the character at position is from set, append a single space (U+0020) to newdata and advance
                                // position until the character at position is not from set."

                                // We also need to check for the case where we're in a pre-line and we have a space preceding a
                                // line break, because such spaces are collapsed in some browsers
                                if (offset > 1 && spaceRegex.test(text.charAt(offset - 2))) {
                                    log.debug("Character is a collapsible space preceded by another collapsible space, therefore empty");
                                } else if (nodeInfo.preLine && text.charAt(offset) === "\n") {
                                    log.debug("Character is a collapsible space which is followed by a line break in a pre-line element, skipping");
                                    visibleChar = " ";
                                    charType = PRE_LINE_TRAILING_SPACE_BEFORE_LINE_BREAK;
                                } else {
                                    log.debug("Character is a collapsible space not preceded by another collapsible space, adding");
                                    visibleChar = " ";
                                    charType = COLLAPSIBLE_SPACE;
                                }
                            } else {
                                log.debug("Character is not a space, adding");
                                visibleChar = textChar;
                                charType = NON_SPACE;
                                finalizedChar = true;
                            }
                        } else {
                            log.debug("Spaces are not collapsible, so adding");
                            visibleChar = textChar;
                            charType = UNCOLLAPSIBLE_SPACE;
                            finalizedChar = true;
                        }
                    } else {
                        var nodePassed = node.childNodes[offset - 1];
                        if (nodePassed && nodePassed.nodeType == 1 && !isCollapsedNode(nodePassed)) {
                            if (nodePassed.tagName.toLowerCase() == "br") {
                                log.debug("Node is br");
                                visibleChar = "\n";
                                pos.isBr = true;
                                charType = UNCOLLAPSIBLE_SPACE;
                                finalizedChar = true;
                            } else {
                                log.debug("Need to get trailing space for node " + dom.inspectNode(nodePassed) + ". Will do this later.");
                                pos.checkForTrailingSpace = true;
                            }
                        }

                        // Check the leading space of the next node for the case when a block element follows an inline
                        // element or text node. In that case, there is an implied line break between the two nodes.
                        if (!visibleChar) {
                            log.debug("Need to get leading space for node " + dom.inspectNode(nodePassed) + ". Will do this later.");
                            pos.checkForLeadingSpace = true;
                        }
                    }
                }

                pos.prepopulatedChar = true;
                pos.character = visibleChar;
                pos.characterType = charType;
                pos.finalizedChar = finalizedChar;
            }
        },

        // Preceding positions on which this position relies are now guaranteed to be finalized
        finalizeWithPreceding: function() {
            log.debug("finalizeWithPreceding called on " + this);
            
            if (this.checkForTrailingSpace) {
                log.debug("Getting trailing space for node wrapper " + this.nodeWrapper);
                var trailingSpace = this.nodeWrapper.getTrailingSpace();
                if (visibleChar) {
                    isTrailingSpace = collapsible = true;
                }

            }
            
            var pos = this;
            var preceding;
            while ( (pos = pos.previousVisible()) ) {
                //if ()
            }
        },
        
        finalizeChar: function() {
            var pos = this;
            pos.prepopulateChar();
            if (!pos.finalizedChar) {
                // There is still work to be done to finalize the character, which means it must need to look at the
                // preceding character. To get hold of the preceding character, we need to work backwards to a position
                // that has a non-space character.
                var previousPos = pos, previous, previousPossibleChar;
                var unfinalizedPositions = [];
                //var previousFinalizedPos = null;
                while ( (previousPos = previousPos.previousVisible()) ) {
                    previousPos.prepopulateChar();
                    if (previousPos.finalizedChar) {
                        //previousFinalizedPos = previousPos;
                        break;
                    } else {
                        unfinalizedPositions.push(previousPos);
                    }
                }
                // Finalize intervening positions
                var posToFinalize;
                while ( (posToFinalize = unfinalizedPositions.pop()) ) {
                    posToFinalize.finalizeWithPreceding();
                    //previousFinalizedPos = posToFinalize;
                }
            }
        },
        
        toString: function() {
            return "[" + dom.inspectNode(this.node) + ":" + this.offset + "]";
        }
    };
    
    Position.prototype = positionProto;

    createCachingPropertyGetter(positionProto, "next", function(pos) {
        var nodeWrapper = pos.nodeWrapper, node = pos.node, offset = pos.offset, transaction = nodeWrapper.transaction;
        if (!node) {
            return null;
        }
        var nextNode, nextOffset, child;
        if (offset == nodeWrapper.getLength()) {
            // Move onto the next node
            nextNode = node.parentNode;
            nextOffset = nextNode ? nodeWrapper.getNodeIndex() + 1 : 0;
        } else {
            if (nodeWrapper.isCharacterDataNode()) {
                nextNode = node;
                nextOffset = offset + 1;
            } else {
                child = node.childNodes[offset];
                // Go into the children next, if children there are
                if (transaction.getNodeWrapper(child).containsPositions()) {
                    nextNode = child;
                    nextOffset = 0;
                } else {
                    nextNode = node;
                    nextOffset = offset + 1;
                }
            }
        }

        return nextNode ? transaction.getPosition(nextNode, nextOffset) : null;
    });

    createCachingPropertyGetter(positionProto, "previous", function(pos) {
        var nodeWrapper = pos.nodeWrapper, node = pos.node, offset = pos.offset, transaction = nodeWrapper.transaction;
        var previousNode, previousOffset, child;
        if (offset == 0) {
            previousNode = node.parentNode;
            previousOffset = previousNode ? nodeWrapper.getNodeIndex() : 0;
        } else {
            if (nodeWrapper.isCharacterDataNode()) {
                previousNode = node;
                previousOffset = offset - 1;
            } else {
                child = node.childNodes[offset - 1];
                // Go into the children next, if children there are
                if (transaction.getNodeWrapper(child).containsPositions()) {
                    previousNode = child;
                    previousOffset = dom.getNodeLength(child);
                } else {
                    previousNode = node;
                    previousOffset = offset - 1;
                }
            }
        }
        return previousNode ? transaction.getPosition(previousNode, previousOffset) : null;
    });

    /*
     Next and previous position moving functions that filter out

     - Hidden (CSS visibility/display) elements
     - Script and style elements
     - collapsed whitespace characters
     */
    createCachingPropertyGetter(positionProto, "nextVisible", function(pos) {
        var next = pos.next();
        if (!next) {
            return null;
        }
        var nodeWrapper = next.nodeWrapper, node = next.node;
        var newPos = next;
        if (nodeWrapper.isCollapsed()) {
            // We're skipping this node and all its descendants
            newPos = nodeWrapper.transaction.getPosition(node.parentNode, nodeWrapper.getNodeIndex() + 1);
        }
        return newPos;
    });

    createCachingPropertyGetter(positionProto, "previousVisible", function(pos) {
        var previous = pos.previous();
        if (!previous) {
            return null;
        }
        var nodeWrapper = previous.nodeWrapper, node = previous.node;
        var newPos = previous;
        if (nodeWrapper.isCollapsed()) {
            // We're skipping this node and all its descendants
            newPos = nodeWrapper.transaction.getPosition(node.parentNode, nodeWrapper.getNodeIndex());
        }
        return newPos;
    });

    /*----------------------------------------------------------------------------------------------------------------*/

    var currentTransaction = null;
    
    var Transaction = (function() {
        function createWrapperCache(nodeProperty) {
            var cache = new Cache();

            return {
                get: function(node) {
                    var wrappersByProperty = cache.get(node[nodeProperty]);
                    if (wrappersByProperty) {
                        for (var i = 0, wrapper; wrapper = wrappersByProperty[i++]; ) {
                            if (wrapper.node === node) {
                                return wrapper;
                            }
                        }
                    }
                    return null;
                },

                set: function(nodeWrapper) {
                    var property = nodeWrapper.node[nodeProperty];
                    var wrappersByProperty = cache.get(property) || cache.set(property, []);
                    wrappersByProperty.push(nodeWrapper);
                }
            };
        }

        var uniqueIDSupported = util.isHostProperty(document.documentElement, "uniqueID");

        function Transaction() {
            this.initCaches();
        }

        Transaction.prototype = {
            initCaches: function() {
                this.elementCache = uniqueIDSupported ? (function() {
                    var elementsCache = new Cache();

                    return {
                        get: function(el) {
                            return elementsCache.get(el.uniqueID);
                        },

                        set: function(elWrapper) {
                            elementsCache.set(elWrapper.node.uniqueID, elWrapper);
                        }
                    };
                })() : createWrapperCache("tagName");

                // Store text nodes keyed by data, although we may need to truncate this
                this.textNodeCache = createWrapperCache("data");
                this.otherNodeCache = createWrapperCache("nodeName");
            },
            
            getNodeWrapper: function(node) {
                var wrapperCache;
                switch (node.nodeType) {
                    case 1:
                        wrapperCache = this.elementCache;
                        break;
                    case 3:
                        wrapperCache = this.textNodeCache;
                        break;
                    default:
                        wrapperCache = this.otherNodeCache;
                        break;
                }

                var wrapper = wrapperCache.get(node);
                if (!wrapper) {
                    wrapper = new NodeWrapper(node, this);
                    wrapperCache.set(wrapper);
                }
                return wrapper;
            },

            getPosition: function(node, offset) {
                return this.getNodeWrapper(node).getPosition(offset);
            }
        };
        
        return Transaction;
    })();

    /*----------------------------------------------------------------------------------------------------------------*/

    function startTransaction() {
        if (!currentTransaction) {
            currentTransaction = new Transaction();
        }
    }

    function endTransaction() {
        currentTransaction = null;
    }

    /*----------------------------------------------------------------------------------------------------------------*/

    // Extensions to the rangy.dom utility object

    extend(dom, {
        nextNode: nextNode,
        previousNode: previousNode
    });

    /*----------------------------------------------------------------------------------------------------------------*/



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

    function getLeadingSpace(el) {
        switch (getComputedDisplay(el)) {
            case "inline":
            case "inline-block":
            case "inline-table":
            case "none":
            case "table-column":
            case "table-column-group":
            case "table-cell":
                break;
            default:
                return hasInnerText(el) ? "\n" : "";
        }
        return "";
    }
























    function getCharacterAt(pos, precedingChars, options) {
        var possible = getPossibleCharacterAt(pos);
        var possibleChar = possible.character;
        var next, preceding;
        log.group("*** getCharacterAt got possible char '" + possibleChar + "' at position " + pos);
        if (possibleChar) {
            if (spacesRegex.test(possibleChar)) {
                if (!precedingChars) {
                    // Work backwards until we have a non-space character
                    var previousPos = pos, previous, previousPossibleChar;
                    precedingChars = [];
                    while ( (previousPos = previousVisiblePosition(previousPos)) ) {
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
                preceding = precedingChars[precedingChars.length - 1];

                log.info("possible.collapsible: " + possible.collapsible + ", leading space: " + possible.isLeadingSpace + ", trailing space: " + possible.isTrailingSpace);
                if (preceding) {
                    log.info("preceding: '" + preceding + "' (" + preceding.position + "), possible: " + possible.position);
                    log.info([possible.isLeadingSpace, possibleChar == "\n", [!preceding, preceding.isLeadingSpace, !dom.isOrIsAncestorOf(possible.position.node.parentNode, preceding.position.node), dom.inspectNode(possible.position.node.parentNode), dom.inspectNode(preceding.position.node)]]);
                }

                // Disallow a collapsible space that follows a trailing space or line break, or is the first character
                if (possibleChar === " " && possible.collapsible &&
                    (!preceding || preceding.isTrailingSpace || preceding.character == "\n")) {
                    log.info("Preceding character is a trailing space or non-existent or follows a line break and current possible character is a collapsible space, so space is collapsed");
                    possible.character = "";
                }

                // Disallow a collapsible space that is followed by a line break or is the last character
                else if (possible.collapsible &&
                    (!(next = getNextPossibleCharacter(pos))
                        || (next.character == "\n" && options.collapseSpaceBeforeLineBreak && next.collapsesPrecedingSpace()))) {
                    log.debug("Character is a space which is followed by a line break that collapses preceding spaces, or nothing, so collapsing");
                    possible.character = "";
                }

                // Collapse a br element that is followed by a trailing space
                else if (possibleChar === "\n" && !possible.collapsible && (!(next = getNextPossibleCharacter(pos)) || next.isTrailingSpace)) {
                    log.debug("Character is a br which is followed by a trailing space or nothing, collapsing");
                    possible.character = "";
                }
            }
        }
        log.groupEnd();
        return possible;
    }

    function createCharacterIterator(startPos, backward, endPos, characterOptions) {
        log.info("createCharacterIterator called backwards " + backward + " and with endPos " + (endPos ? endPos.inspect() : ""));

        // Adjust the end position to ensure that it is actually reached
        if (endPos) {
            if (backward) {
                if (isCollapsedNode(endPos.node)) {
                    endPos = previousVisiblePosition(endPos);
                }
            } else {
                if (isCollapsedNode(endPos.node)) {
                    endPos = nextVisiblePosition(endPos);
                }
            }
        }
        log.info("endPos now " + (endPos ? endPos.inspect() : ""));

        var pos = startPos, finished = false;

        function next() {
            var textPos = null;
            if (!finished) {
                if (!backward) {
                    pos = nextVisiblePosition(pos);
                }
                if (pos) {
                    textPos = getCharacterAt(pos, null, characterOptions);
                    //log.debug("pos is " + pos.inspect() + ", endPos is " + (endPos ? endPos.inspect() : null) + ", equal is " + pos.equals(endPos));
                    if (endPos && pos.equals(endPos)) {
                        finished = true;
                    }
                } else {
                    finished = true;
                }
                if (backward) {
                    pos = previousVisiblePosition(pos);
                }
            }
            return textPos;
        }

        var previousTextPos, returnPreviousTextPos = false;

        return {
            next: function() {
                if (returnPreviousTextPos) {
                    returnPreviousTextPos = false;
                    return previousTextPos;
                } else {
                    var textPos;
                    while ( (textPos = next()) ) {
                        if (textPos.character) {
                            previousTextPos = textPos;
                            return textPos;
                        }
                    }
                }
            },

            rewind: function() {
                if (previousTextPos) {
                    returnPreviousTextPos = true;
                } else {
                    throw module.createError("createCharacterIterator: cannot rewind. Only one position can be rewound.");
                }
            },

            dispose: function() {
                startPos = endPos = null;
            }
        };
    }

    function movePositionBy(pos, unit, count, characterOptions, wordOptions) {
        log.info("movePositionBy called " + count);
        var unitsMoved = 0, newPos = pos, textPos, charIterator, nextTextPos, newTextPos, absCount = Math.abs(count), token;
        if (count !== 0) {
            var backward = (count < 0);

            switch (unit) {
                case CHARACTER:
                    charIterator = createCharacterIterator(pos, backward, null, characterOptions);
                    while ( (textPos = charIterator.next()) && unitsMoved < absCount ) {
                        log.info("*** movePositionBy GOT CHAR " + textPos.character + "[" + textPos.character.charCodeAt(0) + "]");
                        ++unitsMoved;
                        newTextPos = textPos;
                    }
                    nextTextPos = textPos;
                    charIterator.dispose();
                    break;
                case WORD:
                    var tokenizedTextProvider = createTokenizedTextProvider(pos, characterOptions, wordOptions);
                    var next = backward ? tokenizedTextProvider.previousStartToken : tokenizedTextProvider.nextEndToken;

                    while ( (token = next()) && unitsMoved < absCount ) {
                        log.debug("token: " + token.chars.join(""), token.isWord);
                        if (token.isWord) {
                            ++unitsMoved;
                            log.info("**** FOUND END OF WORD. unitsMoved NOW " + unitsMoved);
                            newTextPos = backward ? token.chars[0] : token.chars[token.chars.length - 1];
                        }
                    }
                    break;
                default:
                    throw new Error("movePositionBy: unit '" + unit + "' not implemented");
            }

            // Perform any necessary position tweaks
            if (newTextPos) {
                newPos = newTextPos.position;
            }
            if (backward) {
                log.debug("Adjusting position. Current newPos: " + newPos);
                newPos = previousVisiblePosition(newPos);
                log.debug("newPos now: " + newPos);
                unitsMoved = -unitsMoved;
            } else if (newTextPos && newTextPos.isLeadingSpace) {
                // Tweak the position for the case of a leading space. The problem is that an uncollapsed leading space
                // before a block element (for example, the line break between "1" and "2" in the following HTML:
                // "1<p>2</p>") is considered to be attached to the position immediately before the block element, which
                // corresponds with a different selection position in most browsers from the one we want (i.e. at the
                // start of the contents of the block element). We get round this by advancing the position returned to
                // the last possible equivalent visible position.
                log.info("movePositionBy ended immediately after a leading space at " + newPos);
                if (unit == WORD) {
                    charIterator = createCharacterIterator(pos, false, null, characterOptions);
                    nextTextPos = charIterator.next();
                    charIterator.dispose();
                }
                if (nextTextPos) {
                    newPos = previousVisiblePosition(nextTextPos.position);
                    log.info("movePositionBy adjusted leading space position to " + newPos);
                }
            }
        }

        return {
            position: newPos,
            unitsMoved: unitsMoved
        };
    }

    function createRangeCharacterIterator(range, characterOptions, backward) {
        var rangeStart = getRangeStartPosition(range), rangeEnd = getRangeEndPosition(range);
        var itStart = backward ? rangeEnd : rangeStart, itEnd = backward ? rangeStart : rangeEnd;
        return createCharacterIterator(itStart, !!backward, itEnd, characterOptions);
    }

    function getRangeCharacters(range, characterOptions) {
        log.info("getRangeCharacters called on range " + range.inspect());

        var chars = [], it = createRangeCharacterIterator(range, characterOptions), textPos;
        while ( (textPos = it.next()) ) {
            log.info("*** GOT CHAR " + textPos.character + "[" + textPos.character.charCodeAt(0) + "]");
            chars.push(textPos);
        }

        it.dispose();
        return chars;
    }

    function isWholeWord(startPos, endPos, wordOptions) {
        var range = api.createRange(startPos.node);
        range.setStart(startPos.node, startPos.offset);
        range.setEnd(endPos.node, endPos.offset);
        var returnVal = !range.expand("word", wordOptions);
        range.detach();
        return returnVal;
    }

    function findTextFromPosition(initialPos, searchTerm, isRegex, searchScopeRange, findOptions) {
        log.debug("findTextFromPosition called with search term " + searchTerm + ", initialPos " + initialPos.inspect() + " within range " + searchScopeRange.inspect());
        var backward = isDirectionBackward(findOptions.direction);
        var it = createCharacterIterator(
            initialPos,
            backward,
            backward ? getRangeStartPosition(searchScopeRange) : getRangeEndPosition(searchScopeRange),
            findOptions
        );
        var text = "", chars = [], textPos, currentChar, matchStartIndex, matchEndIndex;
        var result, insideRegexMatch;
        var returnValue = null;

        function handleMatch(startIndex, endIndex) {
            var startPos = previousVisiblePosition(chars[startIndex].position);
            var endPos = chars[endIndex - 1].position;
            var valid = (!findOptions.wholeWordsOnly || isWholeWord(startPos, endPos, findOptions.wordOptions));

            return {
                startPos: startPos,
                endPos: endPos,
                valid: valid
            };
        }

        while ( (textPos = it.next()) ) {
            currentChar = textPos.character;
            currentChar = textPos.character;
            if (!isRegex && !findOptions.caseSensitive) {
                currentChar = currentChar.toLowerCase();
            }

            if (backward) {
                chars.unshift(textPos);
                text = currentChar + text;
            } else {
                chars.push(textPos);
                text += currentChar;
            }

            if (isRegex) {
                result = searchTerm.exec(text);
                if (result) {
                    if (insideRegexMatch) {
                        // Check whether the match is now over
                        matchStartIndex = result.index;
                        matchEndIndex = matchStartIndex + result[0].length;
                        if ((!backward && matchEndIndex < text.length) || (backward && matchStartIndex > 0)) {
                            returnValue = handleMatch(matchStartIndex, matchEndIndex);
                            break;
                        }
                    } else {
                        insideRegexMatch = true;
                    }
                }
            } else if ( (matchStartIndex = text.indexOf(searchTerm)) != -1 ) {
                returnValue = handleMatch(matchStartIndex, matchStartIndex + searchTerm.length);
                break;
            }
        }

        // Check whether regex match extends to the end of the range
        if (insideRegexMatch) {
            returnValue = handleMatch(matchStartIndex, matchEndIndex);
        }
        it.dispose();

        return returnValue;
    }

    api.textRange = {
        isBlockNode: isBlockNode,
        isCollapsedWhitespaceNode: isCollapsedWhitespaceNode,
        createPosition: function(node, offset) {
            return new Transaction().getPosition(node, offset);
        }
    };
});