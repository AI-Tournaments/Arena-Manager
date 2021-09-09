'use strict'
function a(){
	let jsonEditor;
	let generalSettings = {
		seed: '',
		bestOf: 1,
		discloseOpponents: ['Yes', 'AccountOnly', 'No'],
		timelimit_ms: 1000,
		_meta: {
			bestOf: {min: 1, max: null},
			timelimit_ms: {min: 1, max: null},
			discloseOpponents: {default: 'No', comment: {message: "Disclose opponents' name for the participants, or keep them secret."}}
		}
	};
	let advancedSettings = {
		allowRemoteExecution: false
	};
	let _arenaProperties;
	if(generalSettings.seed !== ''){
		console.error('Seed has value. Fine during debugging, but do not commit. `generalSettings.seed` should be empty string (\'\').');
	}
	let settings = document.getElementById('settings');
	let postSize;
	let lastHeight;
	window.onmessage = messageEvent => {
		if(postSize === undefined){
			postSize = function(){
				lastHeight = document.body.parentElement.scrollHeight;
				messageEvent.source.postMessage({type: 'size-changed', value: {height: lastHeight}}, messageEvent.origin);

			}
			function syncSize(){
				if(document.body.parentElement.scrollHeight !== lastHeight){
					postSize();
				}
				window.requestAnimationFrame(syncSize);
			}
			syncSize();
		}
		switch(messageEvent.data.type){
			case 'SetArena': setArena(messageEvent); break;
			case 'GetSettings': postSettings(messageEvent); break;
			case 'MatchParentStyle':
				document.documentElement.classList.add(messageEvent.data.value);
				break;
		}
	}
	function strip(html='', hierarchy=[]){
		if(4 < hierarchy.length && hierarchy[0] === 'settings' && hierarchy[2] === '_meta' && hierarchy[4] === 'comment'){
			return html;
		}
		let output;
		let tempString;
		do{
			tempString = output;
			let element = document.createElement('div');
			element.innerHTML = html;
			output = element.textContent || element.innerText || '';
		}
		while(tempString !== output && output !== '');
		return output;
	}
	function secureJson(json, hierarchy=[]){
		let secure = json.length === undefined ? {} : [];
		Object.keys(json).forEach(key => {
			let k = strip(key);
			let value = json[key];
			if(value !== null){
				switch(typeof value){
					case 'string': value = strip(value, hierarchy); break;
					case 'object': value = secureJson(value, [...hierarchy, key]); break;
				}
			}
			secure[k] = value;
		});
		return secure;
	}
	function isObject(obj){
		return obj !== undefined && obj !== null && obj.constructor == Object;
	}
	function setArena(messageEvent){
		jsonEditor = null;
		fetch(messageEvent.data.value + 'properties.json').then(response => response.json()).then(insecureJson => {
			_arenaProperties = secureJson(insecureJson);
			let jsonEditor_element;
			let customInput = isObject(_arenaProperties.header.customInput) && (isObject(_arenaProperties.header.customInput.schema) || isObject(_arenaProperties.header.customInput.schemaRefs) || (_arenaProperties.header.customInput.default !== undefined && _arenaProperties.header.customInput.default !== null));
			function addComment(label, comment){
				let wrapper = document.createElement('span');
				wrapper.classList.add('comment');
				label.appendChild(wrapper);
				let icon = document.createElement('span');
				icon.classList.add('icon');
				wrapper.appendChild(icon);
				let iframedMessage = document.createElement('iframe');
				iframedMessage.sandbox = '';
				iframedMessage.classList.add('message');
				iframedMessage.srcdoc = '<!DOCTYPE html><html><head><link rel="stylesheet" href="../defaults.css"></head><body>'+comment.message+'</body></html>';
				if(comment.height !== undefined){
					iframedMessage.height = comment.height;
				}
				if(comment.width !== undefined){
					iframedMessage.width = comment.width;
				}
				console.log('// TODO: Make iframe lower and right border resizable by mouse drag.');
				wrapper.appendChild(iframedMessage);
			}
			function addInput(fieldset, name, value, meta={}, arrayIndex){
				let wrapper;
				if(arrayIndex === undefined || arrayIndex === 0){
					wrapper = document.createElement('div');
					wrapper.classList.add('setting-wrapper');
					fieldset.appendChild(wrapper);
				}
				let label = document.createElement('label');
				if(arrayIndex===0){
					label.innerHTML = name;
					label.htmlFor = fieldset.name+'.'+name;
					wrapper.id = label.htmlFor;
					wrapper.appendChild(label);
					if(meta.comment !== undefined){
						addComment(label, meta.comment);
					}
					let innerWrapper = document.createElement('div');
					innerWrapper.classList.add('radio-set');
					wrapper.appendChild(innerWrapper);
					wrapper = innerWrapper;
					label = document.createElement('label');
				}else if(0 < arrayIndex){
					wrapper = document.getElementById(fieldset.name+'.'+name).getElementsByClassName('radio-set')[0];
				}
				label.innerHTML = typeof value === 'object' ? value[arrayIndex] : name;
				label.htmlFor = fieldset.name+'.'+name + (arrayIndex===undefined?'':'_'+value[arrayIndex]);
				wrapper.appendChild(label);
				if(arrayIndex === undefined && meta.comment !== undefined){
					addComment(label, meta.comment);
				}
				let input = document.createElement('input');
				input.id = label.htmlFor;
				input.classList.add('arena-setting');
				input.name = arrayIndex===undefined ? label.htmlFor : fieldset.name+'.'+name;
				switch(typeof value){
					default: input.type = 'text'; break;
					case 'object': input.type = 'radio'; break;
					case 'boolean': input.type = 'checkbox'; break;
					case 'number': input.type = 'number'; break;
				}
				if(typeof value === 'boolean'){
					input.checked = value;
				}else if(typeof value === 'object'){
					if(meta.default === undefined && arrayIndex===0 || meta.default === value[arrayIndex]){
						input.checked = true;
					}
					input.value = value[arrayIndex];
				}else{
					input.value = value;
				}
				for(let key in meta){
					if(key !== 'comment' && meta.hasOwnProperty(key)){
						let value = meta[key];
						if(value !== null){
							input[key] = value;
						}
					}
				}
				wrapper.appendChild(input);
			}
			function getMeta(setting, key){
				if(setting['_meta'] === undefined || setting['_meta'][key] === undefined){
					return {};
				}
				return setting['_meta'][key];
			}
			while(0 < settings.childElementCount){
				settings.removeChild(settings.firstChild);
			}
			_arenaProperties.settings.general = JSON.parse(JSON.stringify(generalSettings));
			if(messageEvent.data.settingsOverride.arena === messageEvent.data.value && messageEvent.data.settingsOverride.settings){
				for(const groupKey in messageEvent.data.settingsOverride.settings){
					if(Object.hasOwnProperty.call(messageEvent.data.settingsOverride.settings, groupKey)){
						const group = messageEvent.data.settingsOverride.settings[groupKey];
						for(const setting in group){
							if(Object.hasOwnProperty.call(group, setting)){
								const value = group[setting];
								if(setting === '_meta'){
									for(const meta in value){
										if(Object.hasOwnProperty.call(value, meta)){
											const metaGroup = value[meta];
											for(const metaKey in metaGroup){
												if(Object.hasOwnProperty.call(metaGroup, metaKey)){
													const metaValue = metaGroup[metaKey];
													_arenaProperties.settings[groupKey][setting][meta][metaKey] = metaValue;
												}
											}
										}
									}
								}else{
									_arenaProperties.settings[groupKey][setting] = value;
								}
							}
						}
					}
				}
			}
			Object.keys(_arenaProperties.settings).sort(a => 'general' === a ? -1 : 0).forEach(key => {
				if(_arenaProperties.settings.hasOwnProperty(key)){
					const setting = _arenaProperties.settings[key];
					let fieldset = document.createElement('fieldset');
					fieldset.name = key;
					settings.appendChild(fieldset);
					let legend = document.createElement('legend');
					legend.innerHTML = key;
					fieldset.appendChild(legend);
					for(const settingKey in setting){
						if(settingKey !== '_meta' && setting.hasOwnProperty(settingKey)){
							let value = setting[settingKey];
							let meta = getMeta(setting, settingKey);
							if(typeof value === 'object'){
								let index = 0;
								value.forEach(v => {
									addInput(fieldset, settingKey, value, meta, index++);
								});
							}else{
								addInput(fieldset, settingKey, value, meta);
							}
						}
					}
					if(key === 'general'){
						let wrapper = document.createElement('div');
						jsonEditor_element = document.createElement('div');
						jsonEditor_element.id = 'customInput';
						jsonEditor_element.innerHTML = 'Custom input';
						if(!customInput){
							wrapper.classList.add('hidden');
						}
						wrapper.appendChild(jsonEditor_element);
						fieldset.appendChild(wrapper);
					}
				}
			});
			jsonEditor = new JSONEditor(jsonEditor_element, {'modes': ['tree', 'code'], 'name': 'customInput', 'onModeChange': postSize}, customInput ? _arenaProperties.header.customInput.default : undefined);
			jsonEditor.setSchema(customInput ? _arenaProperties.header.customInput.schema : undefined, customInput ? _arenaProperties.header.customInput.schemaRefs : undefined);
			messageEvent.source.postMessage({type: 'properties', value: {properties: _arenaProperties}}, messageEvent.origin);
		});
	}
	function postSettings(messageEvent){
		let json = {};
		for(const input of settings.getElementsByClassName('arena-setting')){
			let info = input.name.split('.');
			if(json[info[0]] === undefined){
				json[info[0]] = {};
			}
			let value;
			switch(input.type){
				default: value = input.value; break;
				case 'radio': if(input.checked){value = input.value}else{continue}; break;
				case 'checkbox': value = input.checked; break;
				case 'number': value = input.valueAsNumber; break;
			}
			json[info[0]][info[1]] = value;
		}
		json.general.advanced = JSON.parse(JSON.stringify(advancedSettings));
		json.general.customInput = jsonEditor === null ? {} : jsonEditor.get();
		messageEvent.source.postMessage({type: 'settings', value: {header: {replay: _arenaProperties.header.replay}, settings: json}}, messageEvent.origin);
	}
}
