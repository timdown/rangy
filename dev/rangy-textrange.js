/**
 * Text range module for Rangy.
 * Text-based manipulation and searching of ranges and selections.
 *
 * Features
 *
 * - Ability to move range boundaries by character or word offsets
 * - Customizable word tokenizer
 * - Ignores text nodes inside <script> or <style> elements or those hidden by CSS display and visibility properties
 * - Range findText method to search for text or regex within the page or within a range. Flags for whole words and case
 *   sensitivity
 * - Selection and range save/restore as text offsets within a node
 * - Methods to return visible text within a range or selection
 * - innerText method for elements
 *
 * References
 *
 * https://www.w3.org/Bugs/Public/show_bug.cgi?id=13145
 * http://aryeh.name/spec/innertext/innertext.html
 * http://dvcs.w3.org/hg/editing/raw-file/tip/editing.html
 *
 * Part of Rangy, a cross-browser JavaScript range and selection library
 * http://code.google.com/p/rangy/
 *
 * Depends on Rangy core.
 *
 * Copyright 2014, Tim Down
 * Licensed under the MIT license.
 * Version: 1.3alpha.20140706
 * Build date: 6 July 2014
 */
rangy.createModule("TextRange",["WrappedSelection"],function(e,t){function n(e,t){function n(t,n,r){for(var i=e.slice(t,n),o={isWord:r,chars:i,toString:function(){return i.join("")}},a=0,c=i.length;c>a;++a)i[a].token=o;s.push(o)}for(var r,i,o,a=e.join(""),s=[],c=0;r=t.wordRegex.exec(a);){if(i=r.index,o=i+r[0].length,i>c&&n(c,i,!1),t.includeTrailingSpace)for(;J.test(e[o]);)++o;n(i,o,!0),c=o}return c<e.length&&n(c,e.length,!1),s}function r(e,t){if(e){var n={};return G(n,t),G(n,e,!0),n}return t}function i(e){var t,n;return e?(t=e.language||Q,n={},G(n,at[t]||at[Q]),G(n,e),n):at[Q]}function o(e){return r(e,it)}function a(e){return r(e,ot)}function s(e){var t=r(e,st);return t.characterOptions=o(t.wordOptions),t}function c(e,t){var n=dt(e,"display",t),r=e.tagName.toLowerCase();return"block"==n&&rt&&ht.hasOwnProperty(r)?ht[r]:n}function u(e){for(var t=f(e),n=0,r=t.length;r>n;++n)if(1==t[n].nodeType&&"none"==c(t[n]))return!0;return!1}function l(e){var t;return 3==e.nodeType&&(t=e.parentNode)&&"hidden"==dt(t,"visibility")}function d(e){return e&&(1==e.nodeType&&!/^(inline(-block|-table)?|none)$/.test(c(e))||9==e.nodeType||11==e.nodeType)}function h(e){return U.isCharacterDataNode(e)||!/^(area|base|basefont|br|col|frame|hr|img|input|isindex|link|meta|param)$/i.test(e.nodeName)}function p(e){for(var t=[];e.parentNode;)t.unshift(e.parentNode),e=e.parentNode;return t}function f(e){return p(e).concat([e])}function g(e){for(;e&&!e.nextSibling;)e=e.parentNode;return e?e.nextSibling:null}function v(e,t){return!t&&e.hasChildNodes()?e.firstChild:g(e)}function S(e){var t=e.previousSibling;if(t){for(e=t;e.hasChildNodes();)e=e.lastChild;return e}var n=e.parentNode;return n&&1==n.nodeType?n:null}function C(e){if(!e||3!=e.nodeType)return!1;var t=e.data;if(""===t)return!0;var n=e.parentNode;if(!n||1!=n.nodeType)return!1;var r=dt(e.parentNode,"whiteSpace");return/^[\t\n\r ]+$/.test(t)&&/^(normal|nowrap)$/.test(r)||/^[\t\r ]+$/.test(t)&&"pre-line"==r}function N(e){if(""===e.data)return!0;if(!C(e))return!1;var t=e.parentNode;return t?u(e)?!0:!1:!0}function m(e){var t=e.nodeType;return 7==t||8==t||u(e)||/^(script|style)$/i.test(e.nodeName)||l(e)||N(e)}function y(e,t){var n=e.nodeType;return 7==n||8==n||1==n&&"none"==c(e,t)}function x(){this.store={}}function T(e,t,n){return function(r){var i=this.cache;if(i.hasOwnProperty(e))return pt++,i[e];ft++;var o=t.call(this,n?this[n]:this,r);return i[e]=o,o}}function b(e,t){this.node=e,this.session=t,this.cache=new x,this.positions=new x}function P(e,t){this.offset=t,this.nodeWrapper=e,this.node=e.node,this.session=e.session,this.cache=new x}function w(){return"[Position("+U.inspectNode(this.node)+":"+this.offset+")]"}function R(){return E(),wt=new Rt}function B(){return wt||R()}function E(){wt&&wt.detach(),wt=null}function k(e,n,r,i){function o(){var e=null;return n?(e=s,c||(s=s.previousVisible(),c=!s||r&&s.equals(r))):c||(e=s=s.nextVisible(),c=!s||r&&s.equals(r)),c&&(s=null),e}r&&(n?m(r.node)&&(r=e.previousVisible()):m(r.node)&&(r=r.nextVisible()));var a,s=e,c=!1,u=!1;return{next:function(){if(u)return u=!1,a;for(var e,t;e=o();)if(t=e.getCharacter(i))return a=e,e;return null},rewind:function(){if(!a)throw t.createError("createCharacterIterator: cannot rewind. Only one position can be rewound.");u=!0},dispose:function(){e=r=null}}}function O(e,t,n){function r(e){for(var t,n,r=[],a=e?i:o,s=!1,c=!1;t=a.next();){if(n=t.character,Y.test(n))c&&(c=!1,s=!0);else{if(s){a.rewind();break}c=!0}r.push(t)}return r}var i=k(e,!1,null,t),o=k(e,!0,null,t),a=n.tokenizer,s=r(!0),c=r(!1).reverse(),u=a(c.concat(s),n),l=s.length?u.slice(Bt(u,s[0].token)):[],d=c.length?u.slice(0,Bt(u,c.pop().token)+1):[];return{nextEndToken:function(){for(var e,t;1==l.length&&!(e=l[0]).isWord&&(t=r(!0)).length>0;)l=a(e.chars.concat(t),n);return l.shift()},previousStartToken:function(){for(var e,t;1==d.length&&!(e=d[0]).isWord&&(t=r(!1)).length>0;)d=a(t.reverse().concat(e.chars),n);return d.pop()},dispose:function(){i.dispose(),o.dispose(),l=d=null}}}function L(e,t,n,r,i){var o,a,s,c,u=0,l=e,d=Math.abs(n);if(0!==n){var h=0>n;switch(t){case $:for(a=k(e,h,null,r);(o=a.next())&&d>u;)++u,l=o;s=o,a.dispose();break;case q:for(var p=O(e,r,i),f=h?p.previousStartToken:p.nextEndToken;(c=f())&&d>u;)c.isWord&&(++u,l=h?c.chars[0]:c.chars[c.chars.length-1]);break;default:throw new Error("movePositionBy: unit '"+t+"' not implemented")}h?(l=l.previousVisible(),u=-u):l&&l.isLeadingSpace&&(t==q&&(a=k(e,!1,null,r),s=a.next(),a.dispose()),s&&(l=s.previousVisible()))}return{position:l,unitsMoved:u}}function I(e,t,n,r){var i=e.getRangeBoundaryPosition(t,!0),o=e.getRangeBoundaryPosition(t,!1),a=r?o:i,s=r?i:o;return k(a,!!r,s,n)}function A(e,t,n){for(var r,i=[],o=I(e,t,n);r=o.next();)i.push(r);return o.dispose(),i}function W(t,n,r){var i=e.createRange(t.node);i.setStartAndEnd(t.node,t.offset,n.node,n.offset);var o=!i.expand("word",r);return o}function _(e,t,n,r,i){function o(e,t){var n=g[e].previousVisible(),r=g[t-1],o=!i.wholeWordsOnly||W(n,r,i.wordOptions);return{startPos:n,endPos:r,valid:o}}for(var a,s,c,u,l,d,h=X(i.direction),p=k(e,h,e.session.getRangeBoundaryPosition(r,h),i.characterOptions),f="",g=[],v=null;a=p.next();)if(s=a.character,n||i.caseSensitive||(s=s.toLowerCase()),h?(g.unshift(a),f=s+f):(g.push(a),f+=s),n){if(l=t.exec(f))if(d){if(c=l.index,u=c+l[0].length,!h&&u<f.length||h&&c>0){v=o(c,u);break}}else d=!0}else if(-1!=(c=f.indexOf(t))){v=o(c,c+t.length);break}return d&&(v=o(c,u)),p.dispose(),v}function D(e){return function(){var t=!!wt,n=B(),r=[n].concat(j.toArray(arguments)),i=e.apply(this,r);return t||E(),i}}function F(e,t){return D(function(n,a,s,c){"undefined"==typeof s&&(s=a,a=$),c=r(c,ct);var u=o(c.characterOptions),l=i(c.wordOptions),d=e;t&&(d=s>=0,this.collapse(!d));var h=L(n.getRangeBoundaryPosition(this,d),a,s,u,l),p=h.position;return this[d?"setStart":"setEnd"](p.node,p.offset),h.unitsMoved})}function V(e){return D(function(t,n){n=o(n);for(var r,i=I(t,this,n,!e),a=0;(r=i.next())&&Y.test(r.character);)++a;i.dispose();var s=a>0;return s&&this[e?"moveStart":"moveEnd"]("character",e?a:-a,{characterOptions:n}),s})}function M(e){return D(function(t,n){var r=!1;return this.changeEachRange(function(t){r=t[e](n)||r}),r})}var $="character",q="word",U=e.dom,j=e.util,G=j.extend,H=U.getBody,z=/^[ \t\f\r\n]+$/,K=/^[ \t\f\r]+$/,Y=/^[\t-\r \u0085\u00A0\u1680\u180E\u2000-\u200B\u2028\u2029\u202F\u205F\u3000]+$/,J=/^[\t \u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000]+$/,Q="en",X=e.Selection.isDirectionBackward,Z=!1,et=!1,tt=!1,nt=!0;!function(){var t=document.createElement("div");t.contentEditable="true",t.innerHTML="<p>1 </p><p></p>";var n=H(document),r=t.firstChild,i=e.getSelection();n.appendChild(t),i.collapse(r.lastChild,2),i.setStart(r.firstChild,0),Z=1==(""+i).length,t.innerHTML="1 <br>",i.collapse(t,2),i.setStart(t.firstChild,0),et=1==(""+i).length,t.innerHTML="1 <p>1</p>",i.collapse(t,2),i.setStart(t.firstChild,0),tt=1==(""+i).length,n.removeChild(t),i.removeAllRanges()}();var rt,it={includeBlockContentTrailingSpace:!0,includeSpaceBeforeBr:!0,includeSpaceBeforeBlock:!0,includePreLineTrailingSpace:!0},ot={includeBlockContentTrailingSpace:!nt,includeSpaceBeforeBr:!et,includeSpaceBeforeBlock:!tt,includePreLineTrailingSpace:!0},at={en:{wordRegex:/[a-z0-9]+('[a-z0-9]+)*/gi,includeTrailingSpace:!1,tokenizer:n}},st={caseSensitive:!1,withinRange:null,wholeWordsOnly:!1,wrap:!1,direction:"forward",wordOptions:null,characterOptions:null},ct={wordOptions:null,characterOptions:null},ut={wordOptions:null,characterOptions:null,trim:!1,trimStart:!0,trimEnd:!0},lt={wordOptions:null,characterOptions:null,direction:"forward"},dt=U.getComputedStyleProperty;!function(){var e=document.createElement("table"),t=H(document);t.appendChild(e),rt="block"==dt(e,"display"),t.removeChild(e)}(),e.features.tableCssDisplayBlock=rt;var ht={table:"table",caption:"table-caption",colgroup:"table-column-group",col:"table-column",thead:"table-header-group",tbody:"table-row-group",tfoot:"table-footer-group",tr:"table-row",td:"table-cell",th:"table-cell"};x.prototype={get:function(e){return this.store.hasOwnProperty(e)?this.store[e]:null},set:function(e,t){return this.store[e]=t}};var pt=0,ft=0,gt={getPosition:function(e){var t=this.positions;return t.get(e)||t.set(e,new P(this,e))},toString:function(){return"[NodeWrapper("+U.inspectNode(this.node)+")]"}};b.prototype=gt;var vt="EMPTY",St="NON_SPACE",Ct="UNCOLLAPSIBLE_SPACE",Nt="COLLAPSIBLE_SPACE",mt="TRAILING_SPACE_BEFORE_BLOCK",yt="TRAILING_SPACE_IN_BLOCK",xt="TRAILING_SPACE_BEFORE_BR",Tt="PRE_LINE_TRAILING_SPACE_BEFORE_LINE_BREAK",bt="TRAILING_LINE_BREAK_AFTER_BR";G(gt,{isCharacterDataNode:T("isCharacterDataNode",U.isCharacterDataNode,"node"),getNodeIndex:T("nodeIndex",U.getNodeIndex,"node"),getLength:T("nodeLength",U.getNodeLength,"node"),containsPositions:T("containsPositions",h,"node"),isWhitespace:T("isWhitespace",C,"node"),isCollapsedWhitespace:T("isCollapsedWhitespace",N,"node"),getComputedDisplay:T("computedDisplay",c,"node"),isCollapsed:T("collapsed",m,"node"),isIgnored:T("ignored",y,"node"),next:T("nextPos",v,"node"),previous:T("previous",S,"node"),getTextNodeInfo:T("textNodeInfo",function(e){var t=null,n=!1,r=dt(e.parentNode,"whiteSpace"),i="pre-line"==r;return i?(t=K,n=!0):("normal"==r||"nowrap"==r)&&(t=z,n=!0),{node:e,text:e.data,spaceRegex:t,collapseSpaces:n,preLine:i}},"node"),hasInnerText:T("hasInnerText",function(e,t){for(var n=this.session,r=n.getPosition(e.parentNode,this.getNodeIndex()+1),i=n.getPosition(e,0),o=t?r:i,a=t?i:r;o!==a;){if(o.prepopulateChar(),o.isDefinitelyNonEmpty())return!0;o=t?o.previousVisible():o.nextVisible()}return!1},"node"),isRenderedBlock:T("isRenderedBlock",function(e){for(var t=e.getElementsByTagName("br"),n=0,r=t.length;r>n;++n)if(!m(t[n]))return!0;return this.hasInnerText()},"node"),getTrailingSpace:T("trailingSpace",function(e){if("br"==e.tagName.toLowerCase())return"";switch(this.getComputedDisplay()){case"inline":for(var t=e.lastChild;t;){if(!y(t))return 1==t.nodeType?this.session.getNodeWrapper(t).getTrailingSpace():"";t=t.previousSibling}break;case"inline-block":case"inline-table":case"none":case"table-column":case"table-column-group":break;case"table-cell":return"	";default:return this.isRenderedBlock(!0)?"\n":""}return""},"node"),getLeadingSpace:T("leadingSpace",function(){switch(this.getComputedDisplay()){case"inline":case"inline-block":case"inline-table":case"none":case"table-column":case"table-column-group":case"table-cell":break;default:return this.isRenderedBlock(!1)?"\n":""}return""},"node")});var Pt={character:"",characterType:vt,isBr:!1,prepopulateChar:function(){var e=this;if(!e.prepopulatedChar){var t=e.node,n=e.offset,r="",i=vt,o=!1;if(n>0)if(3==t.nodeType){var a=t.data,s=a.charAt(n-1),c=e.nodeWrapper.getTextNodeInfo(),u=c.spaceRegex;c.collapseSpaces?u.test(s)?n>1&&u.test(a.charAt(n-2))||(c.preLine&&"\n"===a.charAt(n)?(r=" ",i=Tt):(r=" ",i=Nt)):(r=s,i=St,o=!0):(r=s,i=Ct,o=!0)}else{var l=t.childNodes[n-1];if(l&&1==l.nodeType&&!m(l)&&("br"==l.tagName.toLowerCase()?(r="\n",e.isBr=!0,i=Nt,o=!1):e.checkForTrailingSpace=!0),!r){var d=t.childNodes[n];d&&1==d.nodeType&&!m(d)&&(e.checkForLeadingSpace=!0)}}e.prepopulatedChar=!0,e.character=r,e.characterType=i,e.isCharInvariant=o}},isDefinitelyNonEmpty:function(){var e=this.characterType;return e==St||e==Ct},resolveLeadingAndTrailingSpaces:function(){if(this.prepopulatedChar||this.prepopulateChar(),this.checkForTrailingSpace){var e=this.session.getNodeWrapper(this.node.childNodes[this.offset-1]).getTrailingSpace();e&&(this.isTrailingSpace=!0,this.character=e,this.characterType=Nt),this.checkForTrailingSpace=!1}if(this.checkForLeadingSpace){var t=this.session.getNodeWrapper(this.node.childNodes[this.offset]).getLeadingSpace();t&&(this.isLeadingSpace=!0,this.character=t,this.characterType=Nt),this.checkForLeadingSpace=!1}},getPrecedingUncollapsedPosition:function(e){for(var t,n=this;n=n.previousVisible();)if(t=n.getCharacter(e),""!==t)return n;return null},getCharacter:function(e){function t(){return c||(o=u.getPrecedingUncollapsedPosition(e),c=!0),o}if(this.resolveLeadingAndTrailingSpaces(),this.isCharInvariant)return this.character;var n=["character",e.includeSpaceBeforeBr,e.includeBlockContentTrailingSpace,e.includePreLineTrailingSpace].join("_"),r=this.cache.get(n);if(null!==r)return r;var i,o,a="",s=this.characterType==Nt,c=!1,u=this;return s?(" "!=this.character||t()&&!o.isTrailingSpace&&"\n"!=o.character)&&("\n"==this.character&&this.isLeadingSpace?t()&&"\n"!=o.character&&(a="\n"):(i=this.nextUncollapsed(),i&&(i.isBr?this.type=xt:i.isTrailingSpace&&"\n"==i.character?this.type=yt:i.isLeadingSpace&&"\n"==i.character&&(this.type=mt),"\n"===i.character?(this.type!=xt||e.includeSpaceBeforeBr)&&(this.type!=mt||e.includeSpaceBeforeBlock)&&(this.type==yt&&i.isTrailingSpace&&!e.includeBlockContentTrailingSpace||(this.type!=Tt||i.type!=St||e.includePreLineTrailingSpace)&&("\n"===this.character?i.isTrailingSpace?this.isTrailingSpace||this.isBr&&(i.type=bt,t()&&o.isLeadingSpace&&"\n"==o.character&&(i.character="")):a="\n":" "===this.character&&(a=" "))):a=this.character))):"\n"===this.character&&(!(i=this.nextUncollapsed())||i.isTrailingSpace),this.cache.set(n,a),a},equals:function(e){return!!e&&this.node===e.node&&this.offset===e.offset},inspect:w,toString:function(){return this.character}};P.prototype=Pt,G(Pt,{next:T("nextPos",function(e){var t=e.nodeWrapper,n=e.node,r=e.offset,i=t.session;if(!n)return null;var o,a,s;return r==t.getLength()?(o=n.parentNode,a=o?t.getNodeIndex()+1:0):t.isCharacterDataNode()?(o=n,a=r+1):(s=n.childNodes[r],i.getNodeWrapper(s).containsPositions()?(o=s,a=0):(o=n,a=r+1)),o?i.getPosition(o,a):null}),previous:T("previous",function(e){var t,n,r,i=e.nodeWrapper,o=e.node,a=e.offset,s=i.session;return 0==a?(t=o.parentNode,n=t?i.getNodeIndex():0):i.isCharacterDataNode()?(t=o,n=a-1):(r=o.childNodes[a-1],s.getNodeWrapper(r).containsPositions()?(t=r,n=U.getNodeLength(r)):(t=o,n=a-1)),t?s.getPosition(t,n):null}),nextVisible:T("nextVisible",function(e){var t=e.next();if(!t)return null;var n=t.nodeWrapper,r=t.node,i=t;return n.isCollapsed()&&(i=n.session.getPosition(r.parentNode,n.getNodeIndex()+1)),i}),nextUncollapsed:T("nextUncollapsed",function(e){for(var t=e;t=t.nextVisible();)if(t.resolveLeadingAndTrailingSpaces(),""!==t.character)return t;return null}),previousVisible:T("previousVisible",function(e){var t=e.previous();if(!t)return null;var n=t.nodeWrapper,r=t.node,i=t;return n.isCollapsed()&&(i=n.session.getPosition(r.parentNode,n.getNodeIndex())),i})});var wt=null,Rt=function(){function e(e){var t=new x;return{get:function(n){var r=t.get(n[e]);if(r)for(var i,o=0;i=r[o++];)if(i.node===n)return i;return null},set:function(n){var r=n.node[e],i=t.get(r)||t.set(r,[]);i.push(n)}}}function t(){this.initCaches()}var n=j.isHostProperty(document.documentElement,"uniqueID");return t.prototype={initCaches:function(){this.elementCache=n?function(){var e=new x;return{get:function(t){return e.get(t.uniqueID)},set:function(t){e.set(t.node.uniqueID,t)}}}():e("tagName"),this.textNodeCache=e("data"),this.otherNodeCache=e("nodeName")},getNodeWrapper:function(e){var t;switch(e.nodeType){case 1:t=this.elementCache;break;case 3:t=this.textNodeCache;break;default:t=this.otherNodeCache}var n=t.get(e);return n||(n=new b(e,this),t.set(n)),n},getPosition:function(e,t){return this.getNodeWrapper(e).getPosition(t)},getRangeBoundaryPosition:function(e,t){var n=t?"start":"end";return this.getPosition(e[n+"Container"],e[n+"Offset"])},detach:function(){this.elementCache=this.textNodeCache=this.otherNodeCache=null}},t}();G(U,{nextNode:v,previousNode:S});var Bt=Array.prototype.indexOf?function(e,t){return e.indexOf(t)}:function(e,t){for(var n=0,r=e.length;r>n;++n)if(e[n]===t)return n;return-1};G(e.rangePrototype,{moveStart:F(!0,!1),moveEnd:F(!1,!1),move:F(!0,!0),trimStart:V(!0),trimEnd:V(!1),trim:D(function(e,t){var n=this.trimStart(t),r=this.trimEnd(t);return n||r}),expand:D(function(e,t,n){var a=!1;n=r(n,ut);var s=o(n.characterOptions);if(t||(t=$),t==q){var c,u,l=i(n.wordOptions),d=e.getRangeBoundaryPosition(this,!0),h=e.getRangeBoundaryPosition(this,!1),p=O(d,s,l),f=p.nextEndToken(),g=f.chars[0].previousVisible();if(this.collapsed)c=f;else{var v=O(h,s,l);c=v.previousStartToken()}return u=c.chars[c.chars.length-1],g.equals(d)||(this.setStart(g.node,g.offset),a=!0),u&&!u.equals(h)&&(this.setEnd(u.node,u.offset),a=!0),n.trim&&(n.trimStart&&(a=this.trimStart(s)||a),n.trimEnd&&(a=this.trimEnd(s)||a)),a}return this.moveEnd($,1,n)}),text:D(function(e,t){return this.collapsed?"":A(e,this,o(t)).join("")}),selectCharacters:D(function(e,t,n,r,i){var o={characterOptions:i};t||(t=H(this.getDocument())),this.selectNodeContents(t),this.collapse(!0),this.moveStart("character",n,o),this.collapse(!0),this.moveEnd("character",r-n,o)}),toCharacterRange:D(function(e,t,n){t||(t=H(this.getDocument()));var r,i,o=t.parentNode,a=U.getNodeIndex(t),s=-1==U.comparePoints(this.startContainer,this.endContainer,o,a),c=this.cloneRange();return s?(c.setStartAndEnd(this.startContainer,this.startOffset,o,a),r=-c.text(n).length):(c.setStartAndEnd(o,a,this.startContainer,this.startOffset),r=c.text(n).length),i=r+this.text(n).length,{start:r,end:i}}),findText:D(function(t,n,r){r=s(r),r.wholeWordsOnly&&(r.wordOptions=i(r.wordOptions),r.wordOptions.includeTrailingSpace=!1);var o=X(r.direction),a=r.withinRange;a||(a=e.createRange(),a.selectNodeContents(this.getDocument()));var c=n,u=!1;"string"==typeof c?r.caseSensitive||(c=c.toLowerCase()):u=!0;var l=t.getRangeBoundaryPosition(this,!o),d=a.comparePoint(l.node,l.offset);-1===d?l=t.getRangeBoundaryPosition(a,!0):1===d&&(l=t.getRangeBoundaryPosition(a,!1));for(var h,p=l,f=!1;;)if(h=_(p,c,u,a,r)){if(h.valid)return this.setStartAndEnd(h.startPos.node,h.startPos.offset,h.endPos.node,h.endPos.offset),!0;p=o?h.startPos:h.endPos}else{if(!r.wrap||f)return!1;a=a.cloneRange(),p=t.getRangeBoundaryPosition(a,!o),a.setBoundary(l.node,l.offset,o),f=!0}}),pasteHtml:function(e){if(this.deleteContents(),e){var t=this.createContextualFragment(e),n=t.lastChild;this.insertNode(t),this.collapseAfter(n)}}}),G(e.selectionPrototype,{expand:D(function(e,t,n){this.changeEachRange(function(e){e.expand(t,n)})}),move:D(function(e,t,n,r){var i=0;if(this.focusNode){this.collapse(this.focusNode,this.focusOffset);var o=this.getRangeAt(0);r||(r={}),r.characterOptions=a(r.characterOptions),i=o.move(t,n,r),this.setSingleRange(o)}return i}),trimStart:M("trimStart"),trimEnd:M("trimEnd"),trim:M("trim"),selectCharacters:D(function(t,n,r,i,o,a){var s=e.createRange(n);s.selectCharacters(n,r,i,a),this.setSingleRange(s,o)}),saveCharacterRanges:D(function(e,t,n){for(var r=this.getAllRanges(),i=r.length,o=[],a=1==i&&this.isBackward(),s=0,c=r.length;c>s;++s)o[s]={characterRange:r[s].toCharacterRange(t,n),backward:a,characterOptions:n};return o}),restoreCharacterRanges:D(function(t,n,r){this.removeAllRanges();for(var i,o,a,s=0,c=r.length;c>s;++s)o=r[s],a=o.characterRange,i=e.createRange(n),i.selectCharacters(n,a.start,a.end,o.characterOptions),this.addRange(i,o.backward)}),text:D(function(e,t){for(var n=[],r=0,i=this.rangeCount;i>r;++r)n[r]=this.getRangeAt(r).text(t);return n.join("")})}),e.innerText=function(t,n){var r=e.createRange(t);r.selectNodeContents(t);var i=r.text(n);return i},e.createWordIterator=function(e,t,n){var a=B();n=r(n,lt);var s=o(n.characterOptions),c=i(n.wordOptions),u=a.getPosition(e,t),l=O(u,s,c),d=X(n.direction);return{next:function(){return d?l.previousStartToken():l.nextEndToken()},dispose:function(){l.dispose(),this.next=function(){}}}},e.noMutation=function(e){var t=B();e(t),E()},e.noMutation.createEntryPointFunction=D,e.textRange={isBlockNode:d,isCollapsedWhitespaceNode:N,createPosition:D(function(e,t,n){return e.getPosition(t,n)})}});