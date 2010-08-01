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

function testSelectionAndRangeCreators(wins, winName, selectionCreator, selectionCreatorName, rangeCreator, rangeCreatorName) {
    xn.test.suite(selectionCreatorName + " in " + winName + " window with range creator " + rangeCreatorName, function(s) {
        var win, doc;
        var DomRange = rangy.DomRange;
        var DOMException = rangy.dom.DOMException;
        var RangeException = DomRange.RangeException;

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
        });

        s.test("removeRange test", function(t) {
            var sel = selectionCreator(win);
            sel.removeAllRanges();
            var range = rangeCreator(doc);
            range.selectNodeContents(t.nodes.plainText);
            sel.addRange(range);
            sel.removeRange(range);
            t.assertEquals(sel.rangeCount, 0);
            t.assertNull(sel.anchorNode);
            t.assertEquals(sel.anchorOffset, 0);
            t.assertNull(sel.focusNode);
            t.assertEquals(sel.focusOffset, 0);
            t.assertEquivalent(sel.isCollapsed, true);
        });

        s.test("getRangeAt test", function(t) {
            var sel = selectionCreator(win);
            sel.removeAllRanges();
            var range = rangeCreator(doc);
            range.selectNodeContents(t.nodes.plainText);
            sel.addRange(range);
            t.assert(DomRange.util.rangesEqual(range, sel.getRangeAt(0)));
        });

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
