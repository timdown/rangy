var hasNativeGetSelection = "getSelection" in window;
var hasNativeDomRange = "createRange" in document;

function createRangySelection(win) {
    return rangy.getSelection(win);
}

function createNativeSelection(win) {
    return win.getSelection();
}

function createRangyRange(doc) {
    return new rangy.DomRange(doc);
}

function createNativeDomRange(doc) {
    return doc.createRange();
}

function createWrappedNativeDomRange(doc) {
    return rangy.createRange(doc);
}

function testExceptionCode(t, func, code) {
    try {
        func();
        t.fail("No error thrown");
    } catch (ex) {
        t.assertEquals(ex.code, code);
    }
}

function getOtherDocument() {
    var iframe = document.getElementById("selectors");
    return iframe.contentDocument || iframe.contentWindow.document;
}

function testSelectionAndRangeCreators(wins, winName, selectionCreator, selectionCreatorName, rangeCreator, rangeCreatorName) {
    xn.test.suite(selectionCreatorName + " in " + winName + " window with range creator " + rangeCreatorName, function(s) {
        var win, doc;
        var DomRange = rangy.DomRange;
        var DOMException = rangy.DOMException;

        s.setUp = function(t) {
            win = wins[0];
            doc = win.document;
            var div = doc.createElement("div");
            var plainText = div.appendChild(doc.createTextNode("plain"));
            var b = div.appendChild(doc.createElement("b"));
            var boldText = b.appendChild(doc.createTextNode("bold"));
            var i = b.appendChild(doc.createElement("i"));
            var boldAndItalicText = i.appendChild(doc.createTextNode("bold and italic"));
            var boldText2 = b.appendChild(doc.createTextNode("more bold"));
            doc.body.appendChild(div);
            var div2 = doc.createElement("div");
            var div2Text = div2.appendChild(doc.createTextNode("Second div"));
            doc.body.appendChild(div2);

            t.nodes = {
                div: div,
                plainText: plainText,
                b: b,
                boldText: boldText,
                i: i,
                boldAndItalicText: boldAndItalicText,
                boldText2: boldText2,
                div2: div2,
                div2Text: div2Text
            };
        };

        s.tearDown = function(t) {
            doc.body.removeChild(t.nodes.div);
            doc.body.removeChild(t.nodes.div2);
            t.nodes = null;
        };

        function setUp_noRangeCheck(t) {
            t.initialCheckSelectionRanges = rangy.config.checkSelectionRanges;
            rangy.config.checkSelectionRanges = false;
        }

        function tearDown_noRangeCheck(t) {
            rangy.config.checkSelectionRanges = t.initialCheckSelectionRanges;
        }

        s.test("removeAllRanges test", function(t) {
            var sel = selectionCreator(win);
            sel.removeAllRanges();
            t.assertEquals(sel.rangeCount, 0);
            t.assertNull(sel.anchorNode);
            t.assertEquals(sel.anchorOffset, 0);
            t.assertNull(sel.focusNode);
            t.assertEquals(sel.focusOffset, 0);
            t.assertEquivalent(sel.isCollapsed, true);
        });

        s.test("addRange test", function(t) {
            var sel = selectionCreator(win);
            sel.removeAllRanges();
            var range = rangeCreator(doc);
            range.selectNodeContents(t.nodes.plainText);
            sel.addRange(range);
            t.assertEquals(sel.rangeCount, 1);
            t.assertEquivalent(sel.anchorNode, t.nodes.plainText);
            t.assertEquals(sel.anchorOffset, 0);
            t.assertEquivalent(sel.focusNode, t.nodes.plainText);
            t.assertEquals(sel.focusOffset, t.nodes.plainText.length);
            t.assertEquivalent(sel.isCollapsed, false);
        }, setUp_noRangeCheck, tearDown_noRangeCheck);

        s.test("removeRange test", function(t) {
            var sel = selectionCreator(win);
            sel.removeAllRanges();
            var range = rangeCreator(doc);
            range.selectNodeContents(t.nodes.plainText);
            sel.addRange(range);
            t.assertEquals(sel.rangeCount, 1);
            sel.removeRange(range);
            t.assertEquals(sel.rangeCount, 0);
            t.assertNull(sel.anchorNode);
            t.assertEquals(sel.anchorOffset, 0);
            t.assertNull(sel.focusNode);
            t.assertEquals(sel.focusOffset, 0);
            t.assertEquivalent(sel.isCollapsed, true);
        }, setUp_noRangeCheck, tearDown_noRangeCheck);

        s.test("removeRange instance test", function(t) {
            var sel = selectionCreator(win);
            sel.removeAllRanges();
            var range = rangeCreator(doc);
            range.selectNodeContents(t.nodes.plainText);
            sel.addRange(range);
            t.assertEquals(sel.rangeCount, 1);
            range.selectNodeContents(t.nodes.b);
            sel.removeRange(range);
            t.assertEquals(sel.rangeCount, 0);
            t.assertNull(sel.anchorNode);
            t.assertEquals(sel.anchorOffset, 0);
            t.assertNull(sel.focusNode);
            t.assertEquals(sel.focusOffset, 0);
            t.assertEquivalent(sel.isCollapsed, true);
        }, setUp_noRangeCheck, tearDown_noRangeCheck);

        if (rangy.features.selectionSupportsMultipleRanges) {
            s.test("removeRange multiple instances of same range test", function(t) {
                var sel = selectionCreator(win);
                sel.removeAllRanges();
                var range = rangeCreator(doc);
                range.selectNodeContents(t.nodes.plainText);
                sel.addRange(range);
                sel.addRange(range);
                t.assertEquals(sel.rangeCount, 2);
                sel.removeRange(range);
                t.assertEquals(sel.rangeCount, 1);
                sel.removeRange(range);
                t.assertEquals(sel.rangeCount, 0);
            }, setUp_noRangeCheck, tearDown_noRangeCheck);

            s.test("Multiple ranges test", function(t) {
                var sel = selectionCreator(win);
                sel.removeAllRanges();
                var range = rangeCreator(doc);
                range.selectNodeContents(t.nodes.plainText);
                sel.addRange(range);
                var r2 = rangeCreator(doc);
                r2.selectNodeContents(t.nodes.boldText);
                sel.addRange(r2);

                if (sel.rangeCount == 2) {
                    t.assert(DomRange.rangesEqual(range, sel.getRangeAt(0)));
                    t.assert(DomRange.rangesEqual(r2, sel.getRangeAt(1)));
                } else if (sel.rangeCount == 1) {
                    t.assert(DomRange.rangesEqual(range, sel.getRangeAt(0)));
                }
            }, setUp_noRangeCheck, tearDown_noRangeCheck);
        } else {
            s.test("Adding mutiple ranges where only one is supported", function(t) {
                rangy.config.checkSelectionRanges = false;
                var sel = selectionCreator(win);
                sel.removeAllRanges();
                var range1 = rangeCreator(doc);
                range1.selectNodeContents(t.nodes.plainText);
                var range2 = rangeCreator(doc);
                range2.selectNodeContents(t.nodes.b);
                sel.addRange(range1);
                t.assertEquals(sel.rangeCount, 1);
                sel.addRange(range2);
                t.assertEquals(sel.rangeCount, 1);
                t.assertEquivalent(range2, sel.getRangeAt(0));
                sel.removeRange(range1);
                t.assertEquals(sel.rangeCount, 1);
                sel.removeRange(range2);
                t.assertEquals(sel.rangeCount, 0);
                rangy.config.checkSelectionRanges = false;
            }, setUp_noRangeCheck, tearDown_noRangeCheck);
        }

        s.test("getRangeAt test", function(t) {
            var sel = selectionCreator(win);
            sel.removeAllRanges();
            var range = rangeCreator(doc);
            range.selectNodeContents(t.nodes.plainText);
            sel.addRange(range);
            t.assert(DomRange.rangesEqual(range, sel.getRangeAt(0)));
            t.assertEquivalent(range, sel.getRangeAt(0));
        }, setUp_noRangeCheck, tearDown_noRangeCheck);

        if (rangy.features.collapsedNonEditableSelectionsSupported) {
            s.test("Collapse same document test (non-editable)", function(t) {
                var sel = selectionCreator(win);
                sel.removeAllRanges();
                var range = rangeCreator(doc);
                range.selectNodeContents(t.nodes.plainText);
                sel.addRange(range);
                sel.collapse(t.nodes.plainText, 1);
                t.assertEquals(sel.rangeCount, 1);
                t.assertEquivalent(sel.anchorNode, t.nodes.plainText);
                t.assertEquals(sel.anchorOffset, 1);
                t.assertEquivalent(sel.focusNode, t.nodes.plainText);
                t.assertEquals(sel.focusOffset, 1);
                t.assertEquivalent(sel.isCollapsed, true);
            }, setUp_noRangeCheck, tearDown_noRangeCheck);

            s.test("Collapse other document test (non-editable)", function(t) {
                var sel = selectionCreator(win);
                sel.removeAllRanges();
                var range = rangeCreator(doc);
                range.selectNodeContents(t.nodes.plainText);
                sel.addRange(range);
                sel.collapse(t.nodes.b, 1);
                var otherDoc = getOtherDocument();
                testExceptionCode(t, function() {
                    sel.collapse(otherDoc.body, 0);
                }, DOMException.prototype.WRONG_DOCUMENT_ERR);
            }, setUp_noRangeCheck, tearDown_noRangeCheck);

            s.test("collapseToStart test (non-editable)", function(t) {
                var sel = selectionCreator(win);
                sel.removeAllRanges();
                var range = rangeCreator(doc);
                range.setStart(t.nodes.boldText, 1);
                range.setEnd(t.nodes.boldText, 2);
                sel.addRange(range);
                sel.collapseToStart();
                t.assertEquals(sel.rangeCount, 1);
                t.assertEquivalent(sel.anchorNode, t.nodes.boldText);
                t.assertEquals(sel.anchorOffset, 1);
                t.assertEquivalent(sel.focusNode, t.nodes.boldText);
                t.assertEquals(sel.focusOffset, 1);
                t.assertEquivalent(sel.isCollapsed, true);
            }, setUp_noRangeCheck, tearDown_noRangeCheck);

            s.test("collapseToEnd test (non-editable)", function(t) {
                var sel = selectionCreator(win);
                sel.removeAllRanges();
                var range = rangeCreator(doc);
                range.setStart(t.nodes.boldText, 1);
                range.setEnd(t.nodes.boldText, 2);
                sel.addRange(range);
                sel.collapseToEnd();
                t.assertEquals(sel.rangeCount, 1);
                t.assertEquivalent(sel.anchorNode, t.nodes.boldText);
                t.assertEquals(sel.anchorOffset, 2);
                t.assertEquivalent(sel.focusNode, t.nodes.boldText);
                t.assertEquals(sel.focusOffset, 2);
                t.assertEquivalent(sel.isCollapsed, true);
            });
        } else {
            s.test("Test collapsed selections cannot exist in non-editable elements", function(t) {
                var sel = selectionCreator(win);
                sel.removeAllRanges();
                var range = rangeCreator(doc);
                range.selectNodeContents(t.nodes.plainText);
                sel.addRange(range);
                sel.collapse(t.nodes.plainText, 1);
                t.assertEquals(sel.rangeCount, 0);
            }, setUp_noRangeCheck, tearDown_noRangeCheck);
        }

        s.test("Collapse same document test (editable)", function(t) {
            t.nodes.div.contentEditable = true;
            var sel = selectionCreator(win);
            sel.removeAllRanges();
            var range = rangeCreator(doc);
            range.selectNodeContents(t.nodes.plainText);
            sel.addRange(range);
            sel.collapse(t.nodes.plainText, 1);
            t.assertEquals(sel.rangeCount, 1);
            t.assertEquivalent(sel.anchorNode, t.nodes.plainText);
            t.assertEquals(sel.anchorOffset, 1);
            t.assertEquivalent(sel.focusNode, t.nodes.plainText);
            t.assertEquals(sel.focusOffset, 1);
            t.assertEquivalent(sel.isCollapsed, true);
        }, setUp_noRangeCheck, tearDown_noRangeCheck);

        s.test("Collapse other document test (editable)", function(t) {
            t.nodes.div.contentEditable = true;
            var sel = selectionCreator(win);
            sel.removeAllRanges();
            var range = rangeCreator(doc);
            range.selectNodeContents(t.nodes.plainText);
            sel.addRange(range);
            sel.collapse(t.nodes.b, 1);
            var otherDoc = getOtherDocument();
            testExceptionCode(t, function() {
                sel.collapse(otherDoc.body, 0);
            }, DOMException.prototype.WRONG_DOCUMENT_ERR);
        }, setUp_noRangeCheck, tearDown_noRangeCheck);

        s.test("collapseToStart test (editable)", function(t) {
            t.nodes.div.contentEditable = true;
            var sel = selectionCreator(win);
            sel.removeAllRanges();
            var range = rangeCreator(doc);
            range.setStart(t.nodes.boldText, 1);
            range.setEnd(t.nodes.boldText, 2);
            sel.addRange(range);
            sel.collapseToStart();
            t.assertEquals(sel.rangeCount, 1);
            t.assertEquivalent(sel.anchorNode, t.nodes.boldText);
            t.assertEquals(sel.anchorOffset, 1);
            t.assertEquivalent(sel.focusNode, t.nodes.boldText);
            t.assertEquals(sel.focusOffset, 1);
            t.assertEquivalent(sel.isCollapsed, true);
        }, setUp_noRangeCheck, tearDown_noRangeCheck);

        s.test("collapseToEnd test (editable)", function(t) {
            t.nodes.div.contentEditable = true;
            var sel = selectionCreator(win);
            sel.removeAllRanges();
            var range = rangeCreator(doc);
            range.setStart(t.nodes.boldText, 1);
            range.setEnd(t.nodes.boldText, 2);
            sel.addRange(range);
            sel.collapseToEnd();
            t.assertEquals(sel.rangeCount, 1);
            t.assertEquivalent(sel.anchorNode, t.nodes.boldText);
            t.assertEquals(sel.anchorOffset, 2);
            t.assertEquivalent(sel.focusNode, t.nodes.boldText);
            t.assertEquals(sel.focusOffset, 2);
            t.assertEquivalent(sel.isCollapsed, true);
        });

        s.test("selectAllChildren same document test", function(t) {
            var sel = selectionCreator(win);
            sel.removeAllRanges();
            var range = rangeCreator(doc);
            range.setStart(t.nodes.plainText, 1);
            range.setEnd(t.nodes.plainText, 2);
            sel.addRange(range);
            sel.selectAllChildren(t.nodes.div);
            t.assertEquals(sel.rangeCount, 1);
            t.assertEquivalent(sel.anchorNode, t.nodes.div);
            t.assertEquals(sel.anchorOffset, 0);
            t.assertEquivalent(sel.focusNode, t.nodes.div);
            t.assertEquals(sel.focusOffset, t.nodes.div.childNodes.length);
            t.assertEquivalent(sel.isCollapsed, false);
        }, setUp_noRangeCheck, tearDown_noRangeCheck);

        s.test("HTML5 toString script contents test", function(t) {
            var div = doc.createElement("div");
            div.innerHTML = 'one<script type="text/javascript">var x = 1;</script>two';
            doc.body.appendChild(div);
            var s = doc.getElementById("s1");
            var sel = selectionCreator(win);
            sel.removeAllRanges();
            var range = rangeCreator(doc);
            range.selectNodeContents(div);
            sel.addRange(range);
            var rangeText = range.toString();
            var selText = sel.toString();
            doc.body.removeChild(div);
            t.assertEquals(rangeText, "onevar x = 1;two");
            t.assertEquals(selText, "onevar x = 1;two");
        }, setUp_noRangeCheck, tearDown_noRangeCheck);

        s.test("HTML5 toString display:none contents test", function(t) {
            var div = doc.createElement("div");
            div.innerHTML = 'one<div style="display: none">two</div>three';
            doc.body.appendChild(div);
            var sel = selectionCreator(win);
            sel.removeAllRanges();
            var range = rangeCreator(doc);
            range.selectNodeContents(div);
            sel.addRange(range);
            var rangeText = range.toString();
            var selText = sel.toString();
            doc.body.removeChild(div);
            t.assertEquals(rangeText, "onetwothree");
            t.assertEquals(selText, "onetwothree");
        }, setUp_noRangeCheck, tearDown_noRangeCheck);

        var testSelection = selectionCreator(window);
        var testRange = rangeCreator(document);

        if (testSelection.containsNode && testRange.containsNode) {
            s.test("containsNode test", function(t) {
                var sel = selectionCreator(win);
                sel.removeAllRanges();
                var range = rangeCreator(doc);
                range.setStart(t.nodes.plainText, 1);
                range.setEnd(t.nodes.plainText, 2);
                sel.addRange(range);
                t.assertFalse(sel.containsNode(t.nodes.plainText, false));
                t.assertTrue(sel.containsNode(t.nodes.plainText, true));
            }, setUp_noRangeCheck, tearDown_noRangeCheck);
        }

        if (testSelection.extend) {
            s.test("extend test", function(t) {
                var sel = selectionCreator(win);
                sel.removeAllRanges();
                var range = rangeCreator(doc);
                range.setStart(t.nodes.plainText, 1);
                range.setEnd(t.nodes.plainText, 2);
                sel.addRange(range);
                sel.extend(t.nodes.boldText, 1);
                t.assertEquals(sel.rangeCount, 1);
                t.assertEquivalent(sel.anchorNode, t.nodes.plainText);
                t.assertEquals(sel.anchorOffset, 1);
                t.assertEquivalent(sel.focusNode, t.nodes.boldText);
                t.assertEquals(sel.focusOffset, 1);
                t.assertEquivalent(sel.isCollapsed, false);
            }, setUp_noRangeCheck, tearDown_noRangeCheck);

            s.test("extend backwards test", function(t) {
                var sel = selectionCreator(win);
                sel.removeAllRanges();
                var range = rangeCreator(doc);
                range.setStart(t.nodes.plainText, 2);
                range.setEnd(t.nodes.plainText, 3);
                sel.addRange(range);
                sel.extend(t.nodes.plainText, 1);
                t.assertEquals(sel.rangeCount, 1);
                t.assertEquivalent(sel.anchorNode, t.nodes.plainText);
                t.assertEquals(sel.anchorOffset, 2);
                t.assertEquivalent(sel.focusNode, t.nodes.plainText);
                t.assertEquals(sel.focusOffset, 1);
                t.assertEquivalent(sel.isCollapsed, false);
                t.assertEquivalent(sel.toString(), "l");
            }, setUp_noRangeCheck, tearDown_noRangeCheck);
        }

        function testRefresh(name, testRangeCreator) {
            s.test("Refresh test: " + name, function(t) {
                var sel = selectionCreator(win);
                var range = testRangeCreator(t);
                sel.removeAllRanges();
                sel.addRange(range);
                sel.refresh();
                t.assertEquals(sel.rangeCount, 1);
                var selRange = sel.getRangeAt(0);
                t.assert(DomRange.rangesEqual(range, selRange), "Ranges not equal. Original: " + DomRange.inspect(range) + ", refreshed selection range: " + DomRange.inspect(selRange));
            });
        }

        testRefresh("uncollapsed selection mid text node", function(t) {
            var range = rangeCreator(doc);
            range.setStart(t.nodes.plainText, 1);
            range.setEnd(t.nodes.plainText, 2);
            return range;
        });

        testRefresh("uncollapsed selection start of text node", function(t) {
            var range = rangeCreator(doc);
            range.setStart(t.nodes.boldAndItalicText, 0);
            range.setEnd(t.nodes.boldAndItalicText, 1);
            return range;
        });

        testRefresh("uncollapsed selection end of text node", function(t) {
            var range = rangeCreator(doc);
            range.setStart(t.nodes.boldAndItalicText, t.nodes.boldAndItalicText.length - 1);
            range.setEnd(t.nodes.boldAndItalicText, t.nodes.boldAndItalicText.length);
            return range;
        });

        testRefresh("collapsed selection mid text node", function(t) {
            var range = rangeCreator(doc);
            t.nodes.div.contentEditable = true;
            range.collapseToPoint(t.nodes.boldAndItalicText, 1);
            return range;
        });

        testRefresh("collapsed selection start of text node", function(t) {
            var range = rangeCreator(doc);
            t.nodes.div.contentEditable = true;
            range.collapseToPoint(t.nodes.boldAndItalicText, 0);
            return range;
        });

        testRefresh("collapsed selection end of text node", function(t) {
            var range = rangeCreator(doc);
            t.nodes.div.contentEditable = true;
            range.collapseToPoint(t.nodes.boldAndItalicText, t.nodes.boldAndItalicText.length);
            return range;
        });

        testRefresh("collapsed selection immediately prior to element", function(t) {
            var range = rangeCreator(doc);
            t.nodes.div.contentEditable = true;
            range.collapseToPoint(t.nodes.b, 1);
            return range;
        });

        testRefresh("collapsed selection immediately after element", function(t) {
            var range = rangeCreator(doc);
            t.nodes.div.contentEditable = true;
            range.collapseToPoint(t.nodes.b, 2);
            return range;
        });

        testRefresh("collapsed selection at offset 0 in element", function(t) {
            var range = rangeCreator(doc);
            t.nodes.div.contentEditable = true;
            range.collapseToPoint(t.nodes.b, 0);
            return range;
        });

        testRefresh("collapsed selection encompassing element", function(t) {
            var range = rangeCreator(doc);
            t.nodes.div.contentEditable = true;
            range.setStart(t.nodes.b, 1);
            range.setEnd(t.nodes.b, 2);
            return range;
        });

    }, false);
}

