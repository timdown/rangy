rangy.addInitListener(function(api) {
    var log = log4javascript.getLogger("rangy.textInputs");
    var getSelectionBoundary, getSelection, setSelection, deleteSelectedText;

    function fail(reason) {
        alert("TextInputs module for Rangy not supported in your browser. Reason: " + reason);
    }

    var testTextArea = document.createElement("textarea");
    document.body.appendChild(testTextArea);


    if (api.areHostProperties(testTextArea, ["selectionStart", "selectionEnd"])) {
        getSelection = function(el) {
            return {
                start: el.selectionStart,
                end: el.selectionEnd
            };
        };

        setSelection = function(el, startOffset, endOffset) {
            el.selectionStart = startOffset;
            el.selectionEnd = endOffset;
        };
    } else if (api.rangesAreTextRanges && api.isHostMethod(testTextArea, "createTextRange")) {
        getSelectionBoundary = function(el, isStart) {
            el.focus();
            var win = api.getWindow(el), doc = api.getDocument(el);
            var range = api.getFirstSelectionRange(api.getSelection(win));
            var originalValue, textAreaRange, precedingRange, textNode, nextNode, pos, bookmark;

            if (range) {
                // Collapse the selected range if the selection is not a caret
                if (!api.rangeIsCollapsed(range)) {
                    range.collapse(!!isStart);
                }

                originalValue = el.value;
                textAreaRange = el.createTextRange();
                precedingRange = el.createTextRange();
                pos = 0;

                bookmark = range.getBookmark();
                textAreaRange.moveToBookmark(bookmark);

                if (/[\r\n]/.test(originalValue)) {
                    // Trickier case where input value contains line breaks

                    // Insert a text node immediately after the textarea in case the
                    // caret is at the end (in which case setting the TextRange's
                    // text will add content after the textarea)
                    textNode = doc.createTextNode(" ");
                    nextNode = el.nextSibling;
                    if (nextNode) {
                        el.parentNode.insertBefore(textNode, nextNode);
                    } else {
                        el.parentNode.appendChild(textNode);
                    }

                    textAreaRange.text = " ";

                    if (el.value == originalValue) {
                        pos = originalValue.length;
                    } else {
                        precedingRange.setEndPoint("EndToStart", textAreaRange);
                        pos = precedingRange.text.length - 1;

                        // Delete the inserted character
                        textAreaRange.moveStart("character", -1);
                        textAreaRange.text = "";
                    }

                    // Remove the inserted text node
                    textNode.parentNode.removeChild(textNode);
                } else {
                    // Easier case where input value contains no line breaks
                    precedingRange.setEndPoint("EndToStart", textAreaRange);
                    pos = precedingRange.text.length;
                }
                return pos;
            }
            return 0;
        };

        getSelection = function(el) {
            return {
                start: getSelectionBoundary(el, true),
                end: getSelectionBoundary(el, false)
            };
        };

        setSelection = function(el, startOffset, endOffset) {
            // TODO: Fix this
            var range = el.createTextRange();
            range.collapse(true);
            range.moveEnd("character", endOffset);
            range.moveStart("character", startOffset);
            range.select();
        };

        deleteSelectedText = function(el) {
            el.focus();
            var win = api.getWindow(el);
            var range = api.getFirstSelectionRange(api.getSelection(win));
            var textAreaRange = el.createTextRange();
            textAreaRange.moveToBookmark(range.getBookmark());
            textAreaRange.text = "";
        };
    } else {
        fail("No means of finding text input caret position");
    }


    deleteSelectedText = function(el) {
        var sel = getSelection(el), val = el.value;
        el.value = val.slice(0, sel.start) + val.slice(sel.end);
        setSelection(el, sel.start, sel.start);
        el.focus();
    };


    api.textInputs = {
        getSelection: getSelection,
        setSelection: setSelection,
        deleteSelectedText: deleteSelectedText,

        insertText: function(el, index) {

        }
    };

    document.body.removeChild(testTextArea);

});