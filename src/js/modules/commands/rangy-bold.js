/**
 * @license Selection save and restore module for Rangy.
 * Bold command
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
rangy.createModule("BoldCommand", function(api, module) {
    api.requireModules( ["Commands"] );

    var dom = api.dom, commandUtil = api.Command.util;
    var log = log4javascript.getLogger("rangy.BoldCommand");

    function BoldCommand() {

    }

    api.Command.create(BoldCommand, {
        relevantCssProperty: "fontWeight",

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

        getRangeValue: function(range) {
            var textNodes = commandUtil.getEffectiveTextNodes(range), i = textNodes.length, value;
            log.info("getRangeValue on " + range.inspect() + ", text nodes: " + textNodes);
            while (i--) {
                value = commandUtil.getEffectiveValue(textNodes[i], this);
                log.info("getRangeValue value " + value);
                if (!/^(bold|700|800|900)$/.test(value)) {
                    log.info("getRangeValue returning false")
                    return false;
                }
            }
            log.info("getRangeValue returning true")
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

        getNewSelectionValue: function(sel) {
            return this.getSelectionValue(sel) ? "normal" : "bold";
        },

        applyValueToRange: function(range, context) {
            var decomposed = range.decompose();

            for (var i = 0, len = decomposed.length; i < len; ++i) {
                commandUtil.setNodeValue(decomposed[i], context);
            }
        }
/*

        applyToSelection: function(doc, options) {
            doc = doc || document;

            var win = dom.getWindow(doc);
            var sel = api.getSelection(win);
            var selRanges = sel.getAllRanges();
            var newValue = this.getSelectionValue(sel) ? "normal" : "bold";

            var context = this.createContext(newValue, selRanges, options);


            for (var i = 0, len = selRanges.length; i < len; ++i) {
                this.applyValueToRange(selRanges[i], context);
            }

            sel.setRanges(selRanges);
            log.info(sel.inspect(), selRanges);
        }
*/


    });

    api.registerCommand("bold", new BoldCommand());

});
