define(function (require) {
    // Load any app-specific modules
    // with a relative require call,
    // like:
    var rangy = require("rangy");
    
    require("rangy-classapplier");

    rangy.init();
    
    window.rangy = rangy;

    console.log(rangy);
});