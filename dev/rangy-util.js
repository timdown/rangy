/**
 * Utilities module for Rangy.
 * A collection of common selection and range-related tasks, using Rangy.
 *
 * Part of Rangy, a cross-browser JavaScript range and selection library
 * http://code.google.com/p/rangy/
 *
 * Depends on Rangy core.
 *
 * Copyright 2012, Tim Down
 * Licensed under the MIT license.
 * Version: 1.3alpha.603
 * Build date: 28 May 2012
 */
rangy.createModule("Util",function(a,b){a.requireModules(["WrappedSelection","WrappedRange"]);var c=a.rangePrototype,d=a.selectionPrototype;c.select=function(b){a.getSelection(this.getDocument()).setSingleRange(this,b)},d.pasteText=function(a){this.deleteFromDocument();var b=this.getRangeAt(0),c=b.getDocument().createTextNode(a);b.insertNode(c),this.setSingleRange(b)},c.pasteText=function(a){this.deleteContents();var b=this.getDocument().createTextNode(a);this.insertNode(b)},d.pasteHtml=function(a){this.deleteFromDocument();var b=this.getRangeAt(0),c=this.createContextualFragment(a),d=c.lastChild;b.insertNode(c),d&&b.setStartAfter(d),this.setSingleRange(b)},c.pasteHtml=function(a){this.deleteContents();var b=this.createContextualFragment(a);this.insertNode(b)},c.setStartAndEnd=function(){var a=arguments;this.setStart(a[0],a[1]);switch(a.length){case 2:this.collapse(!0);break;case 3:this.setEnd(a[0],a[2]);break;case 4:this.setEnd(a[2],a[3])}},d.selectNodeContents=function(b){var c=a.createRange(this.win);c.selectNodeContents(b),this.setSingleRange(c)},a.createRangeFromNode=function(b){var c=a.createRange(b);return c.selectNode(b),c},a.createRangeFromNodeContents=function(b){var c=a.createRange(b);return c.selectNodeContents(b),c}})