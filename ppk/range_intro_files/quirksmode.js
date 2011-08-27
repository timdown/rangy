
/* StatCounter generic QuirksMode code. Is overwritten by blog pages, which use a separate detect. */

var sc_project=6279663; 
var sc_invisible=1; 
var sc_security="a9c10680"; 

/* Against quirksmode.com */

 if (self != top) {

 	top.location.replace(location.href);
 }

/* QUIRKSMODE JAVASCRIPT */

var blogs = ['/blog/','/bugreports/','/elsewhere/'];
var archivedText = 'You\'re looking at outdated content that is no longer maintained. Use with care.';

var advancedJavaScriptSupport = createXMLHTTPObject() && document.createElement && document.getElementsByTagName;

if (advancedJavaScriptSupport)
	document.write('<style>body {padding-top: 161px;}</style>'); 	// make room for headers

window.onunload = function () {

	// execute unload routine of page, if present

	if (self.exit)
		exit();
	
	// execute unload routine for blog pages, if present

	if (self.exitBlogs)
		exitBlogs();
}

window.onload = function () {
	
	if (navigator.userAgent.indexOf('WidgetManager') != -1) {
		alert('joehoe');
		document.body.style.fontSize = '2em';
	}

	/* See if browser supports advanced interface */

	if (!advancedJavaScriptSupport) return;
	
	/* Load advanced interface */
	
	sendRequest('/header.txt',setHeader);
	sendRequest('/nav.txt',setNavigation);
	sendRequest('/footer.txt',setFooter);

	zebraLists();
	
	/* Miscellaneous */
	
	setScreenShots();
	setCompTables();
	sizePres();
	redirectExternalLinks();
	window.onresize = sizePres;
	if (Preferences.siteNavPos && Preferences.siteNavPos != 'fixed') {
		document.getElementById('header').style.position = Preferences.siteNavPos;
	}
	else {
		setMenuOffset.initialPos = getStyle('header','top');
		window.onscroll = document.documentElement.onscroll = setMenuOffset;
		setMenuOffset();
		/* in Moz 1.7.12/FF 1.5 window.onscroll is wiped when you use the mouse wheel while 
		the pointer is NOT above a true page element (ie. when it is above the naked documentElement)
		 ... or something ...
		Of course Safari doesn't accept document.documentElement.onscroll; Op and IE 7 do */
	}

	/* Initialise blog and bilingual scripts, if they're there */

	if (self.initBlogs)
		initBlogs();
	
	
	/* Initialise example scripts on content pages in all browsers */
	
	if (self.init)
		init();

	/* StatCounter */
	
	setTimeout(setStatCounter,100);

	function setStatCounter() {
		var x = document.createElement('script');
		x.src = 'http://www.statcounter.com/counter/counter.js';
		document.body.appendChild(x);
	}

}


/* Zebra lists */

function zebraLists() {
	var lists = getElementsByTagNames('ol,ul');
	for (var i=0;i<lists.length;i++) {
		var items = lists[i].childNodes;
		if (lists[i].parentNode.className === 'floater') continue;
		var counter = 1;
		for (var j=0;j<items.length;j++) {
			if (items[j].nodeName == 'LI' && !items[j].getElementsByTagName('li').length) {
				counter++;
				if (counter % 2 == 1)
					items[j].className = 'odd';
				else
					items[j].className = '';
			}
		}
	}
}	


function setScreenShots() {
	var imgs = document.getElementsByTagName('img');
	var ssSpan = document.createElement('span');
	ssSpan.className = 'ssSpan';
	for (var i=0;i<imgs.length;i++) {
		if (imgs[i].className != 'screenshot') continue;
		var currentSsSpan = ssSpan.cloneNode(true);
		if (imgs[i].alt)
			currentSsSpan.appendChild(document.createTextNode('Screenshot: ' + imgs[i].alt));
		else
			currentSsSpan.appendChild(document.createTextNode('Screenshot without alt text'));
		imgs[i].parentNode.insertBefore(currentSsSpan,imgs[i]);
	}
}

