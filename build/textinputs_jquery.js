/**
Rangy Text Inputs plug-in for jQuery
Part of the Rangy project
http://code.google.com/p/rangy
Build date: 29/7/2010

Licensed under the MIT licence.

The MIT License

Copyright (c) 2010 Tim Down

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
 */
(function(){var l,f,k,j,b,a,g;function m(n,p){var o=typeof n[p];return o==="function"||(!!(o=="object"&&n[p]))||o=="unknown"}function e(n,o){return typeof(n[o])!="undefined"}function d(n,o){return !!(typeof(n[o])=="object"&&n[o])}function c(n){if(window.console&&window.console.log){window.console.log("TextInputs module for Rangy not supported in your browser. Reason: "+n)}}function h(o,p,n){if(p<0){p+=o.value.length}if(typeof n=="undefined"){n=p}if(n<0){n+=o.value.length}return{start:p,end:n}}function i(o,p,n){return{start:p,end:n,length:n-p,text:o.value.slice(p,n)}}jQuery(document).ready(function(){var o=document.createElement("textarea");document.body.appendChild(o);if(e(o,"selectionStart")&&e(o,"selectionEnd")){f=function(r){var s=r.selectionStart,q=r.selectionEnd;return i(r,s,q)};k=function(s,q,r){var t=h(s,q,r);s.selectionStart=t.start;s.selectionEnd=t.end}}else{if(m(o,"createTextRange")&&d(document,"selection")&&m(document.selection,"createRange")){l=function(w,t){w.focus();var u=document.selection.createRange();var s,q,r,x,v;if(u){if(u.text){u.collapse(!!t)}s=w.value;q=w.createTextRange();r=w.createTextRange();x=0;v=u.getBookmark();q.moveToBookmark(v);if(s.indexOf("\r\n")>-1){u.moveToBookmark(v);q.text=" ";r.setEndPoint("EndToStart",q);x=r.text.length-1;document.execCommand("undo")}else{r.setEndPoint("EndToStart",q);x=r.text.length}return x}return 0};f=function(r){var s=l(r,true),q=l(r,false);return i(r,s,q)};var p=function(q,r){return r-(q.value.slice(0,r).split("\r\n").length-1)};k=function(u,q,t){var v=h(u,q,t);var s=u.createTextRange();var r=p(u,v.start);s.collapse(true);if(v.start==v.end){s.move("character",r)}else{s.moveEnd("character",p(u,v.end));s.moveStart("character",r)}s.select()}}else{document.body.removeChild(o);c("No means of finding text input caret position");return}}document.body.removeChild(o);j=function(q){var r=f(q),s;if(r.start!=r.end){s=q.value;q.value=s.slice(0,r.start)+s.slice(r.end);k(q,r.start,r.start)}};b=function(r,u,q,s){var t;if(u!=q){t=r.value;r.value=t.slice(0,u)+t.slice(q)}if(s){k(r,u,u)}};a=function(r,u,q,s){var t=r.value,v;r.value=t.slice(0,q)+u+t.slice(q);if(s){v=q+u.length;k(r,v,v)}};g=function(q,t){var r=f(q),s=q.value;q.value=s.slice(0,r.start)+t+s.slice(r.end);var u=r.start+t.length;k(q,u,u)};function n(q){return function(){var s=this.jquery?this[0]:this;var t=s.nodeName.toLowerCase();if(s.nodeType==1&&(t=="textarea"||(t=="input"&&s.type=="text"))){var r=[s].concat(Array.prototype.slice.call(arguments));return q.apply(this,r)}}}jQuery.fn.extend({getSelection:n(f),setSelection:n(k),deleteSelectedText:n(j),deleteText:n(b),insertText:n(a),pasteText:n(g)})})})();