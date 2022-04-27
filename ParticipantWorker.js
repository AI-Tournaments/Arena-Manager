'use strict'
let _stepCounter;
onmessage = messageEvent => {
	function babelTransform(source){
		return Babel.transform(source, {'presets': ['es2015']}).code;
	}
	function getParticipantResponse(sendResponse=true){
		_stepCounter = 0;
		let stepsRemaining = 0 < generalSettings.executionSteps ? generalSettings.executionSteps : Infinity;
		try{
			while(stepsRemaining && interpreter.step()){
				_stepCounter++;
				stepsRemaining--;
			}
		}catch(error){
			if(sendResponse){
				postMessage({type: 'Response-Error', response: error.toString()});
			}else{
				if(localDevelopment){
					console.error('Response-Error', error);
				}
			}
		}
		return stepsRemaining;
	}
	function messageInterpreter(input, type='Post'){
		let state = serialize(interpreter);
		interpreter.appendCode('\nonmessage('+JSON.stringify({type: type, data: input})+');');
		if(!getParticipantResponse()){
			initNewInterpreter(state).then(()=>{
				interpreter.appendCode('\nonmessage({"type": "Timeout-Rollback"});');
				if(getParticipantResponse(false)){
					sendTimeout();
				}else{
					initNewInterpreter(state).then(()=>{
						sendTimeout();
					});
				}
			});
		}
	}
	function sendResponse(data){
		postMessage({type: 'Response', response: {value: data, executionSteps: _stepCounter}});
	}
	function sendTimeout(){
		postMessage({type: 'Response-Timeout'});
	}
	let initNewInterpreter = ()=>{};
	let random;
	let dependencies = messageEvent.data.includeScripts.system.map(url => fetch(url).then(response => response.text()));
	Promise.allSettled(dependencies).then(results => {
		importScripts(...results.map(r => {
			let blob;
			try{
				blob = new Blob([r.value], {type: 'application/javascript'});
			}catch(e){
				blob = new (window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder)();
				blob.append(r.value);
				blob = blob.getBlob();
			}
			let urlObject = URL.createObjectURL(blob);
			setTimeout(()=>{URL.revokeObjectURL(urlObject);},10000); // Script does not work if urlObject is removed to early.
			return urlObject;
		}));
		random = new Math.seedrandom(messageEvent.data.workerData.settings.general.seed+'@'+messageEvent.data.workerData.iframeId);
	});
	let generalSettings = messageEvent.data.workerData.settings.general;
	let localDevelopment = messageEvent.data.localDevelopment;
	let interpreter;
	let interpreterReady;
	(()=>{
		let promise = new Promise(r => interpreterReady = r);
		onmessage = messageEvent => {
			promise.then(() => {
				messageInterpreter(messageEvent.data.message);
			});
		};
	})();
	fetch(messageEvent.data.url).then(response => response.text()).then(participantSource => {
		let header = (()=>{
			try{
				return JSON.parse(participantSource.substring(participantSource.indexOf('/**')+3, participantSource.indexOf('**/')));
			}catch(error){
				return {};
			}
		})();
		if(header.dependencies){
			let scope = messageEvent.data.url.slice(0, messageEvent.data.url.lastIndexOf('/')+1);
			header.dependencies.forEach((dependency, index) => {
				header.dependencies[index] = scope + dependency;
			});
		}else{
			header.dependencies = [];
		}
		let participantSources = [];
		header.dependencies.forEach(url => {
			participantSources.push(fetch(url).then(response => response.text()));
		});
		participantSources.push(Promise.resolve(participantSource));
		Promise.allSettled(dependencies).then(()=>{
			initNewInterpreter = async state => {
				interpreter = new Interpreter(babelTransform('Date = null;\nlet onmessage = null;'), (interpreter, globalObject)=>{
					interpreter.setProperty(globalObject, 'postMessage', interpreter.createNativeFunction(sendResponse));
					let math = interpreter.getProperty(globalObject, 'Math');
					interpreter.setProperty(math, 'random', interpreter.createNativeFunction(random));
				});
				if(state){
					deserialize(state, interpreter);
				}else{
					try{
						interpreter.appendCode('\n'+babelTransform((await Promise.allSettled(participantSources)).map(r => r.value).join('\n')));
					}catch(error){
						postMessage({type: 'Fetal-Error', response: error.toString()});
						return;
					}
					let stepsRemaining = 0 < generalSettings.executionStepsInit ? generalSettings.executionStepsInit : Infinity;
					while(stepsRemaining && interpreter.step()){ // Init participant.
						stepsRemaining--;
					}
					if(stepsRemaining){
						messageInterpreter(messageEvent.data.workerData, 'Settings'); // Init arena setup.
						interpreterReady();
					}else{
						throw new Error('Init participant ('+messageEvent.data.url+') timeout.');
					}
					return interpreter;
				}
			}
			initNewInterpreter().then(i => {
				if(i){
					postMessage(null);
				}
			});
		}).catch(error => {throw new Error(error)});
	})
};
postMessage(null);
