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
        var DOMException = rangy.dom.DOMException;

        s.setUp = function(t) {
            win = wins[0];
            doc = win.document;
            var div = doc.createElement("div");
            var plainText = div.appendChild(doc.createTextNode("plain"));
            var b = div.appendChild(doc.createElement("b"));
            var boldText = b.appendChild(doc.createTextNode("bold"));
            var i = b.appendChild(doc.createElement("i"));
            var boldAndItalicText = i.appendChild(doc.createTextNode("bold and italic"));
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
        }rangy.config.checkSelectionRanges

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
                    t.assert(DomRange.util.rangesEqual(range, sel.getRangeAt(0)));
                    t.assert(DomRange.util.rangesEqual(r2, sel.getRangeAt(1)));
                } else if (sel.rangeCount == 1) {
                    t.assert(DomRange.util.rangesEqual(range, sel.getRangeAt(0)));
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
            t.assert(DomRange.util.rangesEqual(range, sel.getRangeAt(0)));
            t.assertEquivalent(range, sel.getRangeAt(0));
        }, setUp_noRangeCheck, tearDown_noRangeCheck);

        s.test("Collapse same document test", function(t) {
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

        s.test("Collapse other document test", function(t) {
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

        s.test("collapseToStart test", function(t) {
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

        s.test("collapseToEnd test", function(t) {
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
            sel.selectAllChildren(doc.body);
            t.assertEquals(sel.rangeCount, 1);
            t.assertEquivalent(sel.anchorNode, doc.body);
            t.assertEquals(sel.anchorOffset, 0);
            t.assertEquivalent(sel.focusNode, doc.body);
            t.assertEquals(sel.focusOffset, doc.body.childNodes.length);
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

xn.addEventListener(window, "load", function() {
    // Do it in an iframe
    var iframe = document.body.appendChild(document.createElement("iframe"));
    var win = iframe.contentWindow;
    var doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write("<html><head><title>Rangy Selection Test</title></head><body>Content</body></html>");
    doc.close();
    iframeWin[0] = win;
});
