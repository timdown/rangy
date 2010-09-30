rangy.addInitListener(function(api) {
    var log = log4javascript.getLogger("rangy.textInputs");
    var getSelectionBoundary, getSelection, setSelection, deleteSelectedText, deleteText, insertText, pasteText;

    function fail(reason) {
        alert("TextInputs module for Rangy not supported in your browser. Reason: " + reason);
    }

    function adjustOffsets(el, start, end) {
        if (start < 0) {
            start += el.value.length;
        }
        if (typeof end == "undefined") {
            end = start;
        }
        if (end < 0) {
            end += el.value.length;
        }
        return { start: start, end: end };
    }

    var testTextArea = document.createElement("textarea");
    document.body.appendChild(testTextArea);

    if (api.util.areHostProperties(testTextArea, ["selectionStart", "selectionEnd"])) {
        getSelection = function(el) {
            return {
                start: el.selectionStart,
                end: el.selectionEnd
            };
        };

        setSelection = function(el, startOffset, endOffset) {
            var offsets = adjustOffsets(el, startOffset, endOffset);
            el.selectionStart = offsets.start;
            el.selectionEnd = offsets.end;
        };
    } else if (api.features.rangesAreTextRanges && api.util.isHostMethod(testTextArea, "createTextRange")) {
        getSelectionBoundary = function(el, isStart) {
            el.focus();
            var win = api.dom.getWindow(el);
            var range = api.getFirstSelectionRange(api.getSelection(win));
            var originalValue, textInputRange, precedingRange, pos, bookmark;

            if (range) {
                // Collapse the selected range if the selection is not a caret
                if (!api.rangeIsCollapsed(range)) {
                    range.collapse(!!isStart);
                }

                originalValue = el.value;
                textInputRange = el.createTextRange();
                precedingRange = el.createTextRange();
                pos = 0;

                bookmark = range.getBookmark();
                textInputRange.moveToBookmark(bookmark);

                if (originalValue.indexOf("\r\n") > -1) {
                    // Trickier case where input value contains line breaks

                    // Test whether the selection range is at the end of the text input by moving it on by one character
                    // and checking if it's still within the text input.
                    range.moveToBookmark(bookmark);

                    // Insert a character in the text input range and use that as a marker
                    textInputRange.text = " ";
                    precedingRange.setEndPoint("EndToStart", textInputRange);
                    pos = precedingRange.text.length - 1;

                    // Executing an undo command to delete the character inserted prevents this method adding to the
                    // undo stack. This trick came from a user called Trenda on MSDN:
                    // http://msdn.microsoft.com/en-us/library/ms534676%28VS.85%29.aspx
                    document.execCommand("undo");
                } else {
                    // Easier case where input value contains no line breaks
                    precedingRange.setEndPoint("EndToStart", textInputRange);
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

        // Moving across a line break only counts as moving one character in a TextRange, whereas a line break in the
        // textarea value is two characters. This function corrects for that by converting a text offset into a range
        // character offset by subtracting one character for every line break in the textarea prior to the offset
        var offsetToRangeCharacterMove = function(el, offset) {
            return offset - (el.value.slice(0, offset).split("\r\n").length - 1);
        };

        setSelection = function(el, startOffset, endOffset) {
            var offsets = adjustOffsets(el, startOffset, endOffset);
            var range = el.createTextRange();
            var startCharMove = offsetToRangeCharacterMove(el, offsets.start);
            range.collapse(true);
            if (offsets.start == offsets.end) {
                range.move("character", startCharMove);
            } else {
                range.moveEnd("character", offsetToRangeCharacterMove(el, offsets.end));
                range.moveStart("character", startCharMove);
            }
            range.select();
        };
    } else {
        fail("No means of finding text input caret position");
    }

    // Clean up
    document.body.removeChild(testTextArea);

    deleteSelectedText = function(el) {
        var sel = getSelection(el), val;
        if (sel.start != sel.end) {
            val = el.value;
            el.value = val.slice(0, sel.start) + val.slice(sel.end);
            setSelection(el, sel.start, sel.start);
        }
    };

    deleteText = function(el, start, end, moveSelection) {
        var val;
        if (start != end) {
            val = el.value;
            el.value = val.slice(0, start) + val.slice(end);
        }
        if (moveSelection) {
            setSelection(el, start, start);
        }
    };

    insertText = function(el, text, index, moveSelection) {
        var val = el.value, caretIndex;
        el.value = val.slice(0, index) + text + val.slice(index);
        if (moveSelection) {
            caretIndex = index + text.length;
            setSelection(el, caretIndex, caretIndex);
        }
    };

    pasteText = function(el, text) {
        var sel = getSelection(el), val = el.value;
        el.value = val.slice(0, sel.start) + text + val.slice(sel.end);
        var caretIndex = sel.start + text.length;
        setSelection(el, caretIndex, caretIndex);
    };

    api.textInputs = {
        getSelection: getSelection,
        setSelection: setSelection,
        deleteSelectedText: deleteSelectedText,
        deleteText: deleteText,
        insertText: insertText,
        pasteText: pasteText
    };
});