xn.test.suite("Text Range module tests", function(s) {
    var DomPosition = rangy.dom.DomPosition;
    var textRange = rangy.textRange;

    var el = document.createElement("div");
    el.innerHTML = "1  2";
    var textNodeSpacesCollapsed = (el.firstChild.length == 3);

    function testRangeBoundaries(t, range, startNode, startOffset, endNode, endOffset) {
        t.assertEquals(range.startContainer, startNode);
        t.assertEquals(range.startOffset, startOffset);
        t.assertEquals(range.endContainer, endNode);
        t.assertEquals(range.endOffset, endOffset);
    }

    function testCollapsedRangeBoundaries(t, range, startNode, startOffset) {
        t.assertEquals(range.startContainer, startNode);
        t.assertEquals(range.startOffset, startOffset);
        t.assert(range.collapsed);
    }

    s.setUp = function(t) {
        t.el = document.getElementById("test");
    };

    s.tearDown = function(t) {
        t.el.innerHTML = "";
        textRange.endTransaction();
    };

    s.test("Next/previous node tests", function(t) {
        var div0 = document.createElement("div");
        var text1_1 = div0.appendChild(document.createTextNode("1"));
        var b1 = div0.appendChild(document.createElement("b"));
        var text2 = b1.appendChild(document.createTextNode("2"));
        var i2 = b1.appendChild(document.createElement("i"));
        var text3 = i2.appendChild(document.createTextNode("3"));
        var text1_2 = div0.appendChild(document.createTextNode("1"));

        var nexts = [], next = div0;
        while ( (next = rangy.dom.nextNode(next)) ) {
            nexts.push(next);
        }

        t.assertArraysEquivalent(nexts, [text1_1, b1, text2, i2, text3, text1_2]);

        var previouses = [], previous = text1_2;
        while ( (previous = rangy.dom.previousNode(previous)) ) {
            previouses.push(previous);
        }

        t.assertArraysEquivalent(previouses.slice(0, 6), [text3, i2, text2, b1, text1_1, div0]);
    });

    s.test("nextPosition and previousPosition", function(t) {
        t.el.innerHTML = "<div>1<b>2<br><span></span>33</b>4</div>";

        var div = t.el.getElementsByTagName("div")[0];
        var text1 = div.firstChild;
        var b = text1.nextSibling;
        var t2 = b.firstChild;
        var br = t2.nextSibling;
        var span = br.nextSibling;
        var t3 = b.lastChild;
        var t4 = div.lastChild;

        var positions = [
            [div, 0],
            [text1, 0],
            [text1, 1],
            [div, 1],
            [b, 0],
            [t2, 0],
            [t2, 1],
            [b, 1],
            [b, 2],
            [span, 0],
            [b, 3],
            [t3, 0],
            [t3, 1],
            [t3, 2],
            [b, 4],
            [div, 2],
            [t4, 0],
            [t4, 1],
            [div, 3],
            [t.el, 1]
        ];

        var pos = textRange.createPosition(t.el, 0);

        // First forwards...
        for (var i = 0; i < positions.length; ++i) {
            pos = pos.next();
            t.assertEquals(pos.node, positions[i][0]);
            t.assertEquals(pos.offset, positions[i][1]);
        }

        // ... now backwards
        for (i = positions.length - 2; i >= 0; --i) {
            pos = pos.previous();
            t.assertEquals(pos.node, positions[i][0]);
            t.assertEquals(pos.offset, positions[i][1]);
        }
    });

    s.test("Visible position iteration", function(t) {
        t.el.innerHTML = '<div>1<b style="display: none">2<br></b><script>var foo = 1</script><span></span><br></div><div>2</div>';

        var div1 = t.el.getElementsByTagName("div")[0];
        var text1 = div1.firstChild;
        var b = text1.nextSibling;
        var br = t.el.getElementsByTagName("br")[0];
        var span = t.el.getElementsByTagName("span")[0];
        var div2 = t.el.getElementsByTagName("div")[1];
        var text2 = div2.firstChild;

        var positions = [
            [div1, 0],
            [text1, 0],
            [text1, 1],
            [div1, 1],
            [div1, 2],
            [div1, 3],
            [span, 0],
            [div1, 4],
            [div1, 5],
            [t.el, 1],
            [div2, 0],
            [text2, 0],
            [text2, 1],
            [div2, 1],
            [t.el, 2]
        ];

        var pos = textRange.createPosition(t.el, 0);

        // First forwards...
        for (var i = 0; i < positions.length; ++i) {
            pos = pos.nextVisible();
            t.assertEquals(pos.node, positions[i][0]);
            t.assertEquals(pos.offset, positions[i][1]);
        }

        // ... now backwards
        for (i = positions.length - 2; i >= 0; --i) {
            pos = pos.previousVisible();
            t.assertEquals(pos.node, positions[i][0]);
            t.assertEquals(pos.offset, positions[i][1]);
        }
    });

    s.test("innerText on simple text", function(t) {
        t.el.innerHTML = 'One Two';
        t.assertEquals(rangy.innerText(t.el), "One Two");
    });

    s.test("innerText on simple text with double space", function(t) {
        t.el.innerHTML = 'One  Two';
        t.assertEquals(rangy.innerText(t.el), "One Two");
    });

    s.test("innerText on simple text with triple space", function(t) {
        t.el.innerHTML = 'One   Two';
        t.assertEquals(rangy.innerText(t.el), "One Two");
    });

    s.test("innerText on simple text with non-breaking space", function(t) {
        t.el.innerHTML = 'One &nbsp; Two';
        t.assertEquals(rangy.innerText(t.el), "One \u00a0 Two");
    });

    s.test("innerText on simple text with leading space", function(t) {
        t.el.innerHTML = ' One Two';
        t.assertEquals(rangy.innerText(t.el), "One Two");
    });

    s.test("innerText on paragraph with trailing space (includeBlockContentTrailingSpace true)", function(t) {
        t.el.innerHTML = '<div>x </div><div>y</div>';
        t.assertEquals(rangy.innerText(t.el, {
            includeBlockContentTrailingSpace: true
        }), "x \ny");
    });

    s.test("innerText on paragraph with trailing space (includeBlockContentTrailingSpace false)", function(t) {
        t.el.innerHTML = '<div>x </div><div>y</div>';
        t.assertEquals(rangy.innerText(t.el, {
            includeBlockContentTrailingSpace: false
        }), "x\ny");
    });

    s.test("innerText on paragraph containing br preceded by space (includeSpaceBeforeBr true)", function(t) {
        t.el.innerHTML = '<div>x <br>y</div>';
        t.assertEquals(rangy.innerText(t.el, {
            includeSpaceBeforeBr: true
        }), "x \ny");
    });

    s.test("innerText on paragraph containing br preceded by space (includeSpaceBeforeBr false)", function(t) {
        t.el.innerHTML = '<div>x <br>y</div>';
        t.assertEquals(rangy.innerText(t.el, {
            includeSpaceBeforeBr: false
        }), "x\ny");
    });

    s.test("innerText on paragraph containing br preceded by two spaces (includeSpaceBeforeBr true)", function(t) {
        t.el.innerHTML = '<div>x  <br>y</div>';
        t.assertEquals(rangy.innerText(t.el, {
            includeSpaceBeforeBr: true
        }), "x \ny");
    });

    s.test("innerText on paragraph containing br preceded by two spaces (includeSpaceBeforeBr false)", function(t) {
        t.el.innerHTML = '<div>x  <br>y</div>';
        t.assertEquals(rangy.innerText(t.el, {
            includeSpaceBeforeBr: false
        }), "x\ny");
    });

    s.test("innerText on simple text with two trailing spaces (includeBlockContentTrailingSpace true)", function(t) {
        t.el.innerHTML = '1  ';
        t.assertEquals(rangy.innerText(t.el, {
            includeBlockContentTrailingSpace: true
        }), "1 ");
    });

    s.test("innerText on simple text with two trailing spaces (includeBlockContentTrailingSpace false)", function(t) {
        t.el.innerHTML = '1  ';
        t.assertEquals(rangy.innerText(t.el, {
            includeBlockContentTrailingSpace: false
        }), "1");
    });

    s.test("innerText on simple text with leading space in span", function(t) {
        t.el.innerHTML = '<span> </span>One Two';
        t.assertEquals(rangy.innerText(t.el), "One Two");
    });

    s.test("innerText on simple text with trailing space in span (includeBlockContentTrailingSpace true)", function(t) {
        t.el.innerHTML = 'One Two<span> </span>';
        t.assertEquals(rangy.innerText(t.el, {
            includeBlockContentTrailingSpace: true
        }), "One Two ");
    });

    s.test("innerText on simple text with trailing space in span (includeBlockContentTrailingSpace false)", function(t) {
        t.el.innerHTML = 'One Two<span> </span>';
        t.assertEquals(rangy.innerText(t.el, {
            includeBlockContentTrailingSpace: false
        }), "One Two");
    });

    s.test("innerText on simple text with non-breaking space in span", function(t) {
        t.el.innerHTML = '1 <span>&nbsp; </span>2';
        t.assertEquals(rangy.innerText(t.el), "1 \u00a0 2");
    });

    s.test("innerText on simple text with non-breaking space in span 2", function(t) {
        t.el.innerHTML = '1<span> &nbsp; </span>2';
        t.assertEquals(rangy.innerText(t.el), "1 \u00a0 2");
    });

    s.test("innerText on simple text with non-breaking space in span 3", function(t) {
        t.el.innerHTML = '1<span> &nbsp;</span> 2';
        t.assertEquals(rangy.innerText(t.el), "1 \u00a0 2");
    });

    s.test("innerText on one paragraph", function(t) {
        t.el.innerHTML = '<p>1</p>';
        t.assertEquals(rangy.innerText(t.el), "1");
    });

    s.test("innerText on two paragraphs", function(t) {
        t.el.innerHTML = '<p>1</p><p>2</p>';
        t.assertEquals(rangy.innerText(t.el), "1\n2");
    });

    s.test("innerText on two paragraphs separated by one line break", function(t) {
        t.el.innerHTML = '<p>x</p>\n<p>y</p>';
        t.assertEquals(rangy.innerText(t.el), "x\ny");
    });

    s.test("innerText on two paragraphs separated by two line breaks", function(t) {
        t.el.innerHTML = '<p>x</p>\n\n<p>y</p>';
        t.assertEquals(rangy.innerText(t.el), "x\ny");
    });

    s.test("innerText on two paragraphs with container", function(t) {
        t.el.innerHTML = '<div><p>1</p><p>2</p></div>';
        t.assertEquals(rangy.innerText(t.el), "1\n2");
    });

    s.test("innerText on table", function(t) {
        t.el.innerHTML = '<table><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>';
        t.assertEquals(rangy.innerText(t.el), "1\t2\n3\t4");
    });

    s.test("innerText with hidden p element", function(t) {
        t.el.innerHTML = '<p>1</p><p style="display: none">2</p><p>3</p>';
        t.assertEquals(rangy.innerText(t.el), "1\n3");
    });

    s.test("innerText with invisible p", function(t) {
        t.el.innerHTML = '<p>1</p><p style="visibility: hidden">2</p><p>3</p>';
        t.assertEquals(rangy.innerText(t.el), "1\n3");
    });

    s.test("innerText on paragraph with uncollapsed br", function(t) {
        t.el.innerHTML = '<p>1<br>2</p>';
        t.assertEquals(rangy.innerText(t.el), "1\n2");
    });

    s.test("innerText on paragraph with two uncollapsed brs", function(t) {
        t.el.innerHTML = '<p>1<br><br>2</p>';
        t.assertEquals(rangy.innerText(t.el), "1\n\n2");
    });

    s.test("innerText on paragraph with uncollapsed br preceded by space", function(t) {
        t.el.innerHTML = '<p>1 <br>2</p>';
        t.assertEquals(rangy.innerText(t.el), "1\n2");
    });

    s.test("innerText on two paragraphs with collapsed br", function(t) {
        t.el.innerHTML = '<p>1<br></p><p>2</p>';
        t.assertEquals(rangy.innerText(t.el), "1\n2");
    });

    s.test("innerText one paragraph with collapsed br ", function(t) {
        t.el.innerHTML = '<p>1<br></p>';
        t.assertEquals(rangy.innerText(t.el), "1");
    });

    s.test("innerText on empty element", function(t) {
        t.el.innerHTML = '';
        t.assertEquals(rangy.innerText(t.el), "");
    });

    s.test("innerText on text node followed by block element", function(t) {
        t.el.innerHTML = '1<div>2</div>';
        t.assertEquals(rangy.innerText(t.el), "1\n2");
    });

    s.test("innerText on two consecutive block elements", function(t) {
        t.el.innerHTML = '<div>1</div><div>2</div>';
        t.assertEquals(rangy.innerText(t.el), "1\n2");
    });

    s.test("innerText on two block elements separated by a space", function(t) {
        t.el.innerHTML = '<div>1</div> <div>2</div>';
        t.assertEquals(rangy.innerText(t.el), "1\n2");
    });

    s.test("innerText() on block element with leading space", function(t) {
        t.el.innerHTML = '<p contenteditable="true"> One</p>';
        var p = t.el.getElementsByTagName("p")[0];
        t.assertEquals(rangy.innerText(p), "One");
    });

    s.test("innerText() on block element with leading space following block element", function(t) {
        t.el.innerHTML = '<div>1</div><div> 2</div>';
        t.assertEquals(rangy.innerText(t.el), "1\n2");
    });

    s.test("innerText() on block element with leading space following block element and a space", function(t) {
        t.el.innerHTML = '<div>1</div> <div> 2</div>';
        t.assertEquals(rangy.innerText(t.el), "1\n2");
    });

    s.test("innerText() on block element with leading space and preceding text", function(t) {
        t.el.innerHTML = '1<p contenteditable="true"> One</p>';
        var p = t.el.getElementsByTagName("p")[0];
        t.assertEquals(rangy.innerText(p), "One");
    });

    s.test("range text() on collapsed range", function(t) {
        t.el.innerHTML = '12345';
        var textNode = t.el.firstChild;
        var range = rangy.createRange();
        range.collapseToPoint(textNode, 1);
        t.assertEquals(range.text(), "");
    });

    s.test("range text() on empty range", function(t) {
        t.el.innerHTML = '<span style="display: none">one</span>';
        var textNode = t.el.firstChild;
        var range = rangy.createRange();
        range.selectNodeContents(t.el);
        t.assertEquals(range.text(), "");
    });

    s.test("range text() on simple text", function(t) {
        t.el.innerHTML = '12345';
        var textNode = t.el.firstChild;
        var range = rangy.createRange();
        range.selectNodeContents(t.el);
        t.assertEquals(range.text(), "12345");

        range.setStart(textNode, 1);
        range.setEnd(textNode, 4);
        t.assertEquals(range.text(), "234");
    });

    if (!textNodeSpacesCollapsed) {
        s.test("range text() on simple text with double space", function(t) {
            t.el.innerHTML = '12  34';
            var textNode = t.el.firstChild;
            var range = rangy.createRange();
            range.setStart(textNode, 1);
            range.setEnd(textNode, 5);
            t.assertEquals(range.text(), "2 3");
        });
    }


}, false);
