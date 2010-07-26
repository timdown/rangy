function createNodeTree(levels, copiesPerLevel) {
    function createTestNodes(parentNode, limit, copies) {
        if (limit > 0) {
            var n = parentNode.appendChild(document.createElement("div"));
            n.appendChild(document.createTextNode("Before "));
            var p = n.appendChild(document.createElement("div"));
            n.appendChild(document.createTextNode(" after"));
            for (var i = 0; i < copies; i++) {
                createTestNodes(p, limit - 1, copies);
            }
        }
    }

    var testNode = document.createElement("div");
    createTestNodes(testNode, levels, copiesPerLevel);

    return testNode;
}