/* COMPATIBILITY TABLES */

function setCompTables() {
	var tables = document.getElementsByTagName('table');
	for (var i=0;i<tables.length;i++) {
		if (tables[i].className.indexOf('compatibility') == -1) continue;
		var reference = document.createElement('caption');
		reference.innerHTML = 'See also the <a href="/key.html">key</a> to my compatibility tables.';
		var topics = tables[i].getElementsByTagName('div');

		var selectBox = document.createElement('select');
		selectBox.className = 'contents';
		selectBox.options[0] = new Option('Contents of this table','');
		selectBox.onchange = function () {
			if (this.value)
				location.hash = this.value;
		}
		
		for (var j=0;j<topics.length;j++) {
			if (topics[j].className != 'name') continue;
			

			var unique = 't'+i+j;
			var linkText = topics[j].innerText || topics[j].textContent;
			selectBox.options[selectBox.options.length] = new Option(linkText,unique);
			topics[j].parentNode.id = unique;
		}
		reference.insertBefore(selectBox,reference.firstChild);
		tables[i].appendChild(reference);
		
		tables[i].onmouseover = function (e) {
			var evt = e || window.event;
			var tgt = evt.target || evt.srcElement;
			if (tgt.nodeName !== 'TD') return;
			if (tgt.done) return;
			if (tgt.parentNode.cells.length === 1) {
				tgt.done = true;
				return;
			}

			if (!this.browserNames) {
				this.browserNames = [];
				var rows = this.rows;
				var templateRow,start;
				for (var j=0,row;row=rows[j];j+=1) {
					if (row.className === 'compheader') {
//						if (rows[j+1].className === 'compheader') {
//							templateRow = rows[j+1];
//							start = 0;
//						} else {
							templateRow = row;
							start = 1;
//						}
						break;
					}
				}
				if (templateRow) {
					var cells = templateRow.cells;
					for (var k=start,td;td=cells[k];k+=1) {
						this.browserNames[k+1-start] = td.innerText || td.textContent;
					}
				}
			}

			var tds = tgt.parentNode.cells;
			var counter = 1;
			for (var j=0,td;td=tds[j];j+=1) {
				if (td.className.indexOf('comp') === -1) continue;
				var start = counter;
				counter += td.colSpan;
				td.title = this.browserNames.slice(start,counter).join('; ');
				td.done = true;
			}
		}
	}
}

function sizePres() {

	/* Stretch pres to right edge of browser window */
	var pres = document.getElementsByTagName('pre');
	if (!pres.length) return;
	var testPre;
	for (var i=0;i<pres.length;i++) {
		if (pres[i].parentNode.nodeName == 'BODY') {
			testPre = pres[i];
			break;
		}
	}
	if (!testPre) return;
	testPre.style.marginRight = 'auto';
	var docWidth = document.documentElement.clientWidth;
	var preWidth = testPre.offsetWidth;
	var rightMargin = docWidth - preWidth;
	if (rightMargin < 0)
		rightMargin = 0;
	for (var i=0;i<pres.length;i++) {
		if (pres[i].parentNode.nodeName == 'BODY') {
			pres[i].style.marginRight = '-' + rightMargin + 'px';	
		}
	}
}

function setMenuOffset() { 
	var header = document.getElementById('header');
	if (!header) return;
	var currentOffset = document.documentElement.scrollTop || document.body.scrollTop; // body for Safari
	var startPos = parseInt(setMenuOffset.initialPos) || 190;
	var desiredOffset = startPos - currentOffset;
	if (desiredOffset < 10)
		desiredOffset = 10;
	if (desiredOffset != parseInt(header.style.top)) 
		header.style.top = desiredOffset + 'px';

	var currentLeftOffset = document.documentElement.scrollLeft || document.body.scrollLeft; // body for Safari
	if (currentLeftOffset != - parseInt(header.style.left))
		header.style.left = '-' + currentLeftOffset + 'px';
}

