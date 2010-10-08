rangy.createModule("Boldifier", function(api, module) {
    api.requireModules( ["TextMutation"] );

    var util = api.util;

    var isBold;

    if (util.isHostMethod(window, "getComputedStyle")) {
        isBold = function(textNode) {
            return (window.getComputedStyle(textNode.parentNode, null).fontWeight == "bold");
        }
    } else if (document.body.currentStyle) {
        isBold = function(textNode) {
            return textNode.parentNode.currentStyle.fontWeight == "bold";
        }
    }

/*
    function createBoldifier(win) {
        win = win || window;
        var templateElement = win.document.createElement("strong");


        return rangy.createTextMutator({
            templateNode: templateElement,
            isApplied: isBold,
            normalize: true
        }) ;
    }
*/

    function createBoldifier(win) {
        win = win || window;

        return api.createSimpleSurrounder("strong", true);
    }

    api.createBoldifier = createBoldifier;
});

//