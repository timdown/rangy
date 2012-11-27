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
        includeBlockContentTrailingSpace: true,
        includeSpaceBeforeBr: true,
        includePreLineTrailingSpace: true
    };
    
    function createCharacterOptions() {
        
    }

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
    
    function createCachingGetter(obj, methodName, func, objProperty) {
        return function(args) {
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

    var EMPTY = 0,
        NON_SPACE = 1,
        UNCOLLAPSIBLE_SPACE = 2,
        COLLAPSIBLE_SPACE = 3,
        TRAILING_SPACE_IN_BLOCK = 4,
        TRAILING_SPACE_BEFORE_BR = 5,
        PRE_LINE_TRAILING_SPACE_BEFORE_LINE_BREAK = 6;


    extend(nodeProto, {
        isCharacterDataNode: createCachingGetter(nodeProto, "isCharacterDataNode", dom.isCharacterDataNode, "node"),
        getNodeIndex: createCachingGetter(nodeProto, "nodeIndex", dom.getNodeIndex, "node"),
        getLength: createCachingGetter(nodeProto, "nodeLength", dom.getNodeLength, "node"),
        containsPositions: createCachingGetter(nodeProto, "containsPositions", containsPositions, "node"),
        isWhitespace: createCachingGetter(nodeProto, "isWhitespace", isWhitespaceNode, "node"),
        isCollapsedWhitespace: createCachingGetter(nodeProto, "isCollapsedWhitespace", isCollapsedWhitespaceNode, "node"),
        getComputedDisplay: createCachingGetter(nodeProto, "computedDisplay", getComputedDisplay, "node"),
        isCollapsed: createCachingGetter(nodeProto, "collapsed", isCollapsedNode, "node"),
        isIgnored: createCachingGetter(nodeProto, "ignored", isIgnoredNode, "node"),
        next: createCachingGetter(nodeProto, "nextPos", nextNode, "node"),
        previous: createCachingGetter(nodeProto, "previous", previousNode, "node"),

        getTextNodeInfo: createCachingGetter(nodeProto, "textNodeInfo", function(textNode) {
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
        }, "node"),

        hasInnerText: createCachingGetter(nodeProto, "hasInnerText", function(el, backward) {
            var transaction = this.transaction;
            var posAfterEl = transaction.getPosition(el.parentNode, this.getNodeIndex() + 1);
            var firstPosInEl = transaction.getPosition(el, 0);

            var pos = backward ? posAfterEl : firstPosInEl;
            var endPos = backward ? firstPosInEl : posAfterEl;

            /*
             <body><p>X  </p><p>Y</p></body>

             Positions:

             body:0:""
             p:0:""
             text:0:""
             text:1:"X"
             text:2:TRAILING_SPACE_IN_BLOCK
             text:3:COLLAPSED_SPACE
             p:1:""
             body:1:"\n"
             p:0:""
             text:0:""
             text:1:"Y"

             A character is a TRAILING_SPACE_IN_BLOCK iff:

             - There is no uncollapsed character after it within the visible containing block element

             A character is a TRAILING_SPACE_BEFORE_BR iff:

             - There is no uncollapsed character after it preceding a <br> element

             An element has inner text iff

             - It is not hidden
             - It contains an uncollapsed character

             All trailing spaces (pre-line, before <br>, end of block) require definite non-empty characters to render. 
             */

            while (pos !== endPos) {
                pos.prepopulateChar();
                if (pos.isDefinitelyNonEmpty()) {
                    return true;
                }
            }

            return false;
        }, "node"),

        getTrailingSpace: createCachingGetter(nodeProto, "trailingSpace", function(el) {
            if (el.tagName.toLowerCase() == "br") {
                return "";
            } else {
                switch (this.getComputedDisplay()) {
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
                        return this.hasInnerText(true) ? "\n" : "";
                }
            }
            return "";
        }, "node"),

        getLeadingSpace: createCachingGetter(nodeProto, "leadingSpace", function(el) {
            switch (this.getComputedDisplay()) {
                case "inline":
                case "inline-block":
                case "inline-table":
                case "none":
                case "table-column":
                case "table-column-group":
                case "table-cell":
                    break;
                default:
                    return this.hasInnerText(false) ? "\n" : "";
            }
            return "";
        }, "node")
    });

    /*----------------------------------------------------------------------------------------------------------------*/


    function Position(nodeWrapper, offset) {
        this.offset = offset;
        this.nodeWrapper = nodeWrapper;
        this.node = nodeWrapper.node;
        this.transaction = nodeWrapper.transaction;
        this.cache = new Cache();
    }
    
    function inspectPosition() {
        return "[" + dom.inspectNode(this.node) + ":" + this.offset + "]";
    }

    var positionProto = {
        character: "",
        characterType: EMPTY,
        isBr: false,

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
                pos.isCharFinalized = finalizedChar;
            }
        },
        
        isDefinitelyNonEmpty: function() {
            var charType = this.characterType;
            return charType == NON_SPACE || charType == UNCOLLAPSIBLE_SPACE; 
        },
        
        // Resolve leading and trailing spaces, which may involve prepopulating other positions
        resolveLeadingAndTrailingSpaces: function() {
            if (!this.prepopulatedChar) {
                this.prepopulateChar();
            }
            if (this.checkForTrailingSpace) {
                var trailingSpace = this.nodeWrapper.getTrailingSpace();
                if (trailingSpace) {
                    this.isTrailingSpace = true;
                    this.character = trailingSpace;
                    this.characterType = COLLAPSIBLE_SPACE;
                }
                this.checkForTrailingSpace = false;
            }
            if (this.checkForLeadingSpace) {
                var leadingSpace = this.nodeWrapper.getLeadingSpace();
                if (leadingSpace) {
                    this.isLeadingSpace = true;
                    this.character = leadingSpace;
                    this.characterType = COLLAPSIBLE_SPACE;
                }
                this.checkForLeadingSpace = false;
            }
        },

        getCharacter: function(characterOptions) {
            var character = "";
            this.resolveLeadingAndTrailingSpaces();
            
            if (this.isCharFinalized) {
                character = this.character;
            } else {
                var previousPos = this.previousVisible(), nextPos;
                if (previousPos) {
                    previousPos.resolveLeadingAndTrailingSpaces();
                }
                
                // Disallow a collapsible space that follows a trailing space or line break, or is the first character
                if (this.character === " " && this.collapsible &&
                        (!previousPos || previousPos.isTrailingSpace || previousPos.character == "\n")) {
                    log.info("Preceding character is a trailing space or non-existent or follows a line break and current possible character is a collapsible space, so space is collapsed");
                }

                // Disallow a collapsible space that is followed by a line break or is the last character
                else if (this.collapsible) {
                    nextPos = this.nextUncollapsed();
                    if (nextPos) {
                        if (nextPos.character === "\n") {
                            if (this.type == TRAILING_SPACE_BEFORE_BR && nextPos.isBr && !characterOptions.includeSpaceBeforeBr) {
                                log.debug("Character is a space which is followed by a br. Policy from options is to collapse.");
                            } else if (this.type == TRAILING_SPACE_IN_BLOCK && nextPos.isTrailingSpace && !characterOptions.includeBlockContentTrailingSpace) {
                                log.debug("Character is a space which is the final character in a block. Policy from options is to collapse.");
                            } else if (this.type == PRE_LINE_TRAILING_SPACE_BEFORE_LINE_BREAK && nextPos.type == NON_SPACE && !characterOptions.includePreLineTrailingSpace) {
                                log.debug("Character is a space which is followed by a line break in a pre-line element. Policy from options is to collapse.");
                            } else {
                                log.debug("Collapsible line break is being included.");
                                character = "\n";
                            }
                        }
                    } else {
                        log.debug("Character is a space which is followed by nothing, so collapsing");
                    }
                }

                // Collapse a br element that is followed by a trailing space
                else if (this.character === "\n" && !this.collapsible &&
                        (!(nextPos = this.nextUncollapsed()) || nextPos.isTrailingSpace)) {
                    log.debug("Character is a br which is followed by a trailing space or nothing. This is always collapsed.");
                }
            }
            
            return character;
        },
        
        inspect: inspectPosition,
        
        toString: inspectPosition
    };
    
    Position.prototype = positionProto;
    
    extend(positionProto, {
        next: createCachingGetter(positionProto, "nextPos", function(pos) {
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
        }),

        previous: createCachingGetter(positionProto, "previous", function(pos) {
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
        }),

        /*
         Next and previous position moving functions that filter out

         - Hidden (CSS visibility/display) elements
         - Script and style elements
         - collapsed whitespace characters??? NO.
         */
        nextVisible: createCachingGetter(positionProto, "nextVisible", function(pos) {
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
        }),

        nextUncollapsed: createCachingGetter(positionProto, "nextUncollapsed", function(pos) {
            var nextPos = pos;
            while ( (nextPos = nextPos.nextVisible()) ) {
                nextPos.resolveLeadingAndTrailingSpaces();
                if (nextPos.character !== "") {
                    return nextPos;
                }
            }
            return null;
        }),

        previousVisible: createCachingGetter(positionProto, "previousVisible", function(pos) {
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
        })
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

    function createCharacterIterator(startPos, backward, endPos, characterOptions) {
        log.info("createCharacterIterator called backwards " + backward + " and with endPos " + (endPos ? endPos.inspect() : ""));

        // Adjust the end position to ensure that it is actually reached
        if (endPos) {
            if (backward) {
                if (isCollapsedNode(endPos.node)) {
                    endPos = startPos.previousVisible();
                }
            } else {
                if (isCollapsedNode(endPos.node)) {
                    endPos = endPos.nextVisible();
                }
            }
        }
        log.info("endPos now " + (endPos ? endPos.inspect() : ""));

        var pos = startPos, finished = false;

        function next() {
            if (!finished) {
                if (!backward) {
                    pos = pos.nextVisible();
                }
                if (pos) {
                    //log.debug("pos is " + pos.inspect() + ", endPos is " + (endPos ? endPos.inspect() : null) + ", equal is " + pos.equals(endPos));
                    if (endPos && pos.equals(endPos)) {
                        finished = true;
                    }
                } else {
                    finished = true;
                }
                if (backward) {
                    pos = pos.previousVisible();
                }
            }
            return pos;
        }

        var previousTextPos, returnPreviousTextPos = false;

        return {
            next: function() {
                if (returnPreviousTextPos) {
                    returnPreviousTextPos = false;
                    return previousTextPos;
                } else {
                    var pos, character;
                    while ( (pos = next()) ) {
                        character = pos.getCharacter(characterOptions);
                        if (character) {
                            previousTextPos = pos;
                            return pos;
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

    var arrayIndexOf = Array.prototype.indexOf ?
        function(arr, val) {
            return arr.indexOf(val);
        } :
        function(arr, val) {
            for (var i = 0, len = arr.length; i < len; ++i) {
                if (arr[i] === val) {
                    return i;
                }
            }
            return -1;
        };

    // Provides a pair of iterators over text positions, tokenized. Transparently requests more text when next()
    // is called and there is no more tokenized text
    function createTokenizedTextProvider(pos, characterOptions, wordOptions) {
        var forwardIterator = createCharacterIterator(pos, false, null, characterOptions);
        var backwardIterator = createCharacterIterator(pos, true, null, characterOptions);
        var tokenizer = wordOptions.tokenizer;

        // Consumes a word and the whitespace beyond it
        function consumeWord(forward) {
            log.debug("consumeWord called, forward is " + forward);
            var textPos, textChar;
            var newChars = [], it = forward ? forwardIterator : backwardIterator;

            var passedWordBoundary = false, insideWord = false;

            while ( (textPos = it.next()) ) {
                textChar = textPos.character;

                if (allWhiteSpaceRegex.test(textChar)) {
                    if (insideWord) {
                        insideWord = false;
                        passedWordBoundary = true;
                    }
                } else {
                    if (passedWordBoundary) {
                        it.rewind();
                        break;
                    } else {
                        insideWord = true;
                    }
                }
                newChars.push(textPos);
            }

            log.debug("consumeWord got new chars " + newChars.join(""));
            return newChars;
        }

        // Get initial word surrounding initial position and tokenize it
        var forwardChars = consumeWord(true);
        var backwardChars = consumeWord(false).reverse();
        var tokens = tokenizer(backwardChars.concat(forwardChars), wordOptions);

        // Create initial token buffers
        var forwardTokensBuffer = forwardChars.length ?
            tokens.slice(arrayIndexOf(tokens, forwardChars[0].token)) : [];

        var backwardTokensBuffer = backwardChars.length ?
            tokens.slice(0, arrayIndexOf(tokens, backwardChars.pop().token) + 1) : [];

        function inspectBuffer(buffer) {
            var textPositions = ["[" + buffer.length + "]"];
            for (var i = 0; i < buffer.length; ++i) {
                textPositions.push("(word: " + buffer[i] + ", is word: " + buffer[i].isWord + ")");
            }
            return textPositions;
        }

        log.info("Initial word: ", inspectBuffer(forwardTokensBuffer) + "", " and ", inspectBuffer(backwardTokensBuffer) + "", forwardChars, backwardChars);

        return {
            nextEndToken: function() {
                var lastToken, forwardChars;

                // If we're down to the last token, consume character chunks until we have a word or run out of
                // characters to consume
                while ( forwardTokensBuffer.length == 1 &&
                    !(lastToken = forwardTokensBuffer[0]).isWord &&
                    (forwardChars = consumeWord(true)).length > 0) {

                    // Merge trailing non-word into next word and tokenize
                    forwardTokensBuffer = tokenizer(lastToken.chars.concat(forwardChars), wordOptions);
                }

                return forwardTokensBuffer.shift();
            },

            previousStartToken: function() {
                var lastToken, backwardChars;

                // If we're down to the last token, consume character chunks until we have a word or run out of
                // characters to consume
                while ( backwardTokensBuffer.length == 1 &&
                    !(lastToken = backwardTokensBuffer[0]).isWord &&
                    (backwardChars = consumeWord(false)).length > 0) {

                    // Merge leading non-word into next word and tokenize
                    backwardTokensBuffer = tokenizer(backwardChars.reverse().concat(lastToken.chars), options);
                }

                return backwardTokensBuffer.pop();
            },

            dispose: function() {
                forwardIterator.dispose();
                backwardIterator.dispose();
                forwardTokensBuffer = backwardTokensBuffer = null;
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
                newPos = newPos.previousVisible();
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
                    newPos = nextTextPos.previousVisible();
                    log.info("movePositionBy adjusted leading space position to " + newPos);
                }
            }
        }

        return {
            position: newPos,
            unitsMoved: unitsMoved
        };
    }

    function getRangeStartPosition(range, transaction) {
        return transaction.getPosition(range.startContainer, range.startOffset);
    }

    function getRangeEndPosition(range, transaction) {
        return transaction.getPosition(range.endContainer, range.endOffset);
    }

    function createRangeCharacterIterator(range, transaction, characterOptions, backward) {
        var rangeStart = getRangeStartPosition(range, transaction);
        var rangeEnd = getRangeEndPosition(range, transaction);
        var itStart = backward ? rangeEnd : rangeStart;
        var itEnd = backward ? rangeStart : rangeEnd;

        return createCharacterIterator(itStart, !!backward, itEnd, characterOptions);
    }

    function getRangeCharacters(range, transaction, characterOptions) {
        log.info("getRangeCharacters called on range " + range.inspect());

        var chars = [], it = createRangeCharacterIterator(range, transaction, characterOptions), textPos;
        while ( (textPos = it.next()) ) {
            log.info("*** GOT CHAR " + textPos.character + "[" + textPos.character.charCodeAt(0) + "]");
            chars.push(textPos);
        }

        it.dispose();
        return chars;
    }


    api.textRange = {
        isBlockNode: isBlockNode,
        isCollapsedWhitespaceNode: isCollapsedWhitespaceNode,
        createPosition: function(node, offset) {
            return new Transaction().getPosition(node, offset);
        }
    };
});