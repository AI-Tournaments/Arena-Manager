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
		fetch('https://raw.githubusercontent.com/AI-Tournaments/GAME-Arena/master/properties.json'.replace('GAME', arena))
		.then(response => response.json())
		.then(json => {
			function addInput(fieldset, name, value, arrayIndex){
				let label = document.createElement('label');
				if(arrayIndex===0){
					label.innerHTML = name;
					label.htmlFor = fieldset.name+'.'+name;
					fieldset.appendChild(label);
					label = document.createElement('label');
				}
				label.innerHTML = typeof value === 'object' ? value[arrayIndex] : name;
				label.htmlFor = fieldset.name+'.'+name + (arrayIndex===undefined?'':'_'+value[arrayIndex]);
				fieldset.appendChild(label);
				let input = document.createElement('input');
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
				input.id = label.htmlFor;
				input.name = arrayIndex===undefined ? label.htmlFor : fieldset.name+'.'+name;
				fieldset.appendChild(input);
			}
			arenaProperties = json;
			while(0 < settings.length){
				settings.remove(0);
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
							if(typeof value === 'object'){
								let index = 0;
								value.forEach(v => {
									addInput(fieldset, subKey, value, index++);
								});
							}else{
								addInput(fieldset, subKey, value);
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