var iframeWin = [];

/*
function testRangeCreator(rangeCreator, rangeCratorName) {
    testSelectionAndRangeCreators([window], "main", createRangySelection, "Rangy Selection", rangeCreator, rangeCratorName);

    if (hasNativeGetSelection) {
        testSelectionAndRangeCreators([window], "main", createNativeSelection, "native selection", rangeCreator, rangeCratorName);
    }

    testSelectionAndRangeCreators(iframeWin, "iframe", createRangySelection, "Rangy Selection", rangeCreator, rangeCratorName);

    if (hasNativeGetSelection) {
        testSelectionAndRangeCreators(iframeWin, "iframe", createNativeSelection, "native selection", rangeCreator, rangeCratorName);
    }
}
*/

testSelectionAndRangeCreators([window], "main", createRangySelection, "Rangy Selection", createRangyRange, "Rangy Range");
testSelectionAndRangeCreators(iframeWin, "iframe", createRangySelection, "Rangy Selection", createRangyRange, "Rangy Range");

testSelectionAndRangeCreators([window], "main", createRangySelection, "Rangy Selection", createWrappedNativeDomRange, "Wrapped native Range");
testSelectionAndRangeCreators(iframeWin, "iframe", createRangySelection, "Rangy Selection", createWrappedNativeDomRange, "Wrapped native Range");

