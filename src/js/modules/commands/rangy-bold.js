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

    var dom = api.dom;

    function BoldCommand() {

    }

    api.Command.create(BoldCommand, {
        relevantCssProperty: "fontWeight",

        getSpecifiedValue: function(element) {
            return element.style.fontWeight || (/^(strong|b)$/i.test(element.tagName) ? "bold" : null);
        },

        valuesEqual: function(val1, val2) {
            val1 = val1.toLowerCase();
            val2 = val2.toLowerCase();
            return val1 == val2
                || (val1 == "bold" && val2 == "700")
                || (val2 == "bold" && val1 == "700")
                || (val1 == "normal" && val2 == "400")
                || (val2 == "normal" && val1 == "400");
        },

        createNonCssElement: function(node, value) {
            return (value == "bold" || value == "700") ? dom.getDocument(node).createElement("b") : null;
        }


    });

    var boldCommand = null;

});
