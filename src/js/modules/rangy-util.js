/**
 * @license Utilities module for Rangy.
 * A collection of common selection and range-related tasks, using Rangy. The intention is that each method is
 * self-contained and could be copied and pasted elsewhere and still work.
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
rangy.createModule("Util", function(api, module) {
    api.requireModules( ["WrappedSelection", "WrappedRange"] );

    var rangeProto = api.rangePrototype;
    var selProto = api.selectionPrototype;

    /**
     * Convenience method to select a range. Any existing selection will be removed.
     */
    rangeProto.select = function() {
        var sel = api.getSelection(this.getDocument());
        sel.setSingleRange(this);
    };

    selProto.pasteText = function(text) {
        this.deleteFromDocument();
        var range = this.getRangeAt(0);
        var textNode = range.getDocument().createTextNode(text);
        range.insertNode(textNode);
        this.setSingleRange(range);
    };

    rangeProto.pasteText = function(text) {
        this.deleteContents();
        var textNode = this.getDocument().createTextNode(text);
        this.insertNode(textNode);
    };

    selProto.pasteHtml = function(html) {
        this.deleteFromDocument();
        var range = this.getRangeAt(0);
        var frag = this.createContextualFragment(html);
        var lastNode = frag.lastChild;
        range.insertNode(frag);
        if (lastNode) {
            range.setStartAfter(lastNode)
        }
        this.setSingleRange(range);
    };

    rangeProto.pasteHtml = function(html) {
        this.deleteContents();
        var frag = this.createContextualFragment(html);
        this.insertNode(frag);
    };

    /**
     * Convenience method to set a range's start and end boundaries. Overloaded as follows:
     * - Two parameters (node, offset) creates a collapsed range at that position
     * - three parameters (node, startOffset, endOffset) creates a range contained with node starting at startOffset
     *   and ending at endOffset
     * - Four parameters (startNode, startOffset, endNode, endOffset) creates a range starting at startOffset in
     *   startNode and ending at endOffset in endNode
     */
    rangeProto.setStartAndEnd = function() {
        var args = arguments;
        switch (args.length) {
            case 2:
                this.setStart(args[0], args[1]);
                this.collapse(true);
                break;
            case 3:
                this.setStart(args[0], args[1]);
                this.setEnd(args[0], args[2]);
                break;
            case 4:
                this.setStart(args[0], args[1]);
                this.setEnd(args[2], args[3]);
                break;
        }
    };

    // TODO: simple selection save/restore
});
