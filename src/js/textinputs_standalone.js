/**
 * @license Rangy Text Inputs, a cross-browser textarea and text input library
 * Part of Rangy, a cross-browser JavaScript range and selection library
 * http://code.google.com/p/rangy/
 *
 * Copyright 2010, Tim Down
 * Licensed under the MIT license.
 * Version: %%build:version%%
 * Build date: %%build:date%%
 */
var rangy;
(function() {
    var UNDEF = "undefined";
    var getSelectionBoundary, getSelection, setSelection, deleteSelectedText, deleteText, insertText;
    var replaceSelectedText, surroundSelectedText, extractSelectedText, collapseSelection;
    var initialized = false;

    // Trio of isHost* functions taken from Peter Michaux's article:
    // http://peter.michaux.ca/articles/feature-detection-state-of-the-art-browser-scripting
    function isHostMethod(object, property) {
        var t = typeof object[property];
        return t === "function" || (!!(t == "object" && object[property])) || t == "unknown";
    }

    function isHostProperty(object, property) {
        return typeof(object[property]) != UNDEF;
    }

    function isHostObject(object, property) {
        return !!(typeof(object[property]) == "object" && object[property]);
    }

    function fail(reason) {
        if (window.console && window.console.log) {
            window.console.log("Rangy Text Inputs not supported in your browser. Reason: " + reason);
        }
    }

    function adjustOffsets(el, start, end) {
        if (start < 0) {
            start += el.value.length;
        }
        if (typeof end == UNDEF) {
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
        };
    }

    function init() {
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

            collapseSelection = function(el, toStart) {
                if (toStart) {
                    el.selectionEnd = el.selectionStart;
                } else {
                    el.selectionStart = el.selectionEnd;
                }
            };
        } else if (isHostMethod(testTextArea, "createTextRange") && isHostObject(document, "selection") &&
                   isHostMethod(document.selection, "createRange")) {
            getSelectionBoundary = function(el, isStart) {
                el.focus();
                var range = document.selection.createRange();
                var originalValue, textInputRange, precedingRange, pos, bookmark;

                if (range) {
                    range.collapse(!!isStart);

                    originalValue = el.value;
                    textInputRange = el.createTextRange();
                    precedingRange = textInputRange.duplicate();
                    pos = 0;

                    if (originalValue.indexOf("\r\n") > -1) {
                        // Trickier case where input value contains line breaks

                        // Insert a character in the text input range and use that as a marker
                        range.text = " ";
                        bookmark = range.getBookmark();
                        textInputRange.moveToBookmark(bookmark);
                        precedingRange.setEndPoint("EndToStart", textInputRange);
                        pos = precedingRange.text.length - 1;

                        // Executing an undo command to delete the character inserted prevents this method adding to the
                        // undo stack. This trick came from a user called Trenda on MSDN:
                        // http://msdn.microsoft.com/en-us/library/ms534676%28VS.85%29.aspx
                        document.execCommand("undo");
                    } else {
                        // Easier case where input value contains no line breaks
                        bookmark = range.getBookmark();
                        textInputRange.moveToBookmark(bookmark);
                        precedingRange.setEndPoint("EndToStart", textInputRange);
                        pos = precedingRange.text.length;
                    }
                    return pos;
                }
                return 0;
            };

            getSelection = function(el) {
                //var end = getSelectionBoundary(el, false), start = getSelectionBoundary(el, true);
                var start = 0, end = 0;
                var range = document.selection.createRange();
                var originalValue, normalizedValue, normalizedValueLength, textInputRange, precedingRange, pos, bookmark;
                var collapsed;

                if (range) {
                    collapsed = !range.text.length;
                    originalValue = el.value;
                    textInputRange = el.createTextRange();
                    precedingRange = textInputRange.duplicate();

                    bookmark = range.getBookmark();
                    textInputRange.moveToBookmark(bookmark);

                    if (originalValue.indexOf("\r\n") > -1) {
                        normalizedValue = originalValue.replace(/\r\n/g, "\r");
                        normalizedValueLength = normalizedValue.length;

                        // Trickier case where input value contains line breaks
                        end = normalizedValueLength - textInputRange.moveEnd("character", originalValue.length);
                        if (collapsed) {
                            start = end;
                        } else {
                            start = normalizedValueLength - textInputRange.moveStart("character", originalValue.length);
                        }

                        alert(start + ", " + end);


/*
                        // Insert a character in the text input range and use that as a marker
                        range.text = " ";
                        precedingRange.setEndPoint("EndToStart", textInputRange);
                        pos = precedingRange.text.length - 1;

                        // Executing an undo command to delete the character inserted prevents this method adding to the
                        // undo stack. This trick came from a user called Trenda on MSDN:
                        // http://msdn.microsoft.com/en-us/library/ms534676%28VS.85%29.aspx
                        document.execCommand("undo");
*/
                    } else {
                        // Easier case where input value contains no line breaks
                        precedingRange.setEndPoint("EndToStart", textInputRange);
                        start = precedingRange.text.length;
                        if (collapsed) {
                            end = start;
                        } else {
                            precedingRange.setEndPoint("EndToEnd", textInputRange);
                            end = precedingRange.text.length;
                        }
                    }
                }
                //return 0;
                return makeSelection(el, start, end);
            };

            // Moving across a line break only counts as moving one character in a TextRange, whereas a line break in
            // the textarea value is two characters. This function corrects for that by converting a text offset into a
            // range character offset by subtracting one character for every line break in the textarea prior to the
            // offset
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

            collapseSelection = function(el, toStart) {
                var range = document.selection.createRange();
                range.collapse(toStart);
                range.select();
            };
        } else {
            document.body.removeChild(testTextArea);
            fail("No means of finding text input caret position");
            return;
        }

        // Clean up
        document.body.removeChild(testTextArea);

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

        deleteSelectedText = function(el) {
            var sel = getSelection(el);
            deleteText(el, sel.start, sel.end, true);
        };

        extractSelectedText = function(el) {
            var sel = getSelection(el), val;
            if (sel.start != sel.end) {
                val = el.value;
                el.value = val.slice(0, sel.start) + val.slice(sel.end);
            }
            setSelection(el, sel.start, sel.start);
            return sel.text;
        };

        insertText = function(el, text, index, moveSelection) {
            var val = el.value, caretIndex;
            el.value = val.slice(0, index) + text + val.slice(index);
            if (moveSelection) {
                caretIndex = index + text.length;
                setSelection(el, caretIndex, caretIndex);
            }
        };

        replaceSelectedText = function(el, text) {
            var sel = getSelection(el), val = el.value;
            el.value = val.slice(0, sel.start) + text + val.slice(sel.end);
            var caretIndex = sel.start + text.length;
            setSelection(el, caretIndex, caretIndex);
        };

        surroundSelectedText = function(el, before, after) {
            var sel = getSelection(el), val = el.value;
            log.info(sel.start + ", " + sel.end + ", '" + sel.text + "'");
            el.value = val.slice(0, sel.start) + before + sel.text + after + val.slice(sel.end);
            var startIndex = sel.start + before.length;
            var endIndex = startIndex + sel.length;
            setSelection(el, startIndex, endIndex);
        };

        rangy = {
            getSelection: getSelection,
            setSelection: setSelection,
            collapseSelection: collapseSelection,
            deleteSelectedText: deleteSelectedText,
            deleteText: deleteText,
            extractSelectedText: extractSelectedText,
            insertText: insertText,
            replaceSelectedText: replaceSelectedText,
            surroundSelectedText: surroundSelectedText
        };

        initialized = true;
    }

    // Wait for document to load before creating API

    var docReady = false;

    var loadHandler = function(e) {
        log.info("loadHandler, event is " + e.type);
        if (!docReady) {
            docReady = true;
            if (!initialized) {
                init();
            }
        }
    };

    // Test whether we have window and document objects that we will need
    if (typeof window == UNDEF) {
        fail("No window found");
        return;
    }
    if (typeof document == UNDEF) {
        fail("No document found");
        return;
    }

    if (isHostMethod(document, "addEventListener")) {
        document.addEventListener("DOMContentLoaded", loadHandler, false);
    }

    // Add a fallback in case the DOMContentLoaded event isn't supported
    if (isHostMethod(window, "addEventListener")) {
        window.addEventListener("load", loadHandler, false);
    } else if (isHostMethod(window, "attachEvent")) {
        window.attachEvent("onload", loadHandler);
    } else {
        fail("Window does not have required addEventListener or attachEvent method");
    }

})();