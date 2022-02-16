'use strict'
onmessage = messageEvent => {
	function babelTransform(source){
		return Babel.transform(source, {'presets': ['es2015']}).code;
	}
	function messageInterpreter(input){
		let state = serialize(interpreter);
		interpreter.appendCode('\nonmessage('+JSON.stringify({type: 'Post', data: input})+');');
		stepCounter = 0;
		let stepsRemaining = generalSettings.executionSteps;
		while(interpreter.step() && 0 < stepsRemaining){
			stepCounter++;
			stepsRemaining--;
		}
		if(!stepsRemaining){
			initNewInterpreter().then(()=>{
				deserialize(state, interpreter);
				interpreter.appendCode('\nonmessage({"type": "Timeout-Rollback"});');
				stepsRemaining = generalSettings.executionSteps;
				while(interpreter.step() && 0 < stepsRemaining){
					stepsRemaining--;
				}
				sendTimeout();
			});
		}
	}
	function sendResponse(data){
		postMessage({type: 'Response', response: {value: data, executionSteps: stepCounter}});
	}
	function sendTimeout(){
		postMessage({type: 'Message-Timeout'});
	}
	let stepCounter;
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
	participantDependencies.push(Promise.resolve(`Math.seedrandom('`+messageEvent.data.workerData.settings.general.seed+'@'+messageEvent.data.workerData.iframeId+`');\ndelete Math.seedrandom;\nDate = null; let onmessage = null;`));
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
				initNewInterpreter = async()=>{
					interpreter = new Interpreter(babelTransform(results.map(r => r.value).join('\n')), (interpreter, globalObject)=>{
						interpreter.setProperty(globalObject, 'postMessage', interpreter.createNativeFunction(sendResponse));
					});
					interpreter.run(); // Init system dependencies.
					interpreter.appendCode('\n'+babelTransform((await Promise.allSettled(participantSources)).map(r => r.value).join('\n')));
					let stepsRemaining = generalSettings.executionStepsInit;
					while(interpreter.step() && 0 < stepsRemaining){ // Init participant.
						stepsRemaining--;
					}
					if(stepsRemaining){
						messageInterpreter(messageEvent.data.workerData); // Init arena state.
						interpreterReady();
						postMessage(null);
						return interpreter;
					}else{
						throw new Error('Init participant ('+messageEvent.data.url+') timeout ('+threshold+'s).');
					}
				}
				initNewInterpreter();
			}).catch(error => {throw new Error(error)});
		});
	})
};
postMessage(null);
