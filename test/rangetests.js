xn.test.suite("Range", function(s) {
    function createJsDomRange(doc) {
        return new DomRange(doc);
    }

    function createNativeDomRange(doc) {
        return doc.createRange();
    }

    var hasNativeDomRange = "createRange" in document;

    s.setUp = function(t) {
        var div = document.createElement("div");
        var plainText = div.appendChild(document.createTextNode("plain"));
        var b = div.appendChild(document.createElement("b"));
        var boldText = b.appendChild(document.createTextNode("bold"));
        var i = b.appendChild(document.createElement("i"));
        var boldAndItalicText = i.appendChild(document.createTextNode("bold and italic"));
        document.body.appendChild(div);
        t.nodes = {
            div: div,
            plainText: plainText,
            b: b,
            boldText: boldText,
            i: i,
            boldAndItalicText: boldAndItalicText
        };
    };

    s.tearDown = function(t) {
        document.body.removeChild(t.nodes.div);
        t.nodes = null;
    };


    function testBothRangeTypes(name, testFunc) {
        s.test(name + " (Custom Range)", function(t) {
            testFunc(t, createJsDomRange);
        });

        if (hasNativeDomRange) {
            s.test(name + " (Native Range)", function(t) {
                testFunc(t, createNativeDomRange);
            });
        }
    }

    testBothRangeTypes("Initial Range values", function(t, rangeCreator) {
        var range = rangeCreator(document);
        t.assertEquivalent(range.startContainer, document);
        t.assertEquivalent(range.startOffset, 0);
        t.assertEquivalent(range.endContainer, document);
        t.assertEquivalent(range.endOffset, 0);
    });


    testBothRangeTypes("setStart after end test", function(t, rangeCreator) {
        var range = rangeCreator(document);
        range.setStart(t.nodes.plainText, 2);
        t.assert(range.collapsed);
        t.assertEquivalent(range.startContainer, t.nodes.plainText);
        t.assertEquivalent(range.startOffset, 2);
        t.assertEquivalent(range.endContainer, t.nodes.plainText);
        t.assertEquivalent(range.endOffset, 2);
    });

    testBothRangeTypes("setEnd after start test", function(t, rangeCreator) {
        var range = rangeCreator(document);
        range.setEnd(t.nodes.b, 1);
        t.assertFalse(range.collapsed);
        t.assertEquivalent(range.startContainer, document);
        t.assertEquivalent(range.startOffset, 0);
        t.assertEquivalent(range.endContainer, t.nodes.b);
        t.assertEquivalent(range.endOffset, 1);
    });

    testBothRangeTypes("setStart after interesting end test", function(t, rangeCreator) {
        var range = rangeCreator(document);
        range.setEnd(t.nodes.b, 1);
        range.setStart(t.nodes.boldAndItalicText, 2);
        t.assert(range.collapsed);
        t.assertEquivalent(range.startContainer, t.nodes.boldAndItalicText);
        t.assertEquivalent(range.startOffset, 2);
        t.assertEquivalent(range.endContainer, t.nodes.boldAndItalicText);
        t.assertEquivalent(range.endOffset, 2);
    });

    testBothRangeTypes("compareBoundaryPoints 1", function(t, rangeCreator) {
        var range1 = rangeCreator(document);
        var range2 = rangeCreator(document);
        range1.setStart(t.nodes.b, 1);
        range1.setEnd(t.nodes.boldAndItalicText, 2);
        range2.setStart(t.nodes.plainText, 1);
        range2.setEnd(t.nodes.b, 1);

        t.assertEquivalent(range1.compareBoundaryPoints(range1.START_TO_START, range2), 1);
        t.assertEquivalent(range1.compareBoundaryPoints(range1.START_TO_END, range2), 1);
        t.assertEquivalent(range1.compareBoundaryPoints(range1.END_TO_START, range2), 0);
        t.assertEquivalent(range1.compareBoundaryPoints(range1.END_TO_END, range2), 1);
    });

    testBothRangeTypes("cloneContents 1", function(t, rangeCreator) {
        var range = rangeCreator(document);
        range.setStart(t.nodes.plainText, 1);
        range.setEnd(t.nodes.b, 1);
        var frag = range.cloneContents();
        var div = document.createElement("div");
        div.appendChild(frag);
        log.info(range.toString(), div.innerHTML);

/*
        range.deleteContents();
        log.info(t.nodes.div.innerHTML);
*/
/*
        if (range.getNodes) {
            console.log(range.getNodes());
        }
*/
    });

    testBothRangeTypes("extractContents 1", function(t, rangeCreator) {
        var range = rangeCreator(document);
        range.setStart(t.nodes.plainText, 1);
        range.setEnd(t.nodes.plainText, 2);
        var frag = range.extractContents();
        t.assertEquals(frag.nodeType, 11);
        t.assertEquals(frag.childNodes.length, 1);
        t.assertEquals(frag.firstChild.nodeType, 3);
        t.assertEquals(frag.firstChild.data, "l");
        t.assertEquals(t.nodes.plainText.data, "p");
        t.assertNotNull(t.nodes.plainText.nextSibling);
        t.assertEquals(t.nodes.plainText.nextSibling.data, "ain");
    });

    // TODO: Write test for setting range boundary to a node in a different document
    // TODO: Write tests for all possible exceptions
    // TODO: Write tests for extractContents/cloneContents etc when range is contained within one text node

    // Tests adapted from Acid3 Range tests at http://acid3.acidtests.org/

    testBothRangeTypes("Acid3 test 7: basic ranges tests", function(t, rangeCreator) {
        var r = rangeCreator(document);
        t.assert(r, "range not created");
        t.assert(r.collapsed, "new range wasn't collapsed");
        t.assertEquals(r.commonAncestorContainer, document, "new range's common ancestor wasn't the document");
        t.assertEquals(r.startContainer, document, "new range's start container wasn't the document");
        t.assertEquals(r.startOffset, 0, "new range's start offset wasn't zero");
        t.assertEquals(r.endContainer, document, "new range's end container wasn't the document");
        t.assertEquals(r.endOffset, 0, "new range's end offset wasn't zero");
        t.assert(r.cloneContents(), "cloneContents() didn't return an object");
        t.assertEquals(r.cloneContents().childNodes.length, 0, "nothing cloned was more than nothing");
        t.assertEquals(r.cloneRange().toString(), "", "nothing cloned stringifed to more than nothing");
        r.collapse(true); // no effect
        t.assertEquals(r.compareBoundaryPoints(r.START_TO_END, r.cloneRange()), 0, "starting boundary point of range wasn't the same as the end boundary point of the clone range");
        r.deleteContents(); // no effect
        t.assertEquals(r.extractContents().childNodes.length, 0, "nothing removed was more than nothing");
        var endOffset = r.endOffset;
        r.insertNode(document.createComment("commented inserted to test ranges"));
        r.setEnd(r.endContainer, endOffset + 1); // added to work around spec bug that smaug is blocking the errata for
        try {
            t.assert(!r.collapsed, "range with inserted comment is collapsed");
            t.assertEquals(r.commonAncestorContainer, document, "range with inserted comment has common ancestor that isn't the document");
            t.assertEquals(r.startContainer, document, "range with inserted comment has start container that isn't the document");
            t.assertEquals(r.startOffset, 0, "range with inserted comment has start offset that isn't zero");
            t.assertEquals(r.endContainer, document, "range with inserted comment has end container that isn't the document");
            t.assertEquals(r.endOffset, 1, "range with inserted comment has end offset that isn't after the comment");
        } finally {
            document.removeChild(document.firstChild);
        }
    });

    testBothRangeTypes("Acid3 test 8: moving boundary points", function(t, rangeCreator) {
        // test 8: moving boundary points
        var doc;
        if (document.implementation && document.implementation.createDocument) {
            doc = document.implementation.createDocument(null, null, null);
        } else if (window.ActiveXObject) {
            doc = new ActiveXObject("MSXML2.DOMDocument");
        }
        var root = doc.createElement("root");
        doc.appendChild(root);
        var e1 = doc.createElement("e");
        root.appendChild(e1);
        var e2 = doc.createElement("e");
        root.appendChild(e2);
        var e3 = doc.createElement("e");
        root.appendChild(e3);
        var r = rangeCreator(doc);
        r.setStart(e2, 0);
        r.setEnd(e3, 0);
        t.assert(!r.collapsed, "non-empty range claims to be collapsed");
        r.setEnd(e1, 0);
        t.assert(r.collapsed, "setEnd() didn't collapse the range");
        t.assertEquals(r.startContainer, e1, "startContainer is wrong after setEnd()");
        t.assertEquals(r.startOffset, 0, "startOffset is wrong after setEnd()");
        t.assertEquals(r.endContainer, e1, "endContainer is wrong after setEnd()");
        t.assertEquals(r.endOffset, 0, "endOffset is wrong after setEnd()");
        r.setStartBefore(e3);
        t.assert(r.collapsed, "setStartBefore() didn't collapse the range");
        t.assertEquals(r.startContainer, root, "startContainer is wrong after setStartBefore()");
        t.assertEquals(r.startOffset, 2, "startOffset is wrong after setStartBefore()");
        t.assertEquals(r.endContainer, root, "endContainer is wrong after setStartBefore()");
        t.assertEquals(r.endOffset, 2, "endOffset is wrong after setStartBefore()");
        r.setEndAfter(root);
        t.assert(!r.collapsed, "setEndAfter() didn't uncollapse the range");
        t.assertEquals(r.startContainer, root, "startContainer is wrong after setEndAfter()");
        t.assertEquals(r.startOffset, 2, "startOffset is wrong after setEndAfter()");
        t.assertEquals(r.endContainer, doc, "endContainer is wrong after setEndAfter()");
        t.assertEquals(r.endOffset, 1, "endOffset is wrong after setEndAfter()");
        r.setStartAfter(e2);
        t.assert(!r.collapsed, "setStartAfter() collapsed the range");
        t.assertEquals(r.startContainer, root, "startContainer is wrong after setStartAfter()");
        t.assertEquals(r.startOffset, 2, "startOffset is wrong after setStartAfter()");
        t.assertEquals(r.endContainer, doc, "endContainer is wrong after setStartAfter()");
        t.assertEquals(r.endOffset, 1, "endOffset is wrong after setStartAfter()");
        var msg = '';
        try {
            r.setEndBefore(doc);
            msg = "no exception thrown for setEndBefore() the document itself";
        } catch (e) {
            if (e.BAD_BOUNDARYPOINTS_ERR != 1)
              msg = 'not a RangeException';
            else if (e.INVALID_NODE_TYPE_ERR != 2)
              msg = 'RangeException has no INVALID_NODE_TYPE_ERR';
            else if ("INVALID_ACCESS_ERR" in e)
              msg = 'RangeException has DOMException constants';
            else if (e.code != e.INVALID_NODE_TYPE_ERR)
              msg = 'wrong exception raised from setEndBefore()';
        }
        t.assert(msg == "", msg);
        t.assert(!r.collapsed, "setEndBefore() collapsed the range");
        t.assertEquals(r.startContainer, root, "startContainer is wrong after setEndBefore()");
        t.assertEquals(r.startOffset, 2, "startOffset is wrong after setEndBefore()");
        t.assertEquals(r.endContainer, doc, "endContainer is wrong after setEndBefore()");
        t.assertEquals(r.endOffset, 1, "endOffset is wrong after setEndBefore()");
        r.collapse(false);
        t.assert(r.collapsed, "collapse() collapsed the range");
        t.assertEquals(r.startContainer, doc, "startContainer is wrong after collapse()");
        t.assertEquals(r.startOffset, 1, "startOffset is wrong after collapse()");
        t.assertEquals(r.endContainer, doc, "endContainer is wrong after collapse()");
        t.assertEquals(r.endOffset, 1, "endOffset is wrong after collapse()");
        r.selectNodeContents(root);
        t.assert(!r.collapsed, "collapsed is wrong after selectNodeContents()");
        t.assertEquals(r.startContainer, root, "startContainer is wrong after selectNodeContents()");
        t.assertEquals(r.startOffset, 0, "startOffset is wrong after selectNodeContents()");
        t.assertEquals(r.endContainer, root, "endContainer is wrong after selectNodeContents()");
        t.assertEquals(r.endOffset, 3, "endOffset is wrong after selectNodeContents()");
        r.selectNode(e2);
        t.assert(!r.collapsed, "collapsed is wrong after selectNode()");
        t.assertEquals(r.startContainer, root, "startContainer is wrong after selectNode()");
        t.assertEquals(r.startOffset, 1, "startOffset is wrong after selectNode()");
        t.assertEquals(r.endContainer, root, "endContainer is wrong after selectNode()");
        t.assertEquals(r.endOffset, 2, "endOffset is wrong after selectNode()");
    });

    function getTestDocument() {
        var iframe = document.getElementById("selectors");
        var doc = iframe.contentDocument || iframe.contentWindow.document;
        for (var i = doc.documentElement.childNodes.length-1; i >= 0; i -= 1) {
            doc.documentElement.removeChild(doc.documentElement.childNodes[i]);
        }
        doc.documentElement.appendChild(doc.createElement('head'));
        doc.documentElement.firstChild.appendChild(doc.createElement('title'));
        doc.documentElement.appendChild(doc.createElement('body'));
        return doc;
    }

    testBothRangeTypes("Acid3 test 9: extractContents() in a Document", function(t, rangeCreator) {
        var doc = getTestDocument();
        var h1 = doc.createElement('h1');
        var t1 = doc.createTextNode('Hello ');
        h1.appendChild(t1);
        var em = doc.createElement('em');
        var t2 = doc.createTextNode('Wonderful');
        em.appendChild(t2);
        h1.appendChild(em);
        var t3 = doc.createTextNode(' Kitty');
        h1.appendChild(t3);
        doc.body.appendChild(h1);
        var p = doc.createElement('p');
        var t4 = doc.createTextNode('How are you?');
        p.appendChild(t4);
        doc.body.appendChild(p);
        var r = rangeCreator(doc);
        r.selectNodeContents(doc);
        t.assertEquals(r.toString(), "Hello Wonderful KittyHow are you?", "toString() on range selecting Document gave wrong output");
        r.setStart(t2, 6);
        r.setEnd(p, 0);
        // <body><h1>Hello <em>Wonder ful<\em> Kitty<\h1><p> How are you?<\p><\body>     (the '\'s are to avoid validation errors)
        //                           ^----------------------^
        t.assertEquals(r.toString(), "ful Kitty", "toString() on range crossing text nodes gave wrong output");
        var f = r.extractContents();
        // <h1><em>ful<\em> Kitty<\h1><p><\p>
        // ccccccccccccccccMMMMMMcccccccccccc
        t.assertEquals(f.nodeType, 11, "failure 1");
        t.assert(f.childNodes.length == 2, "expected two children in the result, got " + f.childNodes.length);
        t.assertEquals(f.childNodes[0].tagName, "H1", "failure 3");
        t.assert(f.childNodes[0] != h1, "failure 4");
        t.assertEquals(f.childNodes[0].childNodes.length, 2, "failure 5");
        t.assertEquals(f.childNodes[0].childNodes[0].tagName, "EM", "failure 6");
        t.assert(f.childNodes[0].childNodes[0] != em, "failure 7");
        t.assertEquals(f.childNodes[0].childNodes[0].childNodes.length, 1, "failure 8");
        t.assertEquals(f.childNodes[0].childNodes[0].childNodes[0].data, "ful", "failure 9");
        t.assert(f.childNodes[0].childNodes[0].childNodes[0] != t2, "failure 10");
        t.assertEquals(f.childNodes[0].childNodes[1], t3, "failure 11");
        t.assert(f.childNodes[0].childNodes[1] != em, "failure 12");
        t.assertEquals(f.childNodes[1].tagName, "P", "failure 13");
        t.assertEquals(f.childNodes[1].childNodes.length, 0, "failure 14");
        t.assert(f.childNodes[1] != p, "failure 15");
    });

    testBothRangeTypes("Acid3 test 10: Ranges and Attribute Nodes", function(t, rangeCreator) {
        // test 10: Ranges and Attribute Nodes
        var e = document.getElementById('test');
        if (!e.getAttributeNode) {
            return; // support for attribute nodes is optional in Acid3, because attribute nodes might be removed from DOM Core in the future.
        }
        // however, if they're supported, they'd better work:
        var a = e.getAttributeNode('id');
        var r = rangeCreator(document);
        r.selectNodeContents(a);
        t.assertEquals(r.toString(), "test", "toString() didn't work for attribute node");
        var t2 = a.firstChild;
        var f = r.extractContents();
        t.assertEquals(f.childNodes.length, 1, "extracted contents were the wrong length");
        t.assertEquals(f.childNodes[0], t2, "extracted contents were the wrong node");
        t.assertEquals(t2.textContent, 'test', "extracted contents didn't match old attribute value");
        t.assertEquals(r.toString(), '', "extracting contents didn't empty attribute value; instead equals '" + r.toString() + "'");
        t.assertEquals(e.getAttribute('id'), '', "extracting contents didn't change 'id' attribute to empty string");
        e.id = 'test';
    });

    testBothRangeTypes("Acid3 test 11: Ranges and Comments", function(t, rangeCreator) {
        // test 11: Ranges and Comments
        var msg;
        var doc = getTestDocument();
        var c1 = doc.createComment("11111");
        doc.appendChild(c1);
        var r = rangeCreator(doc);
        r.selectNode(c1);
        msg = 'wrong exception raised';
        try {
            r.surroundContents(doc.createElement('a'));
            msg = 'no exception raised';
        } catch (e) {
            if ('code' in e) msg += '; code = ' + e.code;
            if (e.code == 3) msg = '';
        }
        t.assert(msg == '', "when inserting <a> into Document with another child: " + msg);
        var c2 = doc.createComment("22222");
        doc.body.appendChild(c2);
        var c3 = doc.createComment("33333");
        doc.body.appendChild(c3);
        r.setStart(c2, 2);
        r.setEnd(c3, 3);
        msg = 'wrong exception raised';
        try {
            r.surroundContents(doc.createElement('a'));
            msg = 'no exception raised';
        } catch (e) {
            if ('code' in e) msg += '; code = ' + e.code;
            if (e.code == 1) msg = '';
        }
        t.assert(msg == '', "when trying to surround two halves of comment: " + msg);
        t.assertEquals(r.toString(), "", "comments returned text");
    });

    testBothRangeTypes("Acid3 test 12: Ranges under mutations: insertion into text nodes", function(t, rangeCreator) {
        var doc = getTestDocument();
        var p = doc.createElement('p');
        var t1 = doc.createTextNode('12345');
        p.appendChild(t1);
        var t2 = doc.createTextNode('ABCDE');
        p.appendChild(t2);
        doc.body.appendChild(p);
        var r = rangeCreator(doc);
        r.setStart(p.firstChild, 2);
        r.setEnd(p.firstChild, 3);
        t.assert(!r.collapsed, "collapsed is wrong at start");
        t.assertEquals(r.commonAncestorContainer, p.firstChild, "commonAncestorContainer is wrong at start");
        t.assertEquals(r.startContainer, p.firstChild, "startContainer is wrong at start");
        t.assertEquals(r.startOffset, 2, "startOffset is wrong at start");
        t.assertEquals(r.endContainer, p.firstChild, "endContainer is wrong at start");
        t.assertEquals(r.endOffset, 3, "endOffset is wrong at start");
        t.assertEquals(r.toString(), "3", "range in text node stringification failed");
        r.insertNode(p.lastChild);
        t.assertEquals(p.childNodes.length, 3, "insertion of node made wrong number of child nodes");
        t.assertEquals(p.childNodes[0], t1, "unexpected first text node");
        t.assertEquals(p.childNodes[0].data, "12", "unexpected first text node contents");
        t.assertEquals(p.childNodes[1], t2, "unexpected second text node");
        t.assertEquals(p.childNodes[1].data, "ABCDE", "unexpected second text node");
        t.assertEquals(p.childNodes[2].data, "345", "unexpected third text node contents");
        // The spec is very vague about what exactly should be in the range afterwards:
        // the insertion results in a splitText(), which it says is equivalent to a truncation
        // followed by an insertion, but it doesn't say what to do when you have a truncation,
        // so we don't know where either the start or the end boundary points end up.
        // The spec really should be clarified for how to handle splitText() and
        // text node truncation in general
        // The only thing that seems very clear is that the inserted text node should
        // be in the range, and it has to be at the start, since insertion always puts it at
        // the start.

        // Tim's note: I disagree with the conclusions the following tests draw from the spec, so they are removed
/*
        t.assert(!r.collapsed, "collapsed is wrong after insertion");
        t.assert(r.toString().match(/^ABCDE/), "range didn't start with the expected text; range stringified to '" + r.toString() + "'");
*/
    });

    // Mutation handling not yet implemented

/*    testBothRangeTypes("Acid3 test 13: Ranges under mutations: deletion", function(t, rangeCreator) {
        var doc = getTestDocument();
        var p = doc.createElement('p');
        p.appendChild(doc.createTextNode("12345"));
        doc.body.appendChild(p);
        var r = rangeCreator(doc);
        r.setEnd(doc.body, 1);
        r.setStart(p.firstChild, 2);
        t.assert(!r.collapsed, "collapsed is wrong at start");
        t.assertEquals(r.commonAncestorContainer, doc.body, "commonAncestorContainer is wrong at start");
        t.assertEquals(r.startContainer, p.firstChild, "startContainer is wrong at start");
        t.assertEquals(r.startOffset, 2, "startOffset is wrong at start");
        t.assertEquals(r.endContainer, doc.body, "endContainer is wrong at start");
        t.assertEquals(r.endOffset, 1, "endOffset is wrong at start");
        doc.body.removeChild(p);
        t.assert(r.collapsed, "collapsed is wrong after deletion");
        t.assertEquals(r.commonAncestorContainer, doc.body, "commonAncestorContainer is wrong after deletion");
        t.assertEquals(r.startContainer, doc.body, "startContainer is wrong after deletion");
        t.assertEquals(r.startOffset, 0, "startOffset is wrong after deletion");
        t.assertEquals(r.endContainer, doc.body, "endContainer is wrong after deletion");
        t.assertEquals(r.endOffset, 0, "endOffset is wrong after deletion");
    });*/
}, false);
