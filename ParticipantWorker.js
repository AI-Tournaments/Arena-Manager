'use strict'
let _stepCounter;
onmessage = messageEvent => {
	function getParticipantResponse(sendResponse=true){
		_stepCounter = 0;
		let stepsRemaining = 0 < generalSettings.executionSteps ? generalSettings.executionSteps : Infinity;
		try{
			while(stepsRemaining-_stepCounter && interpreter.step()){
				_stepCounter++;
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
	function messageInterpreter(input){
		let state = serialize(interpreter);
		interpreter.appendCode('\nonmessage('+JSON.stringify(input)+');');
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
				messageInterpreter({type: 'Post', data: messageEvent.data.message});
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
			ArenaHelper.getBabelDependencies(messageEvent.data.includeScripts).then(babel => {
				initNewInterpreter = async state => {
					interpreter = new Interpreter(ArenaHelper.babelTransform('const __url=\''+messageEvent.data.url+'\';\nDate = null;\nlet onmessage = null;\n'+babel), (interpreter, globalObject)=>{
						interpreter.setProperty(globalObject, 'postMessage', interpreter.createNativeFunction(sendResponse));
						let math = interpreter.getProperty(globalObject, 'Math');
						interpreter.setProperty(math, 'random', interpreter.createNativeFunction(random));
					});
					if(state){
						deserialize(state, interpreter);
					}else{
						interpreter.run(); // Init interpreter.
						try{
							interpreter.appendCode(ArenaHelper.babelTransform((await Promise.allSettled(participantSources)).map(r => r.value).join(';\n')));
						}catch(error){
							postMessage({type: 'Fetal-Error', response: error.toString()});
							return;
						}
						let stepsRemaining = 0 < generalSettings.executionStepsInit ? generalSettings.executionStepsInit : Infinity;
						while(stepsRemaining && interpreter.step()){ // Init participant.
							stepsRemaining--;
						}
						if(stepsRemaining){
							messageInterpreter({type: 'Settings', ...messageEvent.data.workerData}); // Init arena setup.
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
	});
};
postMessage(null);