if (hasNativeDomRange) {
    testSelectionAndRangeCreators([window], "main", createRangySelection, "Rangy Selection", createNativeDomRange, "native Range");
    testSelectionAndRangeCreators(iframeWin, "iframe", createRangySelection, "Rangy Selection", createNativeDomRange, "native Range");

    if (hasNativeGetSelection) {
        testSelectionAndRangeCreators([window], "main", createNativeSelection, "native selection", createNativeDomRange, "native Range");
        testSelectionAndRangeCreators(iframeWin, "iframe", createNativeSelection, "native selection", createNativeDomRange, "native Range");
    }
}



/*
testRangeCreator(createRangyRange, "Rangy Range");
testRangeCreator(createWrappedNativeDomRange, "Wrapped native Range");

if (hasNativeDomRange) {
    testRangeCreator(createNativeDomRange, "native Range");
}
*/

var iframe;

xn.test.suite("getIframeSelection test", function(s) {
    xn.addEventListener(window, "load", function() {
        s.test("getIframeSelection test", function(t) {
            rangy.init();
            var sel = rangy.getIframeSelection(iframe);
            var range = rangy.createIframeRange(iframe);
            range.selectNodeContents(range.commonAncestorContainer.body);
            sel.setSingleRange(range);
            t.assertEquals(sel.toString(), "content");
        });
    });
});