function redirectExternalLinks() {
	if (!Preferences.external || Preferences.external != 'redirect') return;
	var links = document.getElementsByTagName('a');
	for (var i=0;i<links.length;i++) {
		if (links[i].className.indexOf('external') == -1) continue;
		links[i].target = 'ppk';
	}
}

/* PREPARING THE HEADER */

function setHeader(req) {
	var header = document.createElement('div');
	header.className = 'pageHeader';
	document.body.insertBefore(header,document.body.firstChild);
	header.innerHTML = req.responseText;
	document.getElementById('lastMod').innerHTML = lastMod();
	var lastModContainer = document.getElementById('lastModPar')
//	lastModContainer.style.marginLeft = 243 - lastModContainer.clientWidth + 'px';
	document.body.insertBefore(lastModContainer,document.body.firstChild);
	var searchBox = document.getElementById('searchTop');
	if (!searchBox) return;
	searchBox.onfocus = function () {
		if (this.value == this.defaultValue) this.value = '';	
	}
	searchBox.onblur = function () {
		if (!this.value) this.value = this.defaultValue;	
	}
	searchBox.form.onsubmit = function () {
		searchBox.value = 'site:www.quirksmode.org ' + searchBox.value;
	}
}

/* IMPORT TOC AND MAIN NAVIGATION */
 
function setNavigation(req) {
	var importHeader = document.getElementById('header');
	if (!importHeader) return;
	importHeader.innerHTML = req.responseText;
	var ToC = createTOC();
	if (ToC)
		document.getElementById('TOC').appendChild(ToC);
	if (location.hash)
		location.hash = location.hash;
//	document.getElementById('menuLink').onclick = getMainNav;
	if (Preferences.showSiteNav && Preferences.showSiteNav == 'yes') {
		document.getElementById('menuLink').onclick();
	}
}

/* CREATE TOC */

function createTOC() {
	var y = document.createElement('div');
	y.id = 'innertoc';
	var a = y.appendChild(document.createElement('span'));
	a.onclick = showhideTOC;
	a.id = 'contentheader';
	a.innerHTML = 'show page contents';
	var z = y.appendChild(document.createElement('div'));
	z.onclick = showhideTOC;
	var toBeTOCced = getElementsByTagNames('h2,h3,h4,h5');
	if (toBeTOCced.length < 2) return false;
	
	for (var i=0;i<toBeTOCced.length;i++) {
		var textSrc = toBeTOCced[i];
		var firstNode = textSrc.firstChild;
		if (firstNode && firstNode.nodeName == 'A')
			textSrc = firstNode;
		var tmp = document.createElement('a');
		tmp.innerHTML = textSrc.innerHTML;
		tmp.className = 'page';
		z.appendChild(tmp);
		if (toBeTOCced[i].nodeName == 'H4')
			tmp.className += ' indent';
		if (toBeTOCced[i].nodeName == 'H5')
			tmp.className += ' extraindent';
		var headerId = toBeTOCced[i].id || 'link' + i;		
		tmp.href = '#' + headerId;		
		toBeTOCced[i].id = headerId;
		if (toBeTOCced[i].nodeName == 'H2') {
			tmp.innerHTML = 'Top';
			tmp.href = '#top';
			toBeTOCced[i].id = 'top';
		}
	}
	return y;
}

var TOCstate = 'none';

function showhideTOC() {
	TOCstate = (TOCstate == 'none') ? 'block' : 'none';
	document.getElementById('contentheader').innerHTML = (TOCstate == 'none') ? 'show page contents' : 'hide page contents';
	document.getElementById('innertoc').lastChild.style.display = TOCstate;
}

/* MAIN NAVIGATION */

function getMainNav() {
	return;
	document.getElementById('waitMessageNav').style.display = 'block';
	sendRequest('/sitemap.html',setMainNav);
	this.innerHTML = 'hide site navigation';
	this.className = 'opened';
	this.onclick = removeMainNav;
	return false;
}

