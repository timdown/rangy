xn.test.suite("Commands module tests", function(s) {
    /*
    http://aryeh.name/spec/editcommands/autoimplementation.html

     */

    s.tearDown = function() {
        document.getElementById("test").innerHTML = "";
    };

    function iterateNodes(node, func, includeSelf) {
        if (includeSelf) {
            func(node);
        }
        for (var i = 0, children = node.childNodes, len = children.length; i < len; ++i) {
            iterateNodes(children[i], func, true);
        }
    }

    function RangeInfo() {}

    RangeInfo.prototype = {
        setStart: function(node, offset) {
            this.sc = node;
            this.so = offset;
        },
        setEnd: function(node, offset) {
            this.ec = node;
            this.eo = offset;
        }
    };

    function createRangeInHtml(containerEl, html) {
        containerEl.innerHTML = html;
        var range = rangy.createRange(), foundStart = false;
        var rangeInfo = new RangeInfo();
        iterateNodes(containerEl, function(node) {
            if (node.nodeType == 3) {
                var openBracketIndex = node.data.indexOf("[");
                if (openBracketIndex != -1) {
                    node.data = node.data.slice(0, openBracketIndex) + node.data.slice(openBracketIndex + 1);
                    log.debug("openBraceIndex: " + openBracketIndex + ", data: " + node.data);
                    rangeInfo.setStart(node, openBracketIndex);
                    foundStart = true;
                }

                var pipeIndex = node.data.indexOf("|");
                if (pipeIndex == 0) {
                    node.data = node.data.slice(1);
                    rangeInfo[foundStart ? "setEnd" : "setStart"](node.parentNode, rangy.dom.getNodeIndex(node));
                    foundStart = true;
                } else if (pipeIndex == node.length - 1) {
                    node.data = node.data.slice(0, -1);
                    rangeInfo[foundStart ? "setEnd" : "setStart"](node.parentNode, rangy.dom.getNodeIndex(node) + 1);
                    foundStart = true;
                }

                var closeBracketIndex = node.data.indexOf("]");
                if (closeBracketIndex != -1) {
                    node.data = node.data.slice(0, closeBracketIndex) + node.data.slice(closeBracketIndex + 1);
                    log.debug("openBraceIndex: " + openBracketIndex + ", data: " + node.data);
                    rangeInfo.setEnd(node, closeBracketIndex);
                }

                pipeIndex = node.data.indexOf("|");
                if (pipeIndex == 0) {
                    node.data = node.data.slice(1);
                    rangeInfo.setEnd(node.parentNode, rangy.dom.getNodeIndex(node));
                } else if (pipeIndex == node.length - 1) {
                    node.data = node.data.slice(0, -1);
                    rangeInfo.setEnd(node.parentNode, rangy.dom.getNodeIndex(node) + 1);
                }

                // Clear empty text node
                if (node.data.length == 0) {
                    node.parentNode.removeChild(node);
                }
            }
        }, false);

        range.setStart(rangeInfo.sc, rangeInfo.so);
        range.setEnd(rangeInfo.ec, rangeInfo.eo);

        return range;
    }

    function getSortedClassName(el) {
        return el.className.split(/\s+/).sort().join(" ");
    }

    function htmlAndRangeToString(containerEl, range) {
        function isElementRangeBoundary(el, offset, range, isStart) {
            var prefix = isStart ? "start" : "end";
            return (el == range[prefix + "Container"] && offset == range[prefix + "Offset"]);
        }

        function getHtml(node, includeSelf) {
            var html = "";
            if (node.nodeType == 1) {
                if (includeSelf) {
                    html = "<" + node.tagName.toLowerCase();
                    if (node.id) {
                        html += ' id="' + node.id + '"';
                    }
                    if (node.className) {
                        html += ' class="' + getSortedClassName(node) + '"';
                    }
                    html += ">";
                }

                for (var i = 0, children = node.childNodes, len = children.length; i <= len; ++i) {
                    if (isElementRangeBoundary(node, i, range, true)) {
                        html += "|";
                    }
                    if (isElementRangeBoundary(node, i, range, false)) {
                        html += "|";
                    }
                    if (i != len) {
                        html += getHtml(children[i], true);
                    }
                }

                if (includeSelf) {
                    html += "</" + node.tagName.toLowerCase() + ">";
                }
            } else if (includeSelf && node.nodeType == 3) {
                var text = node.data;
                if (node == range.endContainer) {
                    text = text.slice(0, range.endOffset) + "]" + text.slice(range.endOffset);
                }
                if (node == range.startContainer) {
                    text = text.slice(0, range.startOffset) + "[" + text.slice(range.startOffset);
                }

                html += text;
            }
            return html;
        }

        return getHtml(containerEl, false);
    }

    function testRangeHtml(testEl, html, t) {
        var range = createRangeInHtml(testEl, html);
        log.info("Range: " + range.inspect());
        var newHtml = htmlAndRangeToString(testEl, range);
        t.assertEquals(html, newHtml);
    }


    s.test("Test the Range/HTML test functions", function(t) {
        var testEl = document.getElementById("test");
        testRangeHtml(testEl, 'Before <span class="test">[One]</span> after', t);
        testRangeHtml(testEl, 'Before <span class="test">|On]e</span> after', t);
        testRangeHtml(testEl, 'Before <span class="test">|One|</span> after', t);
        testRangeHtml(testEl, 'Bef[ore <span class="test">One</span> af]ter', t);
        testRangeHtml(testEl, 'Bef[ore <span class="test">|One</span> after', t);
        testRangeHtml(testEl, '1[2]3', t);
    });

    function testModifiableElement(name, element, html, isModifiable) {
        s.test("Modifiable element " + name, function(t) {
            t.assertEquals(rangy.Command.util.isModifiableElement(element), isModifiable);
        });

        s.test("Modifiable element " + name + " (HTML)", function(t) {
            var container = rangy.dom.getDocument(element).createElement("div");
            container.innerHTML = html;
            t.assertEquals(rangy.Command.util.isModifiableElement(container.firstChild), isModifiable);
        });
    }

    function testSimpleModifiableElement(name, element, html, isModifiable) {
        s.test("Simple modifiable element " + name, function(t) {
            t.assertEquals(rangy.Command.util.isSimpleModifiableElement(element), isModifiable);
        });

        s.test("Simple modifiable element " + name + " (HTML)", function(t) {
            var container = rangy.dom.getDocument(element).createElement("div");
            container.innerHTML = html;
            t.assertEquals(rangy.Command.util.isSimpleModifiableElement(container.firstChild), isModifiable);
        });
    }

    function testDocument(doc) {
        var el = doc.createElement("span");
        el.setAttribute("style", "border: solid green 1px; padding: 2px");
        testModifiableElement("span with style", el, '<span style="border: solid green 1px; padding: 2px"></span>', true);

        el = doc.createElement("span");
        el.setAttribute("style", "border: solid green 1px; padding: 2px");
        el.className = "test";
        testModifiableElement("span with style and class", el, '<span class="test" style="border: solid green 1px; padding: 2px"></span>', false);

        el = doc.createElement("span");
        testSimpleModifiableElement("span with no attributes", el, '<span></span>', true);

        el = doc.createElement("em");
        testSimpleModifiableElement("em with no attributes", el, '<em></em>', true);

        el = doc.createElement("label");
        testSimpleModifiableElement("label with no attributes", el, '<label></label>', false);

        el = doc.createElement("span");
        el.setAttribute("style", "");
        testSimpleModifiableElement("span with empty style attribute", el, '<span></span>', true);

        el = doc.createElement("a");
        el.setAttribute("href", "http://www.timdown.co.uk/")
        testSimpleModifiableElement("a with href attribute", el, '<a href="http://www.timdown.co.uk/"></a>', true);

        el = doc.createElement("a");
        el.href = "http://www.timdown.co.uk/";
        testSimpleModifiableElement("a with href attribute set via property", el, '<a href="http://www.timdown.co.uk/"></a>', true);

/*
        el = doc.createElement("a");
        el.setAttribute("name", "test");
        testSimpleModifiableElement("a with name attribute", el, '<a name="test"></a>', false);

        el = doc.createElement("a");
        el.name = "test";
        testSimpleModifiableElement("a with name attribute set via property", el, '<a name="test"></a>', false);
*/

        el = doc.createElement("a");
        el.setAttribute("id", "test");
        testSimpleModifiableElement("a with id attribute", el, '<a id="test"></a>', false);

        el = doc.createElement("a");
        el.id = "test";
        testSimpleModifiableElement("a with id attribute set via property", el, '<a id="test"></a>', false);

        el = doc.createElement("font");
        el.setAttribute("face", "Serif");
        testSimpleModifiableElement("font with face attribute", el, '<font face="Serif"></font>', true);

        el = doc.createElement("font");
        el.face = "Serif";
        testSimpleModifiableElement("font with face attribute set via property", el, '<font face="Serif"></font>', true);

        el = doc.createElement("font");
        el.setAttribute("color", "#ff000");
        testSimpleModifiableElement("font with color attribute", el, '<font color="#ff000"></font>', true);

        el = doc.createElement("font");
        el.color = "#ff000";
        testSimpleModifiableElement("font with color attribute set via property", el, '<font color="#ff000"></font>', true);

        el = doc.createElement("font");
        el.setAttribute("size", "5");
        testSimpleModifiableElement("font with size attribute", el, '<font size="5"></font>', true);

        el = doc.createElement("font");
        el.size = "5";
        testSimpleModifiableElement("font with size attribute set via property", el, '<font size="5"></font>', true);

        el = doc.createElement("font");
        el.setAttribute("size", "5");
        el.setAttribute("color", "#ff000");
        testSimpleModifiableElement("font with size and color attributes", el, '<font size="5" color="#ff0000"></font>', false);

        el = doc.createElement("em");
        el.style.fontStyle = "normal";
        testSimpleModifiableElement("em with font-style normal", el, '<em style="font-style: normal"></em>', true);

        el = doc.createElement("em");
        el.style.fontWeight = "normal";
        testSimpleModifiableElement("em with font-weight normal", el, '<em style="font-weight: normal"></em>', false);

        el = doc.createElement("em");
        el.style.fontWeight = "normal";
        el.style.fontStyle = "normal";
        testSimpleModifiableElement("em with font-style and font-weight normal", el, '<em style="font-style: normal; font-weight: normal"></em>', false);
    }

/*
    s.test("Can set single style property via setAttribute", function(t) {
        var el = document.createElement("span");
        el.setAttribute("style", "padding: 1px");
        var styleAttr = el.attributes.getNamedItem("style");
        t.assertEquivalent(styleAttr.specified, true);
    });
*/

    s.test("Can set single style property via style property", function(t) {
        var el = document.createElement("span");
        el.style.padding = "1px";
        var styleAttr = el.attributes.getNamedItem("style");
        t.assertEquivalent(styleAttr.specified, true);
    });

    s.test("style property cssText", function(t) {
        var el = document.createElement("span");
        el.style.fontWeight = "bold";
        //t.assertEquivalent(el.style.item(0), "font-weight");
        t.assert(/font-weight:\s?bold;?/i.test(el.style.cssText.toLowerCase()));
    });


    testDocument(document);

}, false);
