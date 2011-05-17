/**
 * @license Selection save and restore module for Rangy.
 * ApplyClass command
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
rangy.createModule("ApplyClassCommand", function(api, module) {
    api.requireModules( ["Commands"] );

    var dom = api.dom, commandUtil = api.Command.util;
    var log = log4javascript.getLogger("rangy.ApplyClassCommand");

    var defaultTagNames = ["span"];

    function hasClass(el, cssClass) {
        return el.className && new RegExp("(?:^|\\s)" + cssClass + "(?:\\s|$)").test(el.className);
    }

    function addClass(el, cssClass) {
        if (el.className) {
            if (!hasClass(el, cssClass)) {
                el.className += " " + cssClass;
            }
        } else {
            el.className = cssClass;
        }
    }

    var removeClass = (function() {
        function replacer(matched, whitespaceBefore, whitespaceAfter) {
            return (whitespaceBefore && whitespaceAfter) ? " " : "";
        }

        return function(el, cssClass) {
            if (el.className) {
                el.className = el.className.replace(new RegExp("(?:^|\\s)" + cssClass + "(?:\\s|$)"), replacer);
            }
        };
    })();

    function sortClassName(className) {
        return className.split(/\s+/).sort().join(" ");
    }

    function getSortedClassName(el) {
        return sortClassName(el.className);
    }

    function haveSameClasses(el1, el2) {
        return getSortedClassName(el1) == getSortedClassName(el2);
    }

    function ApplyClassCommand() {
    }

    api.Command.create(ApplyClassCommand, {
        getEffectiveValue: function(element, options) {
            return hasClass(element, options.cssClass);
        },


        getSpecifiedValue: function(element) {
            return element.style.fontWeight || (/^(strong|b)$/i.test(element.tagName) ? "bold" : null);
        },


        valuesEqual: function(val1, val2) {
            val1 = ("" + val1).toLowerCase();
            val2 = ("" + val2).toLowerCase();
            return val1 == val2
                || (val1 == "bold" && val2 == "700")
                || (val2 == "bold" && val1 == "700")
                || (val1 == "normal" && val2 == "400")
                || (val2 == "normal" && val1 == "400");
        },

        createNonCssElement: function(node, value) {
            return (value == "bold" || value == "700") ? dom.getDocument(node).createElement("b") : null;
        },

        getRangeValue: function(range, options) {
            var tagNames = options.tagNames || defaultTagNames;
            var textNodes = commandUtil.getEffectiveTextNodes(range), i = textNodes.length, value;
            log.info("getRangeValue on " + range.inspect() + ", text nodes: " + textNodes);
            while (i--) {
                value = commandUtil.getEffectiveValue(textNodes[i], this);
                if (!/^(bold|700|800|900)$/.test(value)) {
                    return false;
                }
            }
            return textNodes.length > 0;
        },

        getSelectionValue: function(sel) {
            var selRanges = sel.getAllRanges();
            for (var i = 0, len = selRanges.length; i < len; ++i) {
                if (!this.getRangeValue(selRanges[i])) {
                    return false;
                }
            }
            return len > 0;
        },

        getNewSelectionValue: function(sel, value, options) {
            return this.getSelectionValue() ? "normal" : "bold";
        },

        applyValueToRange: function(range, newValue, rangesToPreserve, options) {
            var decomposed = range.decompose();

            for (var i = 0, len = decomposed.length; i < len; ++i) {
                commandUtil.setNodeValue(decomposed[i], this, newValue, rangesToPreserve, options);
            }
        },

        applyToSelection: function(doc, options) {
            doc = doc || document;
            options = options || {};

            var win = dom.getWindow(doc);
            var sel = api.getSelection(win);
            var selRanges = sel.getAllRanges();
            var newValue = this.getSelectionValue(sel) ? "normal" : "bold"

            for (var i = 0, len = selRanges.length; i < len; ++i) {
                this.applyValueToRange(selRanges[i], newValue, selRanges, options);
            }

            sel.setRanges(selRanges);
            log.info(sel.inspect(), selRanges);
        }



    });

    api.registerCommand("applyclass", new ApplyClassCommand());

});