function setMainNav(req) {	
	var container = document.createElement('div');
	container.innerHTML = req.responseText;
	var x = container.getElementsByTagName('div');
	var siteMap;
	for (var i=0;i<x.length;i++) {
		if (x[i].id == 'mainMenu') {
			siteMap = x[i];
			break;
		}		
	}
	if (!siteMap) return;
	var archiveLink = document.createElement('a');
	archiveLink.href = '/sitemap.html#archive';
	archiveLink.appendChild(document.createTextNode('Archives'));
	siteMap.appendChild(archiveLink);

	var pageName = location.href,pageHash;
	if (pageHash = pageName.lastIndexOf('#') +1)
		pageName = pageName.substring(0,pageHash-1);

	var links = siteMap.getElementsByTagName('a');
	for (var i=0;i<links.length;i++) {
		var linkText = links[i].nextSibling;
		if (!linkText) continue;
		if (linkText.nodeType == 3) {
			links[i].title = linkText.nodeValue.substring(2);
			linkText.parentNode.removeChild(linkText);
		}
		if (links[i].href == pageName)
			highlightLink(links[i])
	}
	
	document.getElementById('siteNav').appendChild(siteMap);
	document.getElementById('siteNav').onclick = openCloseNav;
	container.innerHTML = '';

	var currentLink = document.getElementById('youarehere');
	if (currentLink) {	
		while(currentLink != siteMap) {
			if (currentLink.nodeName == 'DIV') {
				currentLink.style.display = 'block';
				var relatedHeader = currentLink.previousSibling;
				while (relatedHeader.nodeType != 1)
					relatedHeader = relatedHeader.previousSibling;
				if (relatedHeader.nodeName.indexOf('H') == 0) {
					relatedHeader.className = 'opened';
					relatedHeader.relatedItem = currentLink;
					openCloseNav['previous' + relatedHeader.nodeName] = relatedHeader;
				}
			}
			currentLink = currentLink.parentNode;
		}
	}
/*	else {
		var archivedPage = true;
		for (var i=0;i<blogs.length;i++) {
			if (location.href.indexOf(blogs[i]) != -1) {
				archivedPage = false;
				break;
			}
		}
		if (archivedPage) {
			highlightLink(archiveLink)
			var x = document.createElement('p');
			x.className = 'archived';
			x.appendChild(document.createTextNode(archivedText));
			siteMap.appendChild(x);
		}
	} */
	document.getElementById('waitMessageNav').style.display = 'none';
}

function highlightLink(link) {
	link.id = 'youarehere';
	link.title = 'You are here';
	var originalText = link.firstChild.nodeValue;
	link.onclick = function () {
		this.firstChild.nodeValue = 'You are here';
		setTimeout(function () {
			link.firstChild.nodeValue = originalText;
		},1000);
		return false;
	};
}

function openCloseNav(e) {
	var evt = e || window.event;
	var evtTarget = evt.target || evt.srcElement;
	while (evtTarget.nodeType != 1)
		evtTarget = evtTarget.parentNode;
	if (evtTarget.nodeName.indexOf('H') != 0) return;

	if (!evtTarget.relatedItem) {
		var elementToBeOpened = evtTarget.nextSibling;
		while (elementToBeOpened.nodeType != 1)
			elementToBeOpened = elementToBeOpened.nextSibling;
		evtTarget.relatedItem = elementToBeOpened;
	}

	var newState = (evtTarget.relatedItem.style.display == 'block') ? 'none' : 'block';
	evtTarget.relatedItem.style.display = newState;
	evtTarget.className = (newState == 'none') ? '' : 'opened';
	
	if (Preferences.siteNavFold == 'one' && openCloseNav['previous' + evtTarget.nodeName]) {
		openCloseNav['previous' + evtTarget.nodeName].relatedItem.style.display = 'none';
		openCloseNav['previous' + evtTarget.nodeName].className = '';
		openCloseNav['previous' + evtTarget.nodeName] = null;
	}

	if (newState == 'block') {
		openCloseNav['previous' + evtTarget.nodeName] = evtTarget;
	}
	else {
		openCloseNav['previous' + evtTarget.nodeName] = undefined;
	}
}