var iframeEl;
xn.addEventListener(window, "load", function() {
    // Do it in an iframe
    iframeEl = document.body.appendChild(document.createElement("iframe"));
    var win = iframeEl.contentWindow;
    var doc = iframeEl.contentDocument || iframeEl.contentWindow.document;
    doc.open();
    doc.write("<html><head><title>Rangy Selection Test</title></head><body>Content</body></html>");
    doc.close();

    iframeWin[0] = win;
});

xn.test.suite("Miscellaneous selection tests", function(s) {
    s.test("Selection prototype extension", function(t) {
        rangy.selectionPrototype.fooBar = "test";

        t.assertEquals(rangy.getSelection().fooBar, "test");
    });

    s.test("getSelection() parameter tests", function(t) {
        var sel = rangy.getSelection();
        t.assertEquals(sel.win, window);

        sel = rangy.getSelection(window);
        t.assertEquals(sel.win, window);

        sel = rangy.getSelection(document);
        t.assertEquals(sel.win, window);

        sel = rangy.getSelection(document.body);
        t.assertEquals(sel.win, window);

        sel = rangy.getSelection(document.firstChild);
        t.assertEquals(sel.win, window);

        sel = rangy.getSelection(sel);
        t.assertEquals(sel.win, window);

        t.assertError(function() {
            sel = rangy.getSelection({});
        });

        if (rangy.features.implementsWinGetSelection) {
            t.assertError(function() {
                sel = rangy.getSelection(window.getSelection());
            });
        }
    });

    s.test("iframe createRange() parameter tests", function(t) {
        var win = rangy.dom.getIframeWindow(iframeEl);

        var sel = rangy.getSelection(iframeEl);
        t.assertEquals(sel.win, win);

        sel = rangy.getSelection(win);
        t.assertEquals(sel.win, win);

        sel = rangy.getSelection(win.document);
        t.assertEquals(sel.win, win);

        sel = rangy.getSelection(win.document.body);
        t.assertEquals(sel.win, win);

        sel = rangy.getSelection(win.document.firstChild);
        t.assertEquals(sel.win, win);

        sel = rangy.getSelection(sel);
        t.assertEquals(sel.win, win);
    });
}, false);