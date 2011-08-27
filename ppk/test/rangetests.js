function testRangeCreator(rangeCreator, name, doc) {
    xn.test.suite(name + ": core DOM", function(s) {
        s.setUp = function(t) {
            t.range = rangeCreator();
            t.el = doc.body.appendChild(doc.createElement("div"));
        };

        s.tearDown = function(t) {
            try {
                t.range.detach();
            } catch (ex) {};

            t.el.parentNode.removeChild(t.el);
            t.el = null;
        };

        s.test("Initial range state", function(t) {
            t.assertEquivalent(t.range.startContainer, document);
            t.assertEquivalent(t.range.endContainer, document);
            t.assertEquivalent(t.range.startOffset, 0);
            t.assertEquivalent(t.range.endOffset, 0);
            t.assertEquivalent(t.range.commonAncestorContainer, document);
            t.assertEquivalent(t.range.collapsed, true);
        });

        s.test("Constants", function(t) {
            t.assertEquivalent(t.range.START_TO_START, 0);
            t.assertEquivalent(t.range.START_TO_END, 1);
            t.assertEquivalent(t.range.END_TO_END, 2);
            t.assertEquivalent(t.range.END_TO_START, 3);
        });

        s.test("setStart", function(t) {
            var textNode = t.el.appendChild(doc.createTextNode("Test"));
            t.range.setStart(textNode, 1);

            t.assertEquivalent(t.range.startContainer, textNode);
            t.assertEquivalent(t.range.startOffset, 1);
            t.assertEquivalent(t.range.endContainer, textNode);
            t.assertEquivalent(t.range.endOffset, 1);
            t.assertEquivalent(t.range.commonAncestorContainer, textNode);
            t.assertTrue(t.range.collapsed);

            t.range.detach();
            t.assertError(function() {
                var s = t.range.startContainer;
            });
        });

    });

}
