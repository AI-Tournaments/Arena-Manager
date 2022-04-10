'use strict'
let _stepCounter;
onmessage = messageEvent => {
	function babelTransform(source){
		return Babel.transform(source, {'presets': ['es2015']}).code;
	}
	function getParticipantResponse(){
		_stepCounter = 0;
		let stepsRemaining = generalSettings.executionSteps;
		try{
			while(stepsRemaining && interpreter.step()){
				_stepCounter++;
				stepsRemaining--;
			}
		}catch(error){
			postMessage({type: 'Response-Error', response: error.toString()});
		}
		return stepsRemaining;
	}
	function messageInterpreter(input, type='Post'){
		let state = serialize(interpreter);
		interpreter.appendCode('\nonmessage('+JSON.stringify({type: type, data: input})+');');
		if(!getParticipantResponse()){
			initNewInterpreter(state).then(()=>{
				interpreter.appendCode('\nonmessage({"type": "Timeout-Rollback"});');
				if(getParticipantResponse()){
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
	let systemDependencies = [];
	messageEvent.data.includeScripts.system.forEach(url => {
		systemDependencies.push(fetch(url).then(response => response.text()));
	});
	Promise.allSettled(systemDependencies).then(results => {
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
	});
	let generalSettings = messageEvent.data.workerData.settings.general;
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
	let participantDependencies = [];
	messageEvent.data.includeScripts.participant.forEach(url => {
		participantDependencies.push(fetch(url).then(response => response.text()));
	});
	participantDependencies.push(Promise.resolve(`Math.seedrandom('`+messageEvent.data.workerData.settings.general.seed+'@'+messageEvent.data.workerData.iframeId+`');`)); // Make seedrandom's state serializable.
	participantDependencies.push(Promise.resolve(`delete Math.seedrandom;\nDate = null;\nlet onmessage = null;`));
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
		Promise.allSettled(systemDependencies).then(()=>{
			Promise.allSettled(participantDependencies).then(results => {
				initNewInterpreter = async state => {
					interpreter = new Interpreter(babelTransform(results.map(r => r.value).join('\n')), (interpreter, globalObject)=>{
						interpreter.setProperty(globalObject, 'postMessage', interpreter.createNativeFunction(sendResponse));
					});
					if(state){
						deserialize(state, interpreter);
					}else{
						interpreter.run(); // Init dependencies.
						try{
							interpreter.appendCode('\n'+babelTransform((await Promise.allSettled(participantSources)).map(r => r.value).join('\n')));
						}catch(error){
							postMessage({type: 'Fetal-Error', response: error.toString()});
							return;
						}
						let stepsRemaining = generalSettings.executionStepsInit;
						while(stepsRemaining && interpreter.step()){ // Init participant.
							stepsRemaining--;
						}
						if(stepsRemaining){
							messageInterpreter(messageEvent.data.workerData, 'Settings'); // Init arena state.
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
		});
	})
};
postMessage(null);
