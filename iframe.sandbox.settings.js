'use strict'
function a(){
	let generalSettings = {
		seed: '',
		averageOf: 1,
		displayOpponents: ['Hide', 'AccountOnly', 'Yes'],
		timelimit_ms: 1000,
		_meta: {
			averageOf: {min: 1, max: null},
			timelimit_ms: {min: 1, max: null}
		}
	};
	let advancedSettings = {
		allowRemoteExecution: false
	};
	let settings = document.getElementById('settings');
	window.onmessage = messageEvent => {
		switch(messageEvent.data.type){
			case 'SetArena': setArena(messageEvent); break;
			case 'GetSettings': postSettings(messageEvent); break;
		}
	}
	function strip(html=''){
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
	function secureJson(json){
		let secure = json.length === undefined ? {} : [];
		Object.keys(json).forEach(key => {
			let k = strip(key);
			let value = json[key];
			if(value !== null){
				switch(typeof value){
					case 'string': value = strip(value); break;
					case 'object': value = secureJson(value); break;
				}
			}
			secure[k] = value;
		});
		return secure;
	}
	function setArena(messageEvent){
		fetch(messageEvent.data.value + 'properties.json').then(response => response.json()).then(insecureJson => {
			let arenaProperties = secureJson(insecureJson);
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
				iframedMessage.srcdoc = '<!DOCTYPE html><html><head><link rel="stylesheet" href="../defaults.css"><script></script></head><body>'+comment.message+'</body></html>';
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
					if(arrayIndex===0){
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
			arenaProperties.settings.general = JSON.parse(JSON.stringify(generalSettings));
			console.log('// TODO: Add support for JSON input. Possibly by header.allowCustomInput==true. Could possibly be "None", "Forced", "Optional", "Syntaxed". Syntaxed (always?) would be that you can\'t change the root objects, but edit them to enter values. More investigation is needed.');
			Object.keys(arenaProperties.settings).sort(a => 'general' === a ? -1 : 0).forEach(key => {
				if(arenaProperties.settings.hasOwnProperty(key)){
					const setting = arenaProperties.settings[key];
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
						let jsonEditor = document.createElement('div');
						jsonEditor.id = 'customInput';
						jsonEditor.innerHTML = 'Editor';
						if(!arenaProperties.header.allowCustomInput){
							jsonEditor.classList.add('hidden');
						}
						fieldset.appendChild(jsonEditor);
					}
				}
			});
			messageEvent.source.postMessage({type: 'properties', value: {properties: arenaProperties, height: document.body.parentElement.offsetHeight}}, messageEvent.origin);
		});
	}
	function postSettings(messageEvent){
		let json = {};
		for(const input of settings.getElementsByTagName('input')){
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
		messageEvent.source.postMessage({type: 'settings', value: json}, messageEvent.origin);
	}
}
