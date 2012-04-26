xn.test.suite("Text Range module tests", function(s) {
    var DomPosition = rangy.dom.DomPosition;
    var textRange = rangy.textRange;

    var el = document.createElement("div");
    el.innerHTML = "1  2";
    var textNodeSpacesCollapsed = (el.firstChild.length == 3);

    s.setUp = function(t) {
        t.el = document.getElementById("test");
    };

    s.tearDown = function(t) {
        t.el.innerHTML = "";
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

        var pos = new DomPosition(t.el, 0);

        // First forwards...
        for (var i = 0; i < positions.length; ++i) {
            pos = textRange.nextPosition(pos);
            t.assertEquals(pos.node, positions[i][0]);
            t.assertEquals(pos.offset, positions[i][1]);
        }

        // ... now backwards
        for (i = positions.length - 2; i >= 0; --i) {
            pos = textRange.previousPosition(pos);
            t.assertEquals(pos.node, positions[i][0]);
            t.assertEquals(pos.offset, positions[i][1]);
        }
    });

    s.test("isCollapsedWhitespaceNode", function(t) {
        t.el.innerHTML = '<div>1</div> <div>2</div>';
        if (t.el.childNodes[1].nodeType == 3) {
            t.assert(rangy.textRange.isCollapsedWhitespaceNode(t.el.childNodes[1]));

        } else {
            // IE < 9 case
            t.assertEquals(t.el.childNodes.length, 2);
        }
    });

    s.test("VisiblePositionIterator", function(t) {
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

        var pos = new DomPosition(t.el, 0);

        // First forwards...
        for (var i = 0; i < positions.length; ++i) {
            pos = textRange.nextVisiblePosition(pos);
            t.assertEquals(pos.node, positions[i][0]);
            t.assertEquals(pos.offset, positions[i][1]);
        }

        // ... now backwards
        for (i = positions.length - 2; i >= 0; --i) {
            pos = textRange.previousVisiblePosition(pos);
            t.assertEquals(pos.node, positions[i][0]);
            t.assertEquals(pos.offset, positions[i][1]);
        }
    });

    s.test("hasInnerText", function(t) {
        t.el.innerHTML = '<div></div><div> </div><div>1</div><div style="display: none">2</div><div class="xn_test_hidden">3</div>';
        var divs = t.el.getElementsByTagName("div");
        t.assertFalse(rangy.dom.hasInnerText(divs[0]));
        t.assertFalse(rangy.dom.hasInnerText(divs[1]));
        t.assertTrue(rangy.dom.hasInnerText(divs[2]));
        t.assertFalse(rangy.dom.hasInnerText(divs[3]));
        t.assertFalse(rangy.dom.hasInnerText(divs[4]));
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

    s.test("innerText on simple text with trailing space", function(t) {
        t.el.innerHTML = 'One Two ';
        t.assertEquals(rangy.innerText(t.el), "One Two");
    });

    s.test("innerText on simple text with two trailing spaces", function(t) {
        t.el.innerHTML = '1  ';
        t.assertEquals(rangy.innerText(t.el), "1");
    });

    s.test("innerText on simple text with leading space in span", function(t) {
        t.el.innerHTML = '<span> </span>One Two';
        t.assertEquals(rangy.innerText(t.el), "One Two");
    });

    s.test("innerText on simple text with trailing space in span", function(t) {
        t.el.innerHTML = 'One Two<span> </span>';
        t.assertEquals(rangy.innerText(t.el), "One Two");
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

    s.test("innerText on two paragraphs", function(t) {
        t.el.innerHTML = '<p>1</p><p>2</p>';
        t.assertEquals(rangy.innerText(t.el), "1\n2");
    });

    s.test("innerText on two paragraphs separated by spaces", function(t) {
        t.el.innerHTML = '<p>1</p>\n<p>2</p>';
        t.assertEquals(rangy.innerText(t.el), "1\n2");
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

    s.test("selectCharacters on text node", function(t) {
        t.el.innerHTML = 'One Two';
        var range = rangy.createRange();
        var textNode = t.el.firstChild;

        range.selectCharacters(t.el, 2, 5);
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 2);
        t.assertEquals(range.endContainer, textNode);
        t.assertEquals(range.endOffset, 5);
        t.assertEquals(range.text(), "e T");
    });

    if (!textNodeSpacesCollapsed) {
        s.test("selectCharacters on text node with double space", function(t) {
            t.el.innerHTML = 'One  Two';
            var range = rangy.createRange();
            var textNode = t.el.firstChild;

            range.selectCharacters(t.el, 2, 5);
            t.assertEquals(range.startContainer, textNode);
            t.assertEquals(range.startOffset, 2);
            t.assertEquals(range.endContainer, textNode);
            t.assertEquals(range.endOffset, 6);
            t.assertEquals(range.text(), "e T");
        });
    }

    if (!textNodeSpacesCollapsed) {
        s.test("toCharacterRange in text node with collapsed spaces", function(t) {
            t.el.innerHTML = ' One  Two';
            var range = rangy.createRange();
            var textNode = t.el.firstChild;

            range.setStart(textNode, 3);
            range.setEnd(textNode, 7);

            var charRange = range.toCharacterRange(t.el);
            t.assertEquals(charRange.start, 2);
            t.assertEquals(charRange.end, 5);
        });
    }

    s.test("moveStart on text node", function(t) {
        t.el.innerHTML = 'One Two';
        var range = rangy.createRange();
        range.selectNodeContents(t.el);

        var charsMoved = range.moveStart("character", 2);
        t.assertEquals(charsMoved, 2);
        t.assertEquals(range.startContainer, t.el.firstChild);
        t.assertEquals(range.startOffset, 2);
        t.assertEquals(range.text(), "e Two");

        charsMoved = range.moveStart("character", 2);
        t.assertEquals(charsMoved, 2);
        t.assertEquals(range.startContainer, t.el.firstChild);
        t.assertEquals(range.startOffset, 4);
        t.assertEquals(range.text(), "Two");
    });

    s.test("moveStart with no unit on text node", function(t) {
        t.el.innerHTML = 'One Two';
        var range = rangy.createRange();
        range.selectNodeContents(t.el);

        var charsMoved = range.moveStart(2);
        t.assertEquals(charsMoved, 2);
        t.assertEquals(range.startContainer, t.el.firstChild);
        t.assertEquals(range.startOffset, 2);
        t.assertEquals(range.text(), "e Two");

        charsMoved = range.moveStart(2);
        t.assertEquals(charsMoved, 2);
        t.assertEquals(range.startContainer, t.el.firstChild);
        t.assertEquals(range.startOffset, 4);
        t.assertEquals(range.text(), "Two");
    });

    s.test("moveStart on text node, negative move", function(t) {
        t.el.innerHTML = 'One Two';
        var range = rangy.createRange();
        var textNode = t.el.firstChild;
        range.collapseToPoint(textNode, 7);

        var charsMoved = range.moveStart("character", -2);
        t.assertEquals(charsMoved, -2);
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 5);
        t.assertEquals(range.text(), "wo");

        charsMoved = range.moveStart("character", -2);
        t.assertEquals(charsMoved, -2);
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 3);
        t.assertEquals(range.text(), " Two");
    });

    s.test("moveEnd on text node", function(t) {
        t.el.innerHTML = 'One Two';
        var range = rangy.createRange();
        var textNode = t.el.firstChild;
        range.selectNodeContents(textNode);

        var charsMoved = range.moveEnd("character", -2);
        t.assertEquals(charsMoved, -2);
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 0);
        t.assertEquals(range.endContainer, textNode);
        t.assertEquals(range.endOffset, 5);
        t.assertEquals(range.text(), "One T");

        charsMoved = range.moveEnd("character", -2);
        t.assertEquals(charsMoved, -2);
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 0);
        t.assertEquals(range.endContainer, textNode);
        t.assertEquals(range.endOffset, 3);
        t.assertEquals(range.text(), "One");
    });

    s.test("moveEnd with no unit on text node", function(t) {
        t.el.innerHTML = 'One Two';
        var range = rangy.createRange();
        var textNode = t.el.firstChild;
        range.selectNodeContents(textNode);

        var charsMoved = range.moveEnd(-2);
        t.assertEquals(charsMoved, -2);
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 0);
        t.assertEquals(range.endContainer, textNode);
        t.assertEquals(range.endOffset, 5);
        t.assertEquals(range.text(), "One T");

        charsMoved = range.moveEnd(-2);
        t.assertEquals(charsMoved, -2);
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 0);
        t.assertEquals(range.endContainer, textNode);
        t.assertEquals(range.endOffset, 3);
        t.assertEquals(range.text(), "One");
    });

    s.test("moveStart, moveEnd words on text node", function(t) {
        t.el.innerHTML = 'one two three';
        var textNode = t.el.firstChild;
        var range = rangy.createRange();
        range.setStart(textNode, 5);
        range.setEnd(textNode, 6);

        var wordsMoved = range.moveStart("word", -1);
        t.assertEquals(wordsMoved, -1);
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 4);
        t.assertEquals(range.endContainer, textNode);
        t.assertEquals(range.endOffset, 6);
        t.assertEquals(range.text(), "tw");

        wordsMoved = range.moveEnd("word", 1);
        t.assertEquals(wordsMoved, 1);
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 4);
        t.assertEquals(range.endContainer, textNode);
        t.assertEquals(range.endOffset, 7);
        t.assertEquals(range.text(), "two");
    });

    s.test("moveStart words with apostrophe on text node", function(t) {
        t.el.innerHTML = "one don't two";
        var textNode = t.el.firstChild;
        var range = rangy.createRange();
        range.setStart(textNode, 5);
        range.setEnd(textNode, 9);

        var wordsMoved = range.moveStart("word", -1);
        t.assertEquals(wordsMoved, -1);
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 4);
        t.assertEquals(range.endContainer, textNode);
        t.assertEquals(range.endOffset, 9);
        t.assertEquals(range.text(), "don't");

        wordsMoved = range.moveEnd("word", 1);
        t.assertEquals(wordsMoved, 1);
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 4);
        t.assertEquals(range.endContainer, textNode);
        t.assertEquals(range.endOffset, 13);
        t.assertEquals(range.text(), "don't two");
    });

    s.test("moveStart words on text node", function(t) {
        t.el.innerHTML = 'one two three';
        var textNode = t.el.firstChild;
        var range = rangy.createRange();
        range.collapseToPoint(textNode, 1);

        var wordsMoved = range.moveStart("word", 1);

        t.assertEquals(wordsMoved, 1);
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 3);
        t.assert(range.collapsed);
        //t.assertEquals(range.text(), "");

        wordsMoved = range.moveStart("word", 1);
        t.assertEquals(wordsMoved, 1);
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 7);
        //t.assertEquals(range.text(), "");

        wordsMoved = range.moveStart("word", 1);
        t.assertEquals(wordsMoved, 1);
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 13);
        //t.assertEquals(range.text(), "");
    });

    s.test("moveEnd negative words on text node", function(t) {
        t.el.innerHTML = 'one two three';
        var textNode = t.el.firstChild;
        var range = rangy.createRange();
        range.collapseToPoint(textNode, 9);

        var wordsMoved = range.moveEnd("word", -1);

        t.assertEquals(wordsMoved, -1);
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 8);
        t.assert(range.collapsed);

        wordsMoved = range.moveEnd("word", -1);
        t.assertEquals(wordsMoved, -1);
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 4);
        //t.assertEquals(range.text(), "");

        wordsMoved = range.moveEnd("word", -1);
        t.assertEquals(wordsMoved, -1);
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 0);
        //t.assertEquals(range.text(), "");
    });

    s.test("moveStart two words on text node", function(t) {
        t.el.innerHTML = 'one two three';
        var textNode = t.el.firstChild;
        var range = rangy.createRange();
        range.collapseToPoint(textNode, 1);

        var wordsMoved = range.moveStart("word", 2);
        t.assertEquals(wordsMoved, 2);
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 7);
        t.assert(range.collapsed);
        t.assertEquals(range.text(), "");
    });

    s.test("moveEnd including trailing space on text node", function(t) {
        t.el.innerHTML = 'one two. three';
        var textNode = t.el.firstChild;
        var range = rangy.createRange();
        range.collapseToPoint(textNode, 0);

        var wordsMoved = range.moveEnd("word", 1, { includeTrailingSpace: true });
        t.assertEquals(wordsMoved, 1);
        t.assertEquals(range.endContainer, textNode);
        t.assertEquals(range.endOffset, 4);
        t.assertEquals(range.text(), "one ");

        wordsMoved = range.moveEnd("word", 1, { includeTrailingSpace: true });
        t.assertEquals(wordsMoved, 1);
        t.assertEquals(range.endContainer, textNode);
        t.assertEquals(range.endOffset, 7);
        t.assertEquals(range.text(), "one two");

        wordsMoved = range.moveEnd("word", 1, { includeTrailingSpace: true });
        t.assertEquals(wordsMoved, 1);
        t.assertEquals(range.endContainer, textNode);
        t.assertEquals(range.endOffset, 14);
        t.assertEquals(range.text(), "one two. three");
    });

    s.test("moveEnd including trailing punctuation on text node", function(t) {
        t.el.innerHTML = 'one!! two!! three!! four!!';
        var textNode = t.el.firstChild;
        var range = rangy.createRange();
        range.collapseToPoint(textNode, 0);

        var wordsMoved = range.moveEnd("word", 1, { includeTrailingPunctuation: true });
        t.assertEquals(wordsMoved, 1);
        t.assertEquals(range.endContainer, textNode);
        t.assertEquals(range.endOffset, 5);
        t.assertEquals(range.text(), "one!!");

        wordsMoved = range.moveEnd("word", 1, { includeTrailingPunctuation: true, includeTrailingSpace: true });
        t.assertEquals(wordsMoved, 1);
        t.assertEquals(range.endContainer, textNode);
        t.assertEquals(range.endOffset, 12);
        t.assertEquals(range.text(), "one!! two!! ");

        wordsMoved = range.moveEnd("word", 1, { includeTrailingSpace: true });
        t.assertEquals(wordsMoved, 1);
        t.assertEquals(range.endContainer, textNode);
        t.assertEquals(range.endOffset, 17);
        t.assertEquals(range.text(), "one!! two!! three");

        wordsMoved = range.moveEnd("word", 1, { includeTrailingPunctuation: true });
        t.assertEquals(wordsMoved, 1);
        t.assertEquals(range.endContainer, textNode);
        t.assertEquals(range.endOffset, 26);
        t.assertEquals(range.text(), "one!! two!! three!! four!!");
    });

    s.test("moveStart characters with br", function(t) {
        t.el.innerHTML = '1<br>2';
        var textNode1 = t.el.firstChild, textNode2 = t.el.lastChild;
        var range = rangy.createRange();
        range.collapseToPoint(textNode1, 0);

        var charsMoved = range.moveStart("character", 1);
        t.assertEquals(charsMoved, 1);
        t.assertEquals(range.startContainer, textNode1);
        t.assertEquals(range.startOffset, 1);
        t.assert(range.collapsed);

        charsMoved = range.moveStart("character", 1);
        t.assertEquals(charsMoved, 1);
        t.assertEquals(range.startContainer, t.el);
        t.assertEquals(range.startOffset, 2);
        t.assert(range.collapsed);


        charsMoved = range.moveStart("character", 1);
        t.assertEquals(charsMoved, 1);
        t.assertEquals(range.startContainer, textNode2);
        t.assertEquals(range.startOffset, 1);
        t.assert(range.collapsed);
    });

    s.test("expand in text node", function(t) {
        t.el.innerHTML = 'One two three';
        var textNode = t.el.firstChild;
        var range = rangy.createRange();
        range.setStart(textNode, 5);
        range.setEnd(textNode, 6);

        t.assert(range.expand("word"));
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 4);
        t.assertEquals(range.endContainer, textNode);
        t.assertEquals(range.endOffset, 7);
    });

    s.test("expand in text node, include trailing space", function(t) {
        t.el.innerHTML = 'One two three';
        var textNode = t.el.firstChild;
        var range = rangy.createRange();
        range.collapseToPoint(textNode, 5);

        t.assert(range.expand("word", { includeTrailingSpace: true }));
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 4);
        t.assertEquals(range.endContainer, textNode);
        t.assertEquals(range.endOffset, 8);
    });


    s.test("expand in text node, start of word", function(t) {
        t.el.innerHTML = 'One two three';
        var textNode = t.el.firstChild;
        var range = rangy.createRange();
        range.collapseToPoint(textNode, 4);

        t.assert(range.expand("word"));
        t.assertEquals(range.startContainer, textNode);
        t.assertEquals(range.startOffset, 4);
        t.assertEquals(range.endContainer, textNode);
        t.assertEquals(range.endOffset, 7);
    });

}, false);
