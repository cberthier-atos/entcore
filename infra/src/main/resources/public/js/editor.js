window.RTE = (function(){
	return {
		Instance: function(data){
			var that = this;
			this.states = [];
			this.stateIndex = 0;
			this.editZone = this.element.children('[contenteditable]');
			this.selection = new RTE.Selection({
				instance: this,
				editZone: this.editZone
			});

			this.focus = function(){
				var sel = window.getSelection();
				sel.removeAllRanges();
				sel.addRange(this.selection.range);
			};

			this.execCommand = function(commandId, useUi, value){
				this.addState(this.editZone.html());
				document.execCommand(commandId, useUi, value);

				this.trigger('contentupdated');
			};

			var mousePosition = {};
			this.editZone.on('mousemove', function(e){
				mousePosition = {
					left: e.pageX,
					top: e.pageY
				}
			});

			var contextualMenu = this.element.children('contextual-menu');
			contextualMenu.on('contextmenu', function(e){
				e.preventDefault();
				return false;
			});
			this.bindContextualMenu = function(selector, items){
				this.editZone.on('contextmenu', selector, function(e){
					e.preventDefault();
					return false;
				});
				this.editZone.on('mousedown', selector, function(e){
					if(e.which === 3){
						contextualMenu.children('ul').html('');
						items.forEach(function(item){
							var node = $('<li></li>');
							node.on('click', function(event){
								item.action(e);
							});
							node.html(lang.translate(item.label));
							contextualMenu.children('ul').append(node)
						});

						contextualMenu.addClass('show');
						e.preventDefault();
						contextualMenu.offset({
							top: mousePosition.top,
							left: mousePosition.left
						});

						contextualMenu.children('li').on('click', function(){
							contextualMenu.removeClass('show');
						});
					}
				});
			};

			$('body').on('click', function(e){
				contextualMenu.removeClass('show');
			});

			$('body').on('mouseup', function(){
				if(!that.selection.changed()){
					return;
				}
				that.trigger('selectionchange', {
					selection: that.selection
				});
			});

			data.element.on('keyup', function(e){
				that.trigger('contentupdated');
				if(!that.selection.changed()){
					return;
				}
				that.trigger('selectionchange', {
					selection: that.selection
				});
				that.scope.$apply();
			});

			this.applyState = function(){
				this.editZone.html(
						this.compile(this.states[this.stateIndex - 1])(this.scope)
				);
			};

			this.undo = function(){
				if(this.stateIndex === 0){
					return;
				}
				this.stateIndex --;
				this.applyState();
			};

			this.redo = function(){
				if(this.stateIndex === this.states.length || this.stateIndex === 0){
					return;
				}
				this.stateIndex ++;
				this.applyState();
			};

			this.addState = function(state){
				if(state === this.states[this.states.length - 1]){
					return;
				}
				if(this.stateIndex === this.states.length){
					this.states.push(state);
					this.stateIndex ++;
				}
				else{
					this.states = this.states.slice(0, this.stateIndex);
					this.addState(state);
				}
			};

			this.toolbar = new RTE.Toolbar(this);
		},
		Selection: function(){
			var that = this;
			this.selectedElements = [];

			function getSelectedElements(){
				var selection = getSelection();
				if(!selection.rangeCount){
					return;
				}
				var range = selection.getRangeAt(0);
				if(!range.intersectsNode(that.editZone[0])){
					return;
				}
				var selector = [];
				if(range.startContainer === range.endContainer){
					if(range.startContainer.childNodes.length){
						for(var i = range.startOffset; i < range.endOffset; i++){
							selector.push(range.startContainer.childNodes[i]);
						}
					}
					else{
						if(range.startContainer !== that.editZone[0]){
							selector.push(range.startContainer);
						}
						else{
							return;
						}
					}
				}
				else {
					selector.push(range.startContainer);
					that.editZone.find('*').each(function (index, item) {
						if (range.intersectsNode(item) && item !== range.startContainer.parentElement && item !== range.endContainer.parentElement && !$(item).find(range.startContainer.parentElement).length && !$(item).find(range.endContainer.parentElement).length) {
							selector.push(item);
						}
					});

					if (range.endContainer !== that.editZone[0]) {
						selector.push(range.endContainer);
					}
				}

				return selector;
			}

			this.changed = function(){
				var sel = getSelection();
				if(sel.rangeCount === 0){
					return;
				}
				var range = sel.getRangeAt(0);
				var same = this.range && this.range.startContainer === range.startContainer && this.range.startOffset === range.startOffset
						&& this.range.endContainer === range.endContainer && range.endOffset === this.range.endOffset;
				var selectedElements = getSelectedElements();

				if(!same && selectedElements){
					this.selectedElements = selectedElements || this.selectedElements;
				}
				if(!same){
					this.range = range;
				}
				return !same;
			};

			this.selectedElements = getSelectedElements() || this.selectedElements;

			this.moveCaret = function(element, offset){
				if(!offset){
					offset = 0;
				}

				var range = document.createRange();
				range.setStart(element.firstChild || element, offset);
				this.range = range;

				var sel = getSelection();
				sel.removeAllRanges();
				sel.addRange(range);
			};

			this.selectNode = function(element, start, end){
				var range = document.createRange();
				var sel = getSelection();

				if(!start && !end){
					range.selectNode(element);
					this.range = range;

					sel.removeAllRanges();
					sel.addRange(range);
					return;
				}

				if(!element.innerText){
					return;
				}
				if(!start){
					start = 0;
				}
				if(!end){
					end = element.innerText.length;
				}

				range.setStart(element.firstChild || element, start);
				range.setEnd(element.firstChild || element, end);
				this.range = range;

				sel.removeAllRanges();
				sel.addRange(range);
			};

			this.wrap = function(element){
				that.instance.addState(that.editZone.html());
				if(!this.selectedElements.length){
					element.html('<br />');
					var elementAtCaret = this.range.startContainer;
					$(elementAtCaret).wrapInner(element);
					this.moveCaret(element[0]);
				}
				else{
					this.selectedElements.forEach(function(item){
						var el = $(element[0].outerHTML);
						el.html(item.innerHTML || item.textContent);
						if(!item.parentNode){
							return;
						}
						item.parentNode.replaceChild(el[0], item);
						that.selectNode(el[0])
					});
				}

				this.trigger('contentupdated');
			};

			this.wrapText = function(el){
				this.instance.addState(this.editZone.html());
				if(!this.selectedElements.length){
					el.html('<br />');
					this.editZone.append(el);
					this.selectNode(el[0]);
				}
				else{
					var addedNodes = [];
					this.selectedElements.forEach(function(item, index){
						var node = $(el[0].outerHTML);
						if(item.nodeType === 1){
							$(item).wrap(node);
						}
						else{
							if(index === 0 && that.range.startOffset >= 0 && that.range.startContainer !== that.range.endContainer){
								el.html(item.textContent.substring(that.range.startOffset));
								item.parentElement.insertBefore(el[0], item.nextSibling);
								item.textContent = item.textContent.substring(0, that.range.startOffset);
							}
							else if(index === that.selectedElements.length - 1 && that.range.endOffset <= item.textContent.length && that.range.startContainer !== that.range.endContainer){
								el.text(item.textContent.substring(0, that.range.endOffset));
								item.parentElement.insertBefore(el[0], item);
								item.textContent = item.textContent.substring(that.range.endOffset);
							}
							else if(that.range.startContainer === that.range.endContainer && index === 0){
								el.html(item.textContent.substring(that.range.startOffset, that.range.endOffset));
								var textBefore = document.createTextNode('');
								textBefore.textContent = item.textContent.substring(0, that.range.startOffset);
								item.parentElement.insertBefore(el[0], item);
								item.parentElement.insertBefore(textBefore, el[0]);
								item.textContent = item.textContent.substring(that.range.endOffset);
							}
							addedNodes.push(el[0]);
						}
					});
					addedNodes.forEach(that.selectNode);
				}

				that.instance.trigger('contentupdated');
			};

			function applyCSS(css){
				that.instance.addState(that.editZone.html());
				if(!that.selectedElements.length){
					var el = $('<span></span>');
					el.css(style);
					that.editZone.append(el);
					that.moveCaret(el[0]);
				}
				else{
					var addedNodes = [];
					that.selectedElements.forEach(function(item, index){
						if(item.nodeType === 1){
							$(item).css(css);
						}
						else{
							var el = $('<span></span>');
							el.css(css);

							if(index === 0 && that.range.startOffset >= 0 && that.range.startContainer !== that.range.endContainer){
								el.html(item.textContent.substring(that.range.startOffset));
								item.parentElement.insertBefore(el[0], item.nextSibling);
								item.textContent = item.textContent.substring(0, that.range.startOffset);
							}
							else if(index === that.selectedElements.length - 1 && that.range.endOffset <= item.textContent.length && that.range.startContainer !== that.range.endContainer){
								el.text(item.textContent.substring(0, that.range.endOffset));
								item.parentElement.insertBefore(el[0], item);
								item.textContent = item.textContent.substring(that.range.endOffset);
							}
							else if(that.range.startContainer === that.range.endContainer && index === 0){
								el.html(item.textContent.substring(that.range.startOffset, that.range.endOffset));
								var textBefore = document.createTextNode('');
								textBefore.textContent = item.textContent.substring(0, that.range.startOffset);
								item.parentElement.insertBefore(el[0], item);
								item.parentElement.insertBefore(textBefore, el[0]);
								item.textContent = item.textContent.substring(that.range.endOffset);
							}
							addedNodes.push(el[0]);
						}
					});
					addedNodes.forEach(that.selectNode);
				}

				that.instance.trigger('contentupdated');
			}

			this.css = function(params){
				if(typeof params === 'object'){
					applyCSS(params);
				}
				else{
					getCSS(params);
				}
			};

			this.replaceHTML = function(htmlContent){
				that.instance.addState(that.editZone.html());
				var wrapper = $('<div></div>');
				wrapper.html(htmlContent);
				if(this.range){
					this.range.insertNode(wrapper[0]);
				}
				else{
					this.editZone.append(wrapper);
				}
				this.instance.trigger('contentupdated');
			};

			this.$ = function(){
				var jSelector = $();
				this.selectedElements.forEach(function(item){
					if(item.nodeType === 1){
						jSelector = jSelector.add(item);
					}
					else{
						jSelector = jSelector.add(item.parentElement);
					}

				});
				return jSelector;
			};
		},
		Toolbar: function(instance){
			instance.toolbarConfiguration.options.forEach(function(option){
				var optionElement = $('<div></div>');
				optionElement.addClass('option');
				optionElement.addClass(option.name.replace(/([A-Z])/g, "-$1").toLowerCase());
				instance.element.find('editor-toolbar').append(optionElement);
				var optionScope = instance.scope.$new();

				var optionResult = option.run(instance);
				optionElement.html(instance.compile(optionResult.template)(optionScope));
				optionResult.link(optionScope, optionElement, instance.attributes);
			});
		},
		ToolbarConfiguration: function(){
			this.collection(RTE.Option);
			this.option = function(name, fn){
				this.options.push({
					name: name,
					run: fn
				});
			};
		},
		Option: function(){

		},
		setModel: function(){
			model.makeModels(RTE);
			RTE.baseToolbarConf = new RTE.ToolbarConfiguration();
		},
		addDirectives: function(module){
			this.setModel();

			// Editor options
			RTE.baseToolbarConf.option('undo', function(instance){
				return {
					template: '<i tooltip="editor.option.undo"></i>',
					link: function(scope, element, attributes){
						element.addClass('disabled');
						element.on('click', function(){
							instance.undo();
							if(instance.stateIndex === 0){
								element.addClass('disabled');
							}
							else{
								element.removeClass('disabled');
							}
							instance.trigger('contentupdated')
						});

						instance.on('contentupdated', function(e){
							if(instance.stateIndex === 0){
								element.addClass('disabled');
							}
							else{
								element.removeClass('disabled');
							}
						});
					}
				};
			});

			RTE.baseToolbarConf.option('redo', function(instance){
				return {
					template: '<i tooltip="editor.option.redo"></i>',
					link: function(scope, element, attributes){
						element.addClass('disabled');
						element.on('click', function(){
							instance.redo();
							if(instance.stateIndex === instance.states.length - 1){
								element.addClass('disabled');
							}
							else{
								element.removeClass('disabled');
							}
							instance.trigger('contentupdated');
						});

						instance.on('contentupdated', function(e){
							if(!document.queryCommandEnabled('redo')){
								element.addClass('disabled');
							}
							else{
								element.removeClass('disabled');
							}
						});
					}
				};
			});

			RTE.baseToolbarConf.option('bold', function(instance){
				return {
					template: '<i tooltip="editor.option.bold"></i>',
					link: function(scope, element, attributes){
						element.on('click', function(){
							instance.execCommand('bold');
							if(document.queryCommandState('bold')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});

						instance.on('selectionchange', function(e){
							if(document.queryCommandState('bold')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});
					}
				};
			});

			RTE.baseToolbarConf.option('italic', function(instance){
				return {
					template: '<i tooltip="editor.option.italic"></i>',
					link: function(scope, element, attributes){
						element.on('click', function(){
							instance.execCommand('italic');
							if(document.queryCommandState('italic')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});

						instance.on('selectionchange', function(e){
							if(document.queryCommandState('italic')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});
					}
				};
			});

			RTE.baseToolbarConf.option('underline', function(instance){
				return {
					template: '<i tooltip="editor.option.underline"></i>',
					link: function(scope, element, attributes){
						element.on('click', function(){
							instance.execCommand('underline');
							if(document.queryCommandState('underline')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});

						instance.on('selectionchange', function(e){
							if(document.queryCommandState('underline')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});
					}
				};
			});

			RTE.baseToolbarConf.option('removeFormat', function(instance){
				return {
					template: '<i tooltip="editor.option.removeformat"></i>',
					link: function(scope, element, attributes){
						element.on('click', function(){
							instance.execCommand('removeFormat');
							if(document.queryCommandEnabled('removeFormat')){
								element.removeClass('disabled');
							}
							else{
								element.addClass('disabled');
							}
						});

						instance.on('selectionchange', function(e){
							if(document.queryCommandEnabled('removeFormat')){
								element.removeClass('disabled');
							}
							else{
								element.addClass('disabled');
							}
						});
					}
				};
			});

			RTE.baseToolbarConf.option('justifyLeft', function(instance){
				return {
					template: '<i tooltip="editor.option.justify.left"></i>',
					link: function(scope, element, attributes){
						element.addClass('toggled');
						element.on('click', function(){
							instance.execCommand('justifyLeft');
							if(document.queryCommandState('justifyLeft')){
								element.addClass('toggled');
								instance.trigger('justify-changed');
							}
							else{
								element.removeClass('toggled');
							}
						});

						instance.on('selectionchange', function(e){
							if(document.queryCommandState('justifyLeft')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});

						instance.on('justify-changed', function(e){
							if(document.queryCommandState('justifyLeft')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});
					}
				};
			});

			RTE.baseToolbarConf.option('justifyRight', function(instance){
				return {
					template: '<i tooltip="editor.option.justify.right"></i>',
					link: function(scope, element, attributes){
						element.on('click', function(){
							if(!document.queryCommandState('justifyRight')){
								instance.execCommand('justifyRight');
								element.addClass('toggled');
							}
							else{
								instance.execCommand('justifyLeft');
								element.removeClass('toggled');
								instance.trigger('justify-changed');
							}
						});

						instance.on('selectionchange', function(e){
							if(document.queryCommandState('justifyRight')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});

						instance.on('justify-changed', function(e){
							if(document.queryCommandState('justifyRight')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});
					}
				};
			});

			RTE.baseToolbarConf.option('justifyCenter', function(instance){
				return {
					template: '<i tooltip="editor.option.justify.center"></i>',
					link: function(scope, element, attributes){
						element.on('click', function(){
							if(!document.queryCommandState('justifyCenter')){
								instance.execCommand('justifyCenter');
								element.addClass('toggled');
							}
							else{
								instance.execCommand('justifyLeft');
								element.removeClass('toggled');
								instance.trigger('justify-changed');
							}
						});

						instance.on('selectionchange', function(e){
							if(document.queryCommandState('justifyCenter')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});

						instance.on('justify-changed', function(e){
							if(document.queryCommandState('justifyCenter')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});
					}
				};
			});

			RTE.baseToolbarConf.option('justifyFull', function(instance){
				return {
					template: '<i tooltip="editor.option.justify.full"></i>',
					link: function(scope, element, attributes){
						element.on('click', function(){
							if(!document.queryCommandState('justifyFull')){
								element.addClass('toggled');
								instance.execCommand('justifyFull');
							}
							else{
								instance.execCommand('justifyLeft');
								element.removeClass('toggled');
								instance.trigger('justify-changed');
							}
						});

						instance.on('selectionchange', function(e){
							if(document.queryCommandState('justifyFull')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});

						instance.on('justify-changed', function(e){
							if(document.queryCommandState('justifyFull')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});
					}
				};
			});

			RTE.baseToolbarConf.option('subscript', function(instance){
				return {
					template: '<i tooltip="editor.option.subscript"></i>',
					link: function(scope, element, attributes){
						element.on('click', function(){
							instance.execCommand('subscript');
							if(document.queryCommandState('subscript')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});

						instance.on('selectionchange', function(e){
							if(document.queryCommandState('subscript')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});
					}
				};
			});

			RTE.baseToolbarConf.option('superscript', function(instance){
				return {
					template: '<i tooltip="editor.option.superscript"></i>',
					link: function(scope, element, attributes){
						element.on('click', function(){
							instance.execCommand('superscript');
							if(document.queryCommandState('superscript')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});

						instance.on('selectionchange', function(e){
							if(document.queryCommandState('superscript')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});
					}
				};
			});

			RTE.baseToolbarConf.option('ulist', function(instance){
				return {
					template: '<i tooltip="editor.option.ulist"></i>',
					link: function(scope, element, attributes){
						element.on('click', function(){
							instance.execCommand('insertUnorderedList');
							if(document.queryCommandState('insertUnorderedList')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});

						instance.on('selectionchange', function(e){
							if(document.queryCommandState('insertUnorderedList')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});
					}
				};
			});

			RTE.baseToolbarConf.option('olist', function(instance){
				return {
					template: '<i tooltip="editor.option.olist"></i>',
					link: function(scope, element, attributes){
						element.on('click', function(){
							instance.execCommand('insertOrderedList');
							if(document.queryCommandState('insertOrderedList')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});

						instance.on('selectionchange', function(e){
							if(document.queryCommandState('insertOrderedList')){
								element.addClass('toggled');
							}
							else{
								element.removeClass('toggled');
							}
						});
					}
				};
			});

			RTE.baseToolbarConf.option('color', function(instance){
				return {
					template: '<input tooltip="editor.option.color" type="color" />',
					link: function(scope, element, attributes){
						if(!$.spectrum){
							$.spectrum = {};
							http().get('/infra/public/spectrum/spectrum.js').done(function(data){
								eval(data);
							});
							var stylesheet = $('<link rel="stylesheet" type="text/css" href="/infra/public/spectrum/spectrum.css" />');
							$('head').prepend(stylesheet);
						}
						scope.foreColor = "#000000";
						element.children('input').on('change', function(){
							scope.foreColor = $(this).val();
							scope.$apply('foreColor');
						});

						scope.$watch('foreColor', function(){
							instance.execCommand('foreColor', false, scope.foreColor);
						});

						instance.on('selectionchange', function(e){
							function rgb(r, g, b){
								return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
							}
							var rgba = rgb;
							scope.backColor = eval(document.queryCommandValue('backColor'));
							scope.foreColor = document.queryCommandValue('foreColor');
							element.children('input').val(eval(scope.foreColor));
						});
					}
				};
			});

			RTE.baseToolbarConf.option('backgroundColor', function(instance){
				return {
					template: '<input tooltip="editor.option.backgroundcolor" type="color" />',
					link: function(scope, element, attributes){
						if(!$.spectrum){
							$.spectrum = {};
							http().get('/infra/public/spectrum/spectrum.js').done(function(data){
								eval(data);
							});
							var stylesheet = $('<link rel="stylesheet" type="text/css" href="/infra/public/spectrum/spectrum.css" />');
							$('head').prepend(stylesheet);
						}

						element.children('input').on('change', function(){
							scope.backColor = $(this).val();
							scope.$apply('backColor');
						});

						scope.$watch('backColor', function(){
							instance.execCommand('backColor', false, scope.backColor);
						});

						instance.on('selectionchange', function(e){
							function rgb(r, g, b){
								return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
							}
							var rgba = rgb;
							scope.backColor = eval(document.queryCommandValue('backColor'));
							scope.backColor = document.queryCommandValue('backColor');
							element.children('input').val(eval(scope.backColor));
						});
					}
				};
			});

			RTE.baseToolbarConf.option('font', function(instance){
				return {
					template:
					'<select-list ng-model="font" display-as="fontFamily" placeholder="Police" ng-change="setFontFamily()">' +
					'<opt ng-repeat="font in fonts" value="font" style="font-family: [[font.fontFamily]]">[[font.fontFamily]]</opt>' +
					'</select-list>',
					link: function(scope, element, attributes){
						var importedFonts =
							_.map(
								_.flatten(
									_.map(
										document.styleSheets,
										function(stylesheet){
											return _.filter(
												stylesheet.cssRules,
												function(cssRule){
													return cssRule instanceof CSSFontFaceRule &&
														cssRule.style.fontFamily.toLowerCase().indexOf('fontello') === -1 &&
														cssRule.style.fontFamily.toLowerCase().indexOf('glyphicon') === -1 &&
														cssRule.style.fontFamily.toLowerCase().indexOf('fontawesome') === -1;
												}
											)
										}
									)
								),
								function(fontFace){
									return {
										fontFamily: fontFace.style.fontFamily
									}
								}
							);
						scope.fonts = [{ fontFamily: 'Arial' }, { fontFamily: 'Verdana' }, { fontFamily: 'Tahoma' }, { fontFamily: "'Comic Sans MS'" }].concat(importedFonts);
						scope.font = _.findWhere(scope.fonts, { fontFamily: $('p').css('font-family') });
						scope.setFontFamily = function(){
							instance.execCommand('fontName', false, scope.font.fontFamily);
						};

						instance.on('selectionchange', function(e){
							scope.font = _.findWhere(scope.fonts, { fontFamily: document.queryCommandValue('fontName') });
						});
					}
				};
			});

			RTE.baseToolbarConf.option('fontSize', function(instance) {
				return {
					template: '<select-list ng-model="fontSize" placeholder="Taille" ng-change="setSize()">' +
					'<opt ng-repeat="fontSize in fontSizes" value="fontSize" style="font-size: [[fontSize]]px; line-height: [[fontSize]]px">[[fontSize]]</opt>' +
					'</select-list>',
					link: function(scope, element, attributes){
						scope.fontSizes = [8,10,12,14,16,18,20,24,28,34,42,64,72];
						scope.setSize = function(){
							instance.selection.css({
								'font-size': scope.fontSize + 'px'
							});
						};
						instance.on('selectionchange', function(e){
							scope.fontSize = parseInt(instance.selection.$().css('font-size'));
						});
					}
				}
			});

			RTE.baseToolbarConf.option('format', function(instance) {
				return {
					template: '<select-list ng-model="format" placeholder="Paragraphe" display-as="label" ng-change="wrap()">' +
					'<opt ng-repeat="format in formats" value="format"><div bind-html="format.option"></div></opt>' +
					'</select-list>',
					link: function(scope, element, attributes){
						scope.formats = [
							{
								apply: { tag: 'p' },
								option: '<p>[[format.label]]</p>',
								label: 'Paragraphe'
							},
							{
								apply: { tag: 'h1' },
								option: '<h1>[[format.label]]</h1>',
								label: 'Titre'
							},
							{
								apply: { tag: 'h2' },
								option: '<h2>[[format.label]]</h2>',
								label: 'Titre 2'
							},
							{
								apply: { tag: 'h3' },
								option: '<h3>[[format.label]]</h3>',
								label: 'Titre 3'
							},
							{
								apply: { tag: 'p', classes: ['info'] },
								option: '<p class="info">[[format.label]]</p>',
								label: 'Information'
							},
							{
								apply: { tag: 'p', classes: ['warning'] },
								option: '<p class="warning">[[format.label]]</p>',
								label: 'Avertissement'
							}
						];

						instance.on('selectionchange', function(e){
							var found = false;
							scope.formats.forEach(function(format){
								if(e.selection.$().is(format.apply.tag)){
									scope.format = format;
									found = true;
								}
							});
							if(!found){
								scope.format = scope.formats[0];
							}
						});

						scope.wrap = function(){
							var newEl = $('<' + scope.format.apply.tag + '></' + scope.format.apply.tag + '>');
							if(scope.format.apply.classes){
								scope.format.apply.classes.forEach(function(element){
									newEl.addClass(element);
								});
							}

							instance.selection.wrap(newEl);
						}
					}
				}
			});

			RTE.baseToolbarConf.option('image', function(instance){
				return {
					template: '<i ng-click="display.pickFile = true" tooltip="editor.option.image"></i>' +
					'<lightbox show="display.pickFile" on-close="display.pickFile = false;">' +
					'<media-library ng-change="updateContent()" ng-model="display.file" file-format="\'img\'"></media-library>' +
					'</lightbox>',
					link: function(scope, element, attributes){
						instance.editZone.addClass('drawing-zone');
						scope.display = {};
						scope.updateContent = function(){
							instance.selection.replaceHTML('<img src="/workspace/document/' + scope.display.file._id + '" draggable native />')
							scope.display.pickFile = false;
							scope.display.file = undefined;
						};

						instance.element.on('drop', function(e){
							//delay to account for image destruction and recreation
							setTimeout(function(){
								ui.extendElement.resizable(instance.editZone.find('img'), { moveWithResize: false });
							}, 200)
						});
					}
				}
			});

			RTE.baseToolbarConf.option('sound', function(instance){
				return {
					template: '<i ng-click="display.pickFile = true" tooltip="editor.option.sound"></i>' +
					'<lightbox show="display.pickFile" on-close="display.pickFile = false;">' +
					'<media-library ng-change="updateContent()" ng-model="display.file" file-format="\'audio\'"></media-library>' +
					'</lightbox>',
					link: function(scope, element, attributes){
						instance.editZone.addClass('drawing-zone');
						scope.display = {};
						scope.updateContent = function(){
							instance.selection.replaceHTML(
								'<div><br /></div>' +
								'<div><audio src="/workspace/document/' + scope.display.file._id + '" controls draggable native></audio></div>' +
								'<div><br /></div>'
							);
							scope.display.pickFile = false;
							scope.display.file = undefined;
						};

						instance.element.on('drop', function(e){
							//delay to account for sound destruction and recreation
							setTimeout(function(){
								ui.extendElement.resizable(instance.editZone.find('audio'), { moveWithResize: false });
							}, 200)
						});
					}
				}
			});

			RTE.baseToolbarConf.option('mathjax', function(instance){
				return {
					template: '<i ng-click="display.fillFormula = true" tooltip="editor.option.mathjax"></i>' +
					'<lightbox show="display.fillFormula" on-close="display.fillFormula = false;">' +
					'<textarea ng-model="display.formula"></textarea>' +
					'<mathjax formula="[[display.formula]]"></mathjax>' +
					'<div class="row">' +
					'<button type="button" ng-click="updateContent()" class="right-magnet"><i18n>apply</i18n></button>' +
					'<button type="button" ng-click="display.fillFormula = false" class="right-magnet cancel"><i18n>cancel</i18n></button>' +
					'</div>' +
					'</lightbox>',
					link: function(scope, element, attributes){
						scope.display = {
							formula: '{-b \\pm \\sqrt{b^2-4ac} \\over 2a}'
						};
						scope.updateContent = function(){
							instance.selection.replaceHTML(instance.compile('<mathjax formula="' + scope.display.formula + '"></mathjax>')(scope));
							scope.display.fillFormula = false;
						};
					}
				}
			});

			RTE.baseToolbarConf.option('linker', function(instance){
				return {
					template: '<i ng-click="display.chooseLink = true" tooltip="editor.option.link"></i>' +
					'<div ng-include="\'/infra/public/template/linker.html\'"></div>',
					link: function(scope, element, attributes){
						scope.linker = {
							display: {},
							apps: [],
							search: {
								application: {},
								text: ''
							},
							params: {},
							resource: {}
						};

						scope.linker.loadApplicationResources = function(cb){
							var split = scope.linker.search.application.address.split('/');
							var prefix = split[split.length - 1];
							scope.linker.params.appPrefix = prefix;
							if(!cb){
								cb = function(){
									scope.linker.searchApplication();
									scope.$apply('linker');
								};
							}
							Behaviours.applicationsBehaviours[prefix].loadResources(cb);
							scope.linker.addResource = Behaviours.applicationsBehaviours[prefix].create;
						};

						scope.linker.searchApplication = function(cb){
							var split = scope.linker.search.application.address.split('/');
							var prefix = split[split.length - 1];
							scope.linker.params.appPrefix = prefix;
							Behaviours.loadBehaviours(scope.linker.params.appPrefix, function(appBehaviour){
								scope.linker.resources = _.filter(appBehaviour.resources, function(resource) {
									return scope.linker.search.text !== '' && (lang.removeAccents(resource.title.toLowerCase()).indexOf(lang.removeAccents(scope.linker.search.text).toLowerCase()) !== -1 ||
										resource._id === scope.linker.search.text);
								});
								scope.linker.resource.title = scope.linker.search.text;
								if(typeof cb === 'function'){
									cb();
								}
							});
						};

						scope.linker.createResource = function(){
							Behaviours.loadBehaviours(scope.linker.params.appPrefix, function(appBehaviour){
								appBehaviour.create(scope.linker.resource, function(){
									scope.linker.searchApplication();
									scope.linker.search.text = scope.linker.resource.title;
									scope.$apply();
								});
							});
						};

						scope.linker.applyLink = function(link){
							scope.linker.params.link = link;
						};

						scope.linker.applyResource = function(resource){
							scope.linker.params.link = resource.path;
							scope.linker.params.id = resource._id;
						};

						scope.linker.saveLink = function(){
							if(scope.linker.params.blank){
								scope.linker.params.target = '_blank';
							}

							var linkNode = $('<a></a>');
							if(scope.linker.params.link){
								linkNode.attr('href', scope.linker.params.link);

								if(scope.linker.params.appPrefix){
									linkNode.attr('data-app-prefix', scope.linker.params.appPrefix);
									if(scope.linker.params.appPrefix !== 'workspace' && !scope.linker.externalLink){
										linkNode.data('reload', true);
									}
								}
								if(scope.linker.params.id){
									linkNode.attr('data-id', scope.linker.params.id);
								}
								if(scope.linker.params.blank){
									scope.linker.params.target = '_blank';
									linkNode.attr('target', scope.linker.params.target);
								}
								if(scope.linker.params.tooltip){
									linkNode.attr('tooltip', scope.linker.params.tooltip);
								}
							}

							instance.focus();

							if(instance.selection.selectedElements.length === 0){
								linkNode.text(scope.linker.params.link);
								instance.selection.replaceHTML(linkNode[0].outerHTML);
							}
							else{
								instance.selection.wrapText(linkNode);
							}

							scope.display.chooseLink = false;
						};

						scope.linker.cancel = function(){
							scope.display.chooseLink = false;
						};

						http().get('/resources-applications').done(function(apps){
							scope.linker.apps = _.filter(model.me.apps, function(app){
								return _.find(
									apps,
									function(match){
										return app.address.indexOf(match) !== -1 && app.icon
									}
								);
							});

							scope.linker.search.application = _.find(scope.linker.apps, function(app){ return app.address.indexOf(appPrefix) !== -1 });
							if(!scope.linker.search.application){
								scope.linker.search.application = scope.linker.apps[0];
								scope.linker.searchApplication(function(){
									scope.linker.loadApplicationResources(function(){});
								})
							}
							else{
								scope.linker.loadApplicationResources(function(){});
							}

							scope.$apply('linker');
						});
					}
				}
			});

			RTE.baseToolbarConf.option('unlink', function(instance){
				return {
					template: '<i tooltip="editor.option.unlink"></i>',
					link: function(scope, element, attributes){
						element.addClass('disabled');
						element.on('click', function(){
							document.execCommand('unlink');
							element.addClass('disabled');
						});

						instance.on('selectionchange', function(e){
							if(e.selection.$().is('a')){
								element.removeClass('disabled');
							}
							else{
								element.addClass('disabled');
							}
						});
					}
				};
			});

			RTE.baseToolbarConf.option('smileys', function(instance){
				return {
					template: '' +
					'<i tooltip="editor.option.smileys"></i>' +
					'<lightbox show="display.pickSmiley" on-close="display.pickSmiley = false;">' +
					'<h2>Insérer un smiley</h2>' +
					'<div class="row">' +
					'<img ng-repeat="smiley in smileys" ng-click="addSmiley(smiley)" skin-src="/img/icons/[[smiley]].png" />' +
					'</div>' +
					'</lightbox>',
					link: function(scope, element, attributes){
						scope.display = {};
						scope.smileys = [ "happy", "proud", "dreamy", "love", "tired", "angry", "worried", "sick", "joker", "sad" ];
						scope.addSmiley = function(smiley){
							var content = instance.compile('<img skin-src="/img/icons/' + smiley + '.png" draggable native style="height: 60px; width: 60px;" />')(scope.$parent);
							instance.selection.replaceHTML(content);
							scope.display.pickSmiley = false;
						}

						element.children('i').on('click', function(){
							scope.display.pickSmiley = true;
						});
					}
				};
			});

			RTE.baseToolbarConf.option('table', function(instance){
				return {
					template: '' +
					'<popover>' +
					'<i popover-opener opening-event="click"></i>' +
					'<popover-content>' +
					'<div class="draw-table"></div>' +
					'</popover-content>' +
					'</popover>',
					link: function(scope, element, attributes){
						var nbRows = 12;
						var nbCells = 12;
						var drawer = element.find('.draw-table');
						for(var i = 0; i < nbRows; i++){
							var line = $('<div class="row"></div>');
							drawer.append(line);
							for(var j = 0; j < nbCells; j++){
								line.append('<div class="one cell"></div>');
							}
						}

						drawer.find('.cell').on('mouseover', function(){
							var line = $(this).parent();
							for(var i = 0; i <= line.index(); i++){
								var row = $(drawer.find('.row')[i]);
								for(var j = 0; j <= $(this).index(); j++){
									var cell = $(row.find('.cell')[j]);
									cell.addClass('match');
								}
							}
						});

						drawer.find('.cell').on('mouseout', function(){
							drawer.find('.cell').removeClass('match');
						});

						drawer.find('.cell').on('click', function(){
							var table = document.createElement('table');
							var line = $(this).parent();
							for(var i = 0; i <= line.index(); i++){
								var row = $('<tr></tr>');
								$(table).append(row);
								for(var j = 0; j <= $(this).index(); j++){
									var cell = $('<td></td>');
									cell.html('&nbsp;')
									row.append(cell);
								}
							}
							instance.selection.replaceHTML(table.outerHTML);
							element.find('popover-content').addClass('hidden');
						});

						instance.bindContextualMenu('td', [
							{
								label: 'editor.add.row',
								action: function(e){
									var newRow = $($(e.target).parent()[0].outerHTML);
									newRow.find('td').html('&nbsp;');
									$(e.target).parent().after(newRow);
								}

							},
							{
								label: 'editor.add.column',
								action: function(e){
									var colIndex = $(e.target).index();
									$(e.target).parents('table').find('tr').each(function(index, row){
										$(row).children('td').eq(colIndex).after('<td>&nbsp;</td>')
									});
								}
							},
							{
								label: 'editor.remove.row',
								action: function(e){
									$(e.target).parent().remove();
								}
							},
							{
								label: 'editor.remove.column',
								action: function(e){
									var colIndex = $(e.target).index();
									$(e.target).parents('table').find('tr').each(function(index, row){
										$(row).children('td').eq(colIndex).remove();
									});
								}
							}
						]);
					}
				}
			});

			RTE.baseToolbarConf.option('templates', function(instance){
				return {
					template: '<i tooltip="editor.option.templates"></i>' +
					'<lightbox show="display.pickTemplate" on-close="display.pickTemplate = false;">' +
					'<h2>Choisir un modèle</h2>' +
					'<ul class="thought-out-actions">' +
					'<li ng-repeat="template in templates" ng-click="applyTemplate(template)">[[template.title]]</li>' +
					'</ul>' +
					'</lightbox>',
					link: function(scope, element, attributes){
						scope.templates = [
							{
								title: 'Page blanche',
								html: '<p></p>'
							},
							{
								title: 'Deux colonnes',
								html:
								'<div class="row">' +
								'<article class="six cell">' +
								'<h2>Titre de votre première colonne</h2>' +
								'<p>Vous pouvez entrer ici le texte de votre première colonne</p>' +
								'</article>' +
								'<article class="six cell">' +
								'<h2>Titre de votre deuxième colonne</h2>' +
								'<p>Vous pouvez entrer ici le texte de votre deuxième colonne</p>' +
								'</article>' +
								'</div>'
							},
							{
								title: 'Trois colonnes',
								html:
								'<div class="row">' +
								'<article class="four cell">' +
								'<h2>Titre de votre première colonne</h2>' +
								'<p>Vous pouvez entrer ici le texte de votre première colonne</p>' +
								'</article>' +
								'<article class="four cell">' +
								'<h2>Titre de votre deuxième colonne</h2>' +
								'<p>Vous pouvez entrer ici le texte de votre deuxième colonne</p>' +
								'</article>' +
								'<article class="four cell">' +
								'<h2>Titre de votre troisième colonne</h2>' +
								'<p>Vous pouvez entrer ici le texte de votre troisième colonne</p>' +
								'</article>' +
								'</div>'
							},
							{
								title: 'Illustration et texte',
								html:
								'<div class="row">' +
								'<article class="three cell">' +
								'<img skin-src="/img/illustrations/default-image.png" />' +
								'</article>' +
								'<article class="nine cell">' +
								'<h2>Titre de votre texte</h2>' +
								'<p>Vous pouvez entrer ici votre texte. Pour changer l\'image du modèle, cliquez sur l\'image, puis sur le bouton' +
								'"Insérer une image" dans la barre de boutons de l\'éditeur.</p>' +
								'</article>' +
								'</div>'
							},
							{
								title: 'Vignettes'
							}
						];
						scope.display = {};
						scope.applyTemplate = function(template){
							scope.display.pickTemplate = false;
							instance.selection.replaceHTML(_.findWhere(scope.templates, { title: template.title}).html);
						};

						element.children('i').on('click', function(){
							scope.display.pickTemplate = true;
							scope.$apply('display');
						});
					}
				}
			});

			RTE.baseToolbarConf.option('embed', function(instance){
				return {
					template: '<i ng-click="display.copyEmbed = true" tooltip="editor.option.embed"></i>' +
					'<lightbox show="display.copyEmbed" on-close="display.copyEmbed = false;">' +
					'<h2>Choisir un modèle</h2>' +
					'<p class="info"><i18n>info.video.embed</i18n></p>' +
					'<textarea ng-model="display.htmlCode"></textarea>' +
					'<div class="row">' +
					'<button type="button" ng-click="applyHtml()" class="right-magnet"><i18n>apply</i18n></button>' +
					'<button type="button" ng-click="display.copyEmbed = false" class="cancel right-magnet"><i18n>cancel</i18n></button>' +
					'</div>' +
					'</lightbox>',
					link: function(scope, element, attributes){
						scope.display = {};
						scope.applyHtml = function(template){
							scope.display.copyEmbed = false;
							instance.selection.replaceHTML(scope.display.htmlCode);
						};
					}
				}
			});

			//Editor
			module.directive('editor', function($parse, $compile){
				return {
					restrict: 'E',
					template: '' +
					'<editor-toolbar></editor-toolbar>' +
					'<contextual-menu><ul></ul></contextual-menu>' +
					'<popover>' +
					'<i class="tools" popover-opener opening-event="click"></i>' +
					'<popover-content>' +
					'<ul>' +
					'<li>Editeur de texte</li>' +
					'<li>Code HTML</li>' +
					'<li>Mode mixte</li>' +
					'</ul>' +
					'</popover-content>' +
					'</popover>' +
					'<div contenteditable="true"></div>' +
					'<textarea></textarea>',
					link: function(scope, element, attributes){
						element.addClass('edit');
						var editZone = element.children('[contenteditable=true]');
						var htmlZone = element.children('textarea');
						document.execCommand('styleWithCSS', true);
						document.execCommand('enableInlineTableEditing', true);

						if(attributes.inline !== undefined){
							element.children('editor-toolbar').addClass('inline');
						}

						var toolbarConf = RTE.baseToolbarConf;
						if(attributes.toolbarConf){
							toolbarConf = scope.$eval(attributes.toolbarConf);
						}

						var editorInstance = new RTE.Instance({
							toolbarConfiguration: toolbarConf,
							element: element,
							scope: scope,
							compile: $compile,
							editZone: editZone
						});

						editorInstance.addState('');
						var ngModel = $parse(attributes.ngModel);
						if(!ngModel(scope)){
							ngModel.assign(scope, '');
						}

						scope.$watch(
							function(){
								return ngModel(scope);
							},
							function(newValue){
								if(newValue !== editZone.html() && !editZone.is(':focus')){
									editZone.html(newValue);
								}
								if(newValue !== htmlZone.val() && !htmlZone.is(':focus')){
									if(window.html_beautify){
										htmlZone.val(html_beautify(newValue));
									}
								}
							}
						);

						element.on('dragenter', function(e){
							e.preventDefault();
						});

						element.children('popover').find('li:first-child').on('click', function(){
							element.removeClass('html');
							element.removeClass('both');
							element.addClass('edit');
						});

						element.children('popover').find('li:nth-child(2)').on('click', function(){
							element.removeClass('edit');
							element.removeClass('both');
							element.addClass('html');
							if(window.html_beautify){
								return;
							}
							http().get('/infra/public/js/beautify-html.js').done(function(content){
								eval(content);
								htmlZone.val(html_beautify(ngModel(scope)));
							});
						});

						element.children('popover').find('li:nth-child(3)').on('click', function(){
							element.removeClass('edit');
							element.removeClass('html');
							element.addClass('both');
							if(window.html_beautify){
								return;
							}
							http().get('/infra/public/js/beautify-html.js').done(function(content){
								eval(content);
								htmlZone.val(html_beautify(ngModel(scope)));
							});
						});

						element.find('.option i').click(function(){
							if(!editZone.is(':focus')){
								editZone.focus();
							}

							scope.$apply(function(){
								scope.$eval(attributes.ngChange);
								ngModel.assign(scope, editZone.html());
							});
						});

						editorInstance.on('contentupdated', function(){
							if(parseInt(htmlZone.css('min-height')) < editZone.height()){
								htmlZone.css('min-height', editZone.height() + 'px');
							}
							ui.extendElement.resizable(element.children('[contenteditable]').find('img, table, article'), { moveWithResize: false });
							var newHeight = htmlZone[0].scrollHeight + 2;
							if(newHeight > htmlZone.height()){
								htmlZone.height(newHeight);
							}

							if(htmlZone[0].scrollHeight + 2 > parseInt(htmlZone.css('min-height'))){
								editZone.css('min-height', htmlZone[0].scrollHeight + 2 + 'px');
							}

							if(editorInstance.selection.changed()){
								editorInstance.trigger('selectionchange', {
									selection: editorInstance.selection
								});
							}

							scope.$apply(function(){
								scope.$eval(attributes.ngChange);
								var content = editZone.html();
								ngModel.assign(scope, content);
							});
						});

						element.on('click', function(){
							element.children('editor-toolbar').addClass('show');
						});

						$('body').on('mousedown', function(e){
							if(element.find(e.target).length === 0){
								element.children('editor-toolbar').removeClass('show');
							}
						});

						$('editor-toolbar').on('mousedown', function(e){
							e.preventDefault();
						});

						function wrapFirstLine(){
							if(editZone.contents()[0] && editZone.contents()[0].nodeType === 3){
								var div = $('<div></div>');
								div.text(editZone.contents()[0].textContent);
								editZone.contents()[0].remove();
								editZone.prepend(div);
								editorInstance.selection.moveCaret(div[0], div.text().length);
								editorInstance.trigger('contentupdated');
							}
						}

						function editingDone(){
							editorInstance.addState(editZone.html());
						}

						var typingTimer;
						var editingTimer;

						editZone.on('keypress', function(e){
							clearTimeout(typingTimer);
							clearTimeout(editingTimer);
							typingTimer = setTimeout(wrapFirstLine, 10);
							editingTimer = setTimeout(editingDone, 1000);
						});

						editZone.on('keydown', function(e){
							clearTimeout(typingTimer);
							if(e.keyCode === 90 && e.ctrlKey && !e.shiftKey){
								editorInstance.undo();
								e.preventDefault();
							}
							if((e.keyCode === 90 && e.ctrlKey && e.shiftKey) || (e.keyCode === 89 && e.ctrlKey)){
								editorInstance.redo();
								e.preventDefault();
							}
							if(e.keyCode === 9){
								e.preventDefault();
								var currentTag;
								if(editorInstance.selection.range.startContainer.tagName){
									currentTag = editorInstance.selection.range.startContainer;
								}
								else{
									currentTag = editorInstance.selection.range.startContainer.parentElement;
								}
								if(currentTag.tagName === 'TD'){
									var nextTag = currentTag.nextSibling;
									if(!nextTag){
										nextTag = $(currentTag).parent('tr').next().children('td')[0];
									}
									if(!nextTag){
										var newLine = $('<tr></tr>');
										for(var i = 0; i < $(currentTag).parent('tr').children('td').length; i++){
											newLine.append($('<td>&nbsp;</td>'));
										}
										nextTag = newLine.children('td')[0];
										$(currentTag).closest('table').append(newLine);
									}
									editorInstance.selection.moveCaret(nextTag);
								}
								else{
									document.execCommand('indent');
								}
							}
							if(e.keyCode === 13){
								if(editorInstance.selection.$().is('h1, h2, h3, h4, h5, .info, .warning')
									&& editorInstance.selection.range.startContainer === editorInstance.selection.range.endContainer
									&& editorInstance.selection.range.startOffset === editorInstance.selection.range.endOffset){
									var p = $('<p></p>');
									p.insertAfter(editorInstance.selection.$);
									this.moveCaret(p[0]);

									e.preventDefault()
								}
							}
						});

						htmlZone.on('keyup', function(e){
							var newHeight = htmlZone[0].scrollHeight + 2;
							if(newHeight > htmlZone.height()){
								htmlZone.height(newHeight);
							}
							if(newHeight > parseInt(editZone.css('min-height'))){
								editZone.css('min-height', newHeight);
							}

							scope.$apply(function(){
								scope.$eval(attributes.ngChange);
								ngModel.assign(scope, htmlZone.val());
							});
						});

						htmlZone.on('keydown', function(e){
							if(e.keyCode === 9){
								e.preventDefault();
								var start = this.selectionStart;
								var end = this.selectionEnd;

								$(this).val($(this).val().substring(0, start) + "\t" + $(this).val().substring(end));

								this.selectionStart = this.selectionEnd = start + 1;
							}
						});

						htmlZone.on('blur', function(){
							scope.$apply(function(){
								scope.$eval(attributes.ngChange);
								ngModel.assign(scope, htmlZone.val());
							});
						});

						element.on('dragover', function(e){
							element.addClass('droptarget');
						});

						element.on('dragleave', function(){
							element.removeClass('droptarget');
						});

						element.find('[contenteditable]').on('drop', function(e){
							element.removeClass('droptarget');
							var el = {};
							var files = e.originalEvent.dataTransfer.files;
							if(!files.length){
								return;
							}
							e.preventDefault();
							for(var i = 0; i < files.length; i++){
								(function(){
									var name = files[i].name;
									workspace.Document.prototype.upload(files[i], 'file-upload-' + name + '-' + i, function(doc){
										if(name.indexOf('.mp3') !== -1 || name.indexOf('.wav') !== -1 || name.indexOf('.ogg') !== -1){
											el = $('<audio draggable native controls></audio>');
										}
										else{
											el = $('<img draggable native />');
										}

										el.attr('src', '/workspace/document/' + doc._id)
										editorInstance.selection.replaceHTML(el[0].outerHTML);
									});
								}())

							}
						});

						element.children('[contenteditable]').on('mousedown', function(e){
							e.preventDefault();
						});
					}
				}
			});


			//Style directives

			module.directive('selectList', function(){
				return {
					restrict: 'E',
					transclude: true,
					scope: {
						ngModel: '=',
						displayAs: '@',
						placeholder: '@',
						ngChange: '&'
					},
					template: '' +
					'<div class="selected-value">[[showValue()]]</div>' +
					'<div class="options hidden" ng-transclude></div>',
					link: function(scope, element, attributes){
						if(scope.default){
							scope.ngModel = scope.$eval(scope.default);
						}

						scope.showValue = function(){
							if(!scope.ngModel){
								return scope.placeholder;
							}
							if(!scope.displayAs){
								return scope.ngModel;
							}
							return scope.ngModel[scope.displayAs];
						};

						element.children('.selected-value').on('click', function(){
							if(element.children('.options').hasClass('hidden')){
								element.children('.options').removeClass('hidden');
								element.children('.options').height(element.children('.options')[0].scrollHeight);
							}
							else{
								element.children('.options').addClass('hidden');
							}
						});
						element.children('.options').on('click', 'opt', function(){
							scope.ngModel = angular.element(this).scope().$eval($(this).attr('value'));
							element.children('.options').addClass('hidden');
							scope.$apply('ngModel');
							scope.ngChange();
							scope.$apply();
						});

						$('body').click(function(e){
							if(element.find(e.originalEvent.target).length){
								return;
							}

							element.children('.options').addClass('hidden');
						});
					}
				}
			});

			module.directive('popover', function(){
				return {
					controller: function(){},
					restrict: 'E',
					link: function (scope, element, attributes) {

					}
				};
			});

			module.directive('popoverOpener', function(){
				return {
					require: '^popover',
					link: function(scope, element, attributes){
						var parentElement = element.parents('popover');
						var popover = parentElement.find('popover-content');
						if(attributes.openingEvent === 'click'){
							element.on('click', function(){
								if(!popover.hasClass('hidden')){
									popover.addClass("hidden");
								}
								else{
									popover.removeClass("hidden");
								}
							});

							$('body').on('click', function(e){
								if(parentElement.find(e.originalEvent.target).length > 0){
									return;
								}
								popover.addClass("hidden");
							});
						}
						else{
							parentElement.on('mouseover', function(e){
								popover.removeClass("hidden");
							});
							parentElement.on('mouseout', function(e){
								popover.addClass("hidden");
							});
						}
					}
				};
			});

			module.directive('popoverContent', function(){
				return {
					require: '^popover',
					restrict: 'E',
					link: function(scope, element, attributes){
						element.addClass("hidden");
					}
				};
			});

			module.directive('mathjax', function(){
				return {
					restrict: 'E',
					scope: {
						formula: '@'
					},
					link: function(scope, element, attributes){
						http().get('/infra/public/mathjax/MathJax.js?config=TeX-AMS-MML_HTMLorMML').done(function(data){
							eval(data);
							MathJax.Hub.Typeset();
						});
						attributes.$observe('formula', function(newVal){
							element.text('$$' + newVal + '$$');
							if(window.MathJax && window.MathJax.Hub){
								MathJax.Hub.Typeset();
							}
						});
					}
				}
			});
		}
	};
}());