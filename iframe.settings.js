'use strict'
function a(){
	let arenaProperties;
	let settings = document.getElementById('settings');
	window.onmessage = messageEvent => {
		switch(messageEvent.data.type){
			case 'SetArena': setArena(messageEvent); break;
			case 'GetSettings': postSettings(messageEvent); break;
		}
	}
	function setArena(messageEvent){
		let arena = messageEvent.data.value
		arenaProperties = undefined;
		fetch('https://raw.githubusercontent.com/ARENA/master/properties.json'.replace('ARENA', arena)) // TODO: Do not use "master". https://github.com/orgs/AI-Tournaments/projects/2#card-47502056
		.then(response => response.json())
		.then(json => {
			function addInput(fieldset, name, value, properties, arrayIndex){
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
				for(const key in properties) {
					if(properties.hasOwnProperty(key)){
						let value = properties[key];
						if(value !== null){
							input[key] = value;
						}
					}
				}
				wrapper.appendChild(input);
			}
			arenaProperties = json;
			while(0 < settings.childElementCount){
				settings.removeChild(settings.firstChild);
			}
			for(const key in arenaProperties.settings){
				if(arenaProperties.settings.hasOwnProperty(key)){
					const setting = arenaProperties.settings[key];
					let fieldset = document.createElement('fieldset');
					fieldset.name = key;
					settings.appendChild(fieldset);
					let legend = document.createElement('legend');
					legend.innerHTML = key;
					fieldset.appendChild(legend);
					for(const subKey in setting){
						if(setting.hasOwnProperty(subKey)){
							let value = setting[subKey];
							let properties = arenaProperties.header.settings[key];
							if(properties !== undefined){
								properties = properties[subKey];
							}
							if(typeof value === 'object'){
								let index = 0;
								value.forEach(v => {
									addInput(fieldset, subKey, value, properties, index++);
								});
							}else{
								addInput(fieldset, subKey, value, properties);
							}
						}
					}
				}
			}
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
		messageEvent.source.postMessage({type: 'settings', value: json}, messageEvent.origin);
	}
}