var navStorage;

function removeMainNav() {
	var navElement = document.getElementById('siteNav');
	var nav = document.getElementById('mainMenu');
	if (nav) {
		navStorage = nav.parentNode.removeChild(nav);
		this.onclick = restoreMainNav;
	}
	else
		this.onclick = getMainNav;	
	this.innerHTML = 'show site navigation';
	this.className = '';
	return false;
}

function restoreMainNav() {
	document.getElementById('siteNav').appendChild(navStorage);
	this.innerHTML = 'hide site navigation';
	this.className = 'opened';
	this.onclick = removeMainNav;
	return false;
}

/* FOOTER */

function setFooter(req) {
	var footer = document.getElementById('footer');
	var valid = document.getElementById('validation');
	var validNotice;
	if (valid)
		validNotice = valid.parentNode.removeChild(valid);
	footer.innerHTML = req.responseText;
	if (validNotice) footer.appendChild(validNotice);
}

/***************************************/
/*                                     */
/*             UTILITIES               */
/*                                     */
/***************************************/


/* GETELEMENTSBYTAGNAMES */

function getElementsByTagNames(list,obj) {
	if (!obj) var obj = document;
	var tagNames = list.split(',');
	var resultArray = new Array();
	for (var i=0;i<tagNames.length;i++) {
		var tags = obj.getElementsByTagName(tagNames[i]);
		for (var j=0;j<tags.length;j++) {
			resultArray.push(tags[j]);
		}
	}
	var testNode = resultArray[0];
	if (!testNode) return [];
	if (testNode.sourceIndex) {
		resultArray.sort(function (a,b) {
				return a.sourceIndex - b.sourceIndex;
		});
	}
	else if (testNode.compareDocumentPosition) {
		resultArray.sort(function (a,b) {
				return 3 - (a.compareDocumentPosition(b) & 6);
		});
	}
	return resultArray;
}

/* LAST MODIFIED */

function lastMod(date) {
	var x = date || new Date (document.lastModified);
	Modif = new Date(x.toGMTString());
	Year = takeYear(Modif);
	Month = Modif.getMonth();
	Day = Modif.getDate();
	Mod = (Date.UTC(Year,Month,Day,0,0,0))/86400000;
	x = new Date();
	today = new Date(x.toGMTString());
	Year2 = takeYear(today);
	Month2 = today.getMonth();
	Day2 = today.getDate();
	now = (Date.UTC(Year2,Month2,Day2,0,0,0))/86400000;
	daysago = now - Mod;
	if (daysago < 0) return '';
	unit = 'days';
	if (daysago > 730) {
		daysago = Math.floor(daysago/365);
		unit = 'years';
	}
	else if (daysago > 60) {
		daysago = Math.floor(daysago/30);
		unit = 'months';
	}
	else if (daysago > 14) {
		daysago = Math.floor(daysago/7);
		unit = 'weeks'
	}
	var towrite = '';
	if (daysago == 0) towrite += 'today';
	else if (daysago == 1) towrite += 'yesterday';
	else towrite += daysago + ' ' + unit + ' ago';
	return towrite;
}


function takeYear(theDate) {
	var x = theDate.getYear();
	var y = x % 100;
	y += (y < 38) ? 2000 : 1900;
	return y;
}

/* XMLHTTP */

function sendRequest(url,callback,postData) {
	var req = createXMLHTTPObject();
	if (!req) return;
	var method = (postData) ? "POST" : "GET";
	req.open(method,url,true);
	req.setRequestHeader('User-Agent','XMLHTTP/1.0');
	if (postData)
		req.setRequestHeader('Content-type','application/x-www-form-urlencoded');
	req.onreadystatechange = function () {
		if (req.readyState != 4) return;
		if (req.status != 200 && req.status != 304) {
		//	alert('HTTP error ' + req.status);
			return;
		}
		callback(req);
	}
	if (req.readyState == 4) return;
	req.send(postData);
}

