(function() {
    var log = log4javascript.getLogger("rangy.textInputs");
    var getSelectionBoundary, getSelection, setSelection, deleteSelectedText, deleteText, insertText, pasteText;

    // Trio of isHost* functions taken from Peter Michaux's article:
    // http://peter.michaux.ca/articles/feature-detection-state-of-the-art-browser-scripting
    function isHostMethod(object, property) {
        var t = typeof object[property];
        return t === "function" || (!!(t == "object" && object[property])) || t == "unknown";
    }

    function isHostProperty(object, property) {
        return typeof(object[property]) != "undefined";
    }

    function isHostObject(object, property) {
        return !!(typeof(object[property]) == "object" && object[property]);
    }

    function fail(reason) {
        if (window.console && window.console.log) {
            window.console.log("TextInputs module for Rangy not supported in your browser. Reason: " + reason);
        }
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

    function makeSelection(el, start, end) {
        return {
            start: start,
            end: end,
            length: end - start,
            text: el.value.slice(start, end)
        }
    }

    jQuery(document).ready(function() {
        var testTextArea = document.createElement("textarea");
        document.body.appendChild(testTextArea);

        if (isHostProperty(testTextArea, "selectionStart") && isHostProperty(testTextArea, "selectionEnd")) {
            getSelection = function(el) {
                var start = el.selectionStart, end = el.selectionEnd;
                return makeSelection(el, start, end);
            };

            setSelection = function(el, startOffset, endOffset) {
                var offsets = adjustOffsets(el, startOffset, endOffset);
                el.selectionStart = offsets.start;
                el.selectionEnd = offsets.end;
            };
        } else if (isHostMethod(testTextArea, "createTextRange") && isHostObject(document, "selection") &&
                   isHostMethod(document.selection, "createRange")) {
            getSelectionBoundary = function(el, isStart) {
                el.focus();
                var range = document.selection.createRange();
                var originalValue, textInputRange, precedingRange, pos, bookmark, isAtEnd;

                if (range) {
                    // Collapse the selected range if the selection is not a caret
                    if (range.text) {
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

                        // Test whether the selection range is at the end of the text input by moving it on by one
                        // character and checking if it's still within the text input.
                        try {
                            range.move("character", 1);
                            isAtEnd = (range.parentElement() != el);
                        } catch (ex) {
                            log.warn("Error moving range", ex);
                            isAtEnd = true;
                        }

                        range.moveToBookmark(bookmark);

                        if (isAtEnd) {
                            pos = originalValue.length;
                        } else {
                            // Insert a character in the text input range and use that as a marker
                            textInputRange.text = " ";
                            precedingRange.setEndPoint("EndToStart", textInputRange);
                            pos = precedingRange.text.length - 1;

                            // Delete the inserted character
                            textInputRange.moveStart("character", -1);
                            textInputRange.text = "";
                        }
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
                var start = getSelectionBoundary(el, true), end = getSelectionBoundary(el, false);
                return makeSelection(el, start, end);
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
            document.body.removeChild(testTextArea);
            fail("No means of finding text input caret position");
            return;
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

        function jQuerify(func) {
            return function() {
                var el = this.jquery ? this[0] : this;
                var nodeName = el.nodeName.toLowerCase();
                if (el.nodeType == 1 && nodeName == "textarea" || (nodeName == "input" && el.type == "text")) {
                    var args = [el].concat(Array.prototype.slice.call(arguments));
                    return func.apply(this, args);
                }
            }
        }

        jQuery.fn.extend({
            getSelection: jQuerify(getSelection),
            setSelection: jQuerify(setSelection),
            deleteSelectedText: jQuerify(deleteSelectedText),
            deleteText: jQuerify(deleteText),
            insertText: jQuerify(insertText),
            pasteText: jQuerify(pasteText)
        });
    });
})();