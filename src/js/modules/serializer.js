/**
 * @license Serializer module for Rangy.
 * Serializes Ranges and Selections. An example use would be to store a user's selection on a particular page in a
 * cookie or local storage and restore it on the user's next visit to the same page.
 *
 * Part of Rangy, a cross-browser JavaScript range and selection library
 * http://code.google.com/p/rangy/
 *
 * Depends on Rangy core.
 *
 * Copyright 2010, Tim Down
 * Licensed under the MIT license.
 * Version: %%build:version%%
 * Build date: %%build:date%%
 */
rangy.createModule("Serializer", function(api, module) {
    api.requireModules( ["WrappedSelection", "WrappedRange"] );

    // encodeURIComponent and decodeURIComponent are required for cookie handling
    if (typeof encodeURIComponent == "undefined" || typeof decodeURIComponent == "undefined") {
        module.fail("Global object is missing encodeURIComponent and/or decodeURIComponent method");
    }

    var dom = api.dom;

    function serializePosition(node, offset) {
        var pathBits = [], n = node;
        var docElement = dom.getDocument(node).documentElement;
        while (n && n != docElement) {
            pathBits.push(dom.getNodeIndex(n, true));
            n = n.parentNode;
        }
        return pathBits.join("/") + ":" + offset;
    }

    function deserializePosition(serialized, doc) {
        doc = doc || document;
        var bits = serialized.split(":");
        var node = doc.documentElement;
        var nodeIndices = bits[0].split("/"), i = nodeIndices.length, nodeIndex;

        while (i--) {
            nodeIndex = parseInt(nodeIndices[i], 10);
            if (nodeIndex < node.childNodes.length) {
                node = node.childNodes[parseInt(nodeIndices[i], 10)];
            } else {
                throw module.createError("deserializePosition failed: node " + dom.inspectNode(node) +
                        " has no child with index " + nodeIndex);
            }
        }

        return new dom.DomPosition(node, parseInt(bits[1], 10));
    }

    function serializeRange(range) {
        return serializePosition(range.startContainer, range.startOffset) + "," +
            serializePosition(range.endContainer, range.endOffset);
    }

    function deserializeRange(serialized, doc) {
        doc = doc || document;
        var bits = serialized.split(",");
        var start = deserializePosition(bits[0], doc), end = deserializePosition(bits[1], doc);
        var range = api.createRange(doc);
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        return range;
    }

    function serializeSelection(selection) {
        selection = selection || rangy.getSelection();
        var ranges = selection.getAllRanges(), serializedRanges = [];
        for (var i = 0, len = ranges.length; i < len; ++i) {
            serializedRanges[i] = serializeRange(ranges[i]);
        }
        return serializedRanges.join("|");
    }

    function deserializeSelection(serialized, win) {
        win = win || window;
        var serializedRanges = serialized.split("|");
        var sel = api.getSelection(win);
        var ranges = [];

        for (var i = 0, len = serializedRanges.length; i < len; ++i) {
            ranges[i] = deserializeRange(serializedRanges[i], win.document);
        }
        sel.setRanges(ranges);

        return sel;
    }

    var cookieName = "rangySerializedSelection";

    function getSerializedSelectionFromCookie(cookie) {
        var parts = cookie.split(/[;,]/);
        for (var i = 0, len = parts.length, nameVal, val; i < len; ++i) {
            nameVal = parts[i].split("=");
            if (nameVal[0].replace(/^\s+/, "") == cookieName) {
                val = nameVal[1];
                if (val) {
                    return decodeURIComponent(val.replace(/\s+$/, ""));
                }
            }
        }
        return null;
    }

    function restoreSelectionFromCookie(win) {
        win = win || window;
        var serialized = getSerializedSelectionFromCookie(win.document.cookie);
        if (serialized) {
            deserializeSelection(serialized, win.doc)
        }
    }

    function saveSelectionCookie(win, props) {
        win = win || window;
        props = (typeof props == "object") ? props : {};
        var expires = props.expires ? ";expires=" + props.expires.toUTCString() : "";
        var path = props.path ? ";path=" + props.path : "";
        var domain = props.domain ? ";domain=" + props.domain : "";
        var secure = props.secure ? ";secure" : "";
        var serialized = serializeSelection(rangy.getSelection(win));
        win.document.cookie = encodeURIComponent(cookieName) + "=" + encodeURIComponent(serialized) + expires + path + domain + secure;
    }

    api.serializePosition = serializePosition;
    api.deserializePosition = deserializePosition;

    api.serializeRange = serializeRange;
    api.deserializeRange = deserializeRange;

    api.serializeSelection = serializeSelection;
    api.deserializeSelection = deserializeSelection;

    api.restoreSelectionFromCookie = restoreSelectionFromCookie;
    api.saveSelectionCookie = saveSelectionCookie;
});