function XMLHttpFactories() {
	return [
		function () {return new XMLHttpRequest()},
		function () {return new ActiveXObject("Msxml2.XMLHTTP")},
		function () {return new ActiveXObject("Msxml3.XMLHTTP")},
		function () {return new ActiveXObject("Microsoft.XMLHTTP")}
	];
}

function createXMLHTTPObject() {
	var xmlhttp = false;
	var factories = XMLHttpFactories();
	for (var i=0;i<factories.length;i++) {
		try {
			xmlhttp = factories[i]();
		}
		catch (e) {
			continue;
		}
		break;
	}
	return xmlhttp;
}

/* COOKIES */

var Cookies = {
	init: function () {
		var allCookies = document.cookie.split('; ');
		for (var i=0;i<allCookies.length;i++) {
			var cookiePair = allCookies[i].split('=');
			this[cookiePair[0]] = cookiePair[1];
		}
	},
	create: function (name,value,days) {
		if (days) {
			var date = new Date();
			date.setTime(date.getTime()+(days*24*60*60*1000));
			var expires = "; expires="+date.toGMTString();
		}
		else var expires = "";
		document.cookie = name+"="+value+expires+"; path=/";
		this[name] = value;
	},
	erase: function (name) {
		this.create(name,'',-1);
		this[name] = undefined;
	}
};
Cookies.init();

/* INITIALISE PREFERENCES (needs cookies) */

var Preferences = {
	init: function () {
		if (!Cookies.sitePrefs) return;
		sitePrefs = Cookies.sitePrefs.split(',,');
		for (var i=0;i<sitePrefs.length;i++) {
			var oneSitePref = sitePrefs[i].split(':');
			this[oneSitePref[0]] = oneSitePref[1];
		}	
	}
};
Preferences.init();

function $(id) {
	return document.getElementById(id);
}

/* PUSH AND SHIFT FOR IE5 */

function Array_push() {
	var A_p = 0
	for (A_p = 0; A_p < arguments.length; A_p++) {
		this[this.length] = arguments[A_p]
	}
	return this.length
}

if (typeof Array.prototype.push == "undefined") {
	Array.prototype.push = Array_push
}

function Array_shift() {
	var A_s = 0
	var response = this[0]
	for (A_s = 0; A_s < this.length-1; A_s++) {
		this[A_s] = this[A_s + 1]
	}
	this.length--
	return response
}

if (typeof Array.prototype.shift == "undefined") {
	Array.prototype.shift = Array_shift
}

/* GET STYLES */

function getStyle(el,styleProp) {
	var x = document.getElementById(el);
	if (!x) return;
	if (x.currentStyle)
		var y = x.currentStyle[styleProp];
	else if (window.getComputedStyle)
		var y = document.defaultView.getComputedStyle(x,null).getPropertyValue(styleProp);
	return y;
}

/* ULTRA-SIMPLE EVENT ADDING */

function addEventSimple(obj,evt,fn) {
	if (obj.addEventListener)
		obj.addEventListener(evt,fn,false);
	else if (obj.attachEvent)
		obj.attachEvent('on'+evt,fn);
}

function removeEventSimple(obj,evt,fn) {
	if (obj.removeEventListener)
		obj.removeEventListener(evt,fn,false);
	else if (obj.detachEvent)
		obj.detachEvent('on'+evt,fn);
}

/* TRANSFORMATION */

var transform = {
	object: undefined,
	init: function () {
		this.object = document.createElement('div');
	},
	DomToString: function (DOMTree) {			// gets documentFragment or other valid DOM tree
		this.object.innerHTML = '';
		this.object.appendChild(DOMTree.cloneNode(true));
		return this.object.innerHTML;			// returns string
	},
	StringToDom: function (string) {			// gets string
		this.object.innerHTML = string;
		var container = document.createDocumentFragment();
		var children = this.object.childNodes;
		for (var i=0;i<children.length;i++) {
			container.appendChild(children[i].cloneNode(true));
		}
		return container;				// returns documentFragment
	}
}
transform.init();
