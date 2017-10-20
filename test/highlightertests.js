xn.test.suite("Highlighter module tests", function(s) {
    s.tearDown = function() {
        document.getElementById("test").innerHTML = "";
    };

    s.test("highlightSelection test", function(t) {
        var applier = rangy.createClassApplier("c1");
        var highlighter = rangy.createHighlighter();
        highlighter.addClassApplier(applier);

        var testEl = document.getElementById("test");
        var range = rangyTestUtils.createRangeInHtml(testEl, 'one [two] three four');
        range.select();

        var highlights = highlighter.highlightSelection("c1");
        
        t.assertEquals(highlights.length, 1);
        
        
        //t.assertEquals(highlights.length, 1);


    });

    s.test("Options test (issue 249)", function(t) {
        var applier = rangy.createClassApplier("c1");
        var highlighter = rangy.createHighlighter();
        highlighter.addClassApplier(applier);

        highlighter.highlightSelection("c1", { selection: rangy.getSelection() });
    });

    s.test("partial unhighlight test", function(t) {
        var applier = rangy.createClassApplier("yellow");
        var highlighter = rangy.createHighlighter();
        highlighter.addClassApplier(applier);

        var testEl = document.getElementById("test");
        var range = rangyTestUtils.createRangeInHtml(testEl, '[one two three four]');
        range.select();

        highlighter.highlightSelection("yellow");

        t.assertEquals(highlighter.highlights[0].characterRange.start, 9);
        t.assertEquals(highlighter.highlights[0].characterRange.end, 27);

        var range2 = rangyTestUtils.createRangeInHtml(testEl, '[one two] three four');
        range2.select();

        highlighter.removeHighlightsFromSelection();

        t.assertEquals(highlighter.highlights[0].characterRange.start, 16);
        t.assertEquals(highlighter.highlights[0].characterRange.end, 27);
    });

    s.test("partial unhighlight test 2", function(t) {
        var yellow = rangy.createClassApplier("yellow");
        var green = rangy.createClassApplier("green");
        var highlighter = rangy.createHighlighter();
        highlighter.addClassApplier(yellow);
        highlighter.addClassApplier(green);

        var testEl = document.getElementById("test");
        var range = rangyTestUtils.createRangeInHtml(testEl, '[one two three four]');
        range.select();

        highlighter.highlightSelection("yellow");

        var range2 = rangyTestUtils.createRangeInHtml(testEl, '[one two] three four');
        range2.select();
        highlighter.highlightSelection("green");

        //yellow
        t.assertEquals(highlighter.highlights[0].classApplier.className, "yellow");
        t.assertEquals(highlighter.highlights[0].characterRange.start, 16);
        t.assertEquals(highlighter.highlights[0].characterRange.end, 27);
        //green
        t.assertEquals(highlighter.highlights[1].classApplier.className, "green");
        t.assertEquals(highlighter.highlights[1].characterRange.start, 9);
        t.assertEquals(highlighter.highlights[1].characterRange.end, 16);

        var range3 = rangyTestUtils.createRangeInHtml(testEl, 'one [two three] four');
        range3.select();

        highlighter.removeHighlightsFromSelection();

        //yellow
        t.assertEquals(highlighter.highlights[0].classApplier.className, "yellow");
        t.assertEquals(highlighter.highlights[0].characterRange.start, 22);
        t.assertEquals(highlighter.highlights[0].characterRange.end, 27);
        //green
        t.assertEquals(highlighter.highlights[1].classApplier.className, "green");
        t.assertEquals(highlighter.highlights[1].characterRange.start, 9);
        t.assertEquals(highlighter.highlights[1].characterRange.end, 13);

    });

}, false);