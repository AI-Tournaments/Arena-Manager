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
	let arenaProperties;
	let settings = document.getElementById('settings');
	window.onmessage = messageEvent => {
		switch(messageEvent.data.type){
			case 'SetArena': setArena(messageEvent); break;
			case 'GetSettings': postSettings(messageEvent); break;
		}
	}
	function setArena(messageEvent){
		arenaProperties = undefined;
		fetch(messageEvent.data.value + 'properties.json').then(response => response.json()).then(json => {
			function addInput(fieldset, name, value, meta={}, arrayIndex){
				let wrapper;
				if(arrayIndex === undefined || arrayIndex === 0){
					wrapper = document.createElement('div');
					fieldset.appendChild(wrapper);
				}
				let label = document.createElement('label');
				if(arrayIndex===0){
					label.innerHTML = name;
					label.htmlFor = fieldset.name+'.'+name;
					wrapper.id = label.htmlFor;
					wrapper.appendChild(label);
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
				for(const key in meta) {
					if(meta.hasOwnProperty(key)){
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
			arenaProperties = json;
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
				}
			});
			messageEvent.source.postMessage({type: 'properties', value: {properties: json, height: document.body.parentElement.offsetHeight}}, messageEvent.origin);
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
