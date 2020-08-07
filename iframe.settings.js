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
			function addInput(fieldset, name, value){
				let label = document.createElement('label');
				label.innerHTML = name;
				label.htmlFor = fieldset.name+'.'+name;
				fieldset.appendChild(label);
				let input = document.createElement('input');
				input.id = label.htmlFor;
				input.name = label.htmlFor;
				switch(typeof value){
					default: input.type = 'text'; break;
					case 'boolean': input.type = 'checkbox'; break;
					case 'number': input.type = 'number'; break;
				}
				if(typeof value === 'boolean'){
					input.checked = value;
				}else{
					input.value = value;
				}
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
							addInput(fieldset, subKey, setting[subKey]);
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
			switch(input.type){
				default: json[info[0]][info[1]] = input.value; break;
				case 'checkbox': json[info[0]][info[1]] = input.checked; break;
				case 'number': json[info[0]][info[1]] = input.valueAsNumber; break;
			}
		}
		messageEvent.source.postMessage({type: 'settings', value: json}, messageEvent.origin);
	}
}
