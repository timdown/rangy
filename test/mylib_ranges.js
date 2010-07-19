// My Library text selection add-on

var global = this, API, D, C;

if (API && API.attachDocumentReadyListener) {
  API.attachDocumentReadyListener(function() {
    var isHostMethod = API.isHostMethod, isHostObjectProperty = API.isHostObjectProperty, getDocumentWindow = API.getDocumentWindow;
    var getSelection, clearDocumentSelection, selectionToRange, getControlSelection, setControlSelection, clearControlSelection, getSelectionText;
    var body, el, doc = global.document;

    if (isHostMethod(global, 'getSelection') && getDocumentWindow) {
      getSelection = function(doc) {
        return getDocumentWindow(doc).getSelection();
      };
    } else if (isHostObjectProperty(global.document, 'selection')) {
      getSelection = function(doc) {
        return (doc || global.document).selection;
      };
    }

    var rangeText = function(range) {
      if (typeof range.text == 'string') {
        return range.text;
      }
      if (isHostMethod(range, 'toString')) {
        return range.toString();
      }
    };

    if (getSelection) {
      getSelectionText = function(selection) {
        var range = selectionToRange(selection);
        if (range) {
          return rangeText(range);
        }
        if (isHostMethod(selection, 'toString')) {
          return selection.toString();
        }
        return '';
      };
      selectionToRange = function(selection) {
        if (isHostMethod(selection, 'getRangeAt')) {
          return selection.rangeCount ? selection.getRangeAt(0) : null;
        }
        if (isHostMethod(selection, 'createRange')) {
           return selection.createRange();
        }
        return null;
      };
    }

    if (selectionToRange) {
      clearDocumentSelection = function(doc) {
        var selection = getSelection(doc);

        if (isHostMethod(selection, 'empty')) {
          selection.empty();
        } else if (isHostMethod(selection, 'collapseToStart')) {
          selection.collapseToStart();
        }
        var range = selectionToRange(selection);
        if (range && isHostMethod(range, 'collapse')) {
          range.collapse(true);
          range.select();
        }
      };
      API.getHostRange = function(doc) {
        return selectionToRange(getSelection(doc));
      };
    }

    if (clearDocumentSelection) {
      API.clearDocumentSelection = function(doc) {
        clearDocumentSelection(doc);
      };
    }

    API.getDocumentSelectionText = function(doc) {
      return getSelectionText(getSelection(doc));
    };

    el = doc.createElement('input');
    body = API.getBodyElement();

    if (isHostMethod(doc, 'createElement') && body && isHostMethod(body, 'appendChild') && el) {
      body.appendChild(el);
      if (typeof el.selectionStart == 'number') {
        getControlSelection = function(el) {
          var start = el.selectionStart, end = el.selectionEnd;
          return [start, end, el.value.substring(start, end)];
        };
        setControlSelection = function(el, start, end) {
          el.selectionStart = start;
          el.selectionEnd = end;
        };
      } else if (selectionToRange) {
        getControlSelection = function(el) {
          var documentRange, elementRange, len, start;

          if (isHostMethod(el, 'focus')) {
            el.focus();
          }
          documentRange = selectionToRange(getSelection());
          if (documentRange) {
            if (isHostMethod(documentRange, 'duplicate')) {
              elementRange = documentRange.duplicate();
              if (el.tagName == 'INPUT') {
                elementRange.expand('textedit');
              } else {
                elementRange.moveToElementText(el);
              }
              len = elementRange.text.length;
              elementRange.setEndPoint('starttostart', documentRange);
              start = len - elementRange.text.length;
              var text = documentRange.text.replace(/\r\n/g, '\n');
              return ([start, start + text.length, text]);
            }
          }
          return null;
        };

        if (isHostMethod(el, 'createTextRange')) {
          setControlSelection = function(el, start, end) {
            var selection, range = el.createTextRange();

            range.collapse();
            range.moveStart('character', start);
            range.moveEnd('character', end - start);
            range.select();
            selection = getControlSelection(el);
            if (selection[0] != start) {
              range.moveStart('character', start - selection[0]);
              range.moveEnd('character', start - selection[0]);
              range.select();
            }
          };
        }
      }
      body.removeChild(el);
    }

    API.getControlSelection = getControlSelection;
    API.setControlSelection = setControlSelection;

    if (setControlSelection) {
      clearControlSelection = API.clearControlSelection = function(el) {
        setControlSelection(el, 0, 0);
      };
    }

    if (C && C.prototype && getControlSelection) {
      if (setControlSelection) {
        C.prototype.getSelection = function() {
          return getControlSelection(this.element());
        };
        C.prototype.setSelection = function(start, end) {
          setControlSelection(this.element(), start, end);
          return this;
        };
        C.prototype.clearSelection = function() {
          clearControlSelection(this.element());
          return this;
        };
      }
    }
    if (D && D.prototype && getSelectionText) {
      D.prototype.getSelectionText = function() {
        return getSelectionText(getSelection(this.node()));
      };
      if (clearDocumentSelection) {
        D.prototype.clearSelection = function() {
          clearDocumentSelection(this.node());
          return this;
        };
      }
    }
    doc = el = null;
  });
}