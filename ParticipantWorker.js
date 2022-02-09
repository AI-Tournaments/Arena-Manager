'use strict'
onmessage = messageEvent => {
	function createObjectURL(javascript){
		let blob;
		try{
			blob = new Blob([javascript], {type: 'application/javascript'});
		}catch(e){
			blob = new (window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder)();
			blob.append(javascript);
			blob = blob.getBlob();
		}
		let urlObject = URL.createObjectURL(blob);
		setTimeout(()=>{URL.revokeObjectURL(urlObject);},10000); // Worker does not work if urlObject is removed to early.
		return urlObject;
	}
	function messageInterpreter(data){
		data = {
			data: data
		};
		interpreter.appendCode('onmessage('+JSON.stringify(data)+');');
		let stepsLeft = generalSettings.executionSteps;
		while(interpreter.step() && 0 < stepsLeft){
			stepsLeft--;
		}
		if(!stepsLeft){
			sendTimeout();
		}
	}
	function sendResponse(data){
		postMessage({type: 'Response', response: data});
	}
	function sendTimeout(){
		postMessage({type: 'Message-Timeout'});
	}
	let systemDependencies = [];
	messageEvent.data.includeScripts.system.forEach(url => {
		systemDependencies.push(fetch(url).then(response => response.text()));
	});
	Promise.allSettled(systemDependencies).then(results => {
		importScripts(...results.map(r => createObjectURL(r.value)));
	});
	let generalSettings = messageEvent.data.workerData.settings.general;
	let interpreter;
	let resolve;
	let interpreterDone = new Promise(r => resolve = r);
	onmessage = messageEvent => {
		interpreterDone.then(() => {
			messageInterpreter(messageEvent.data.message);
		});
	};
	let participantDependencies = [];
	messageEvent.data.includeScripts.participant.forEach(url => {
		participantDependencies.push(fetch(url).then(response => response.text()));
	});
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
		header.dependencies.forEach(url => {
			participantDependencies.push(fetch(url).then(response => response.text()));
		});
		participantDependencies.push(Promise.resolve(`Math.seedrandom('`+messageEvent.data.workerData.settings.general.seed+'@'+messageEvent.data.workerData.iframeId+`');\ndelete Math.seedrandom;\nDate = null;\nperformance = null;`));
		participantDependencies.push(Promise.resolve(participantSource));
		Promise.allSettled(systemDependencies).then(()=>{
			Promise.allSettled(participantDependencies).then(results => {
				let sources = results.map(r => r.value);
				var initFunc = function(interpreter, globalObject){
					interpreter.setProperty(globalObject, 'postMessage', interpreter.createNativeFunction(sendResponse));
				};
				interpreter = new Interpreter(Babel.transform(sources.join('\n'), {'presets': ['es2015']}).code, initFunc);
				let threshold = generalSettings.participantInitThreshold;
				let initThreshold = Date.now() + threshold*1000;
				let timeLeft = true;
				while(interpreter.step() && timeLeft){ // Init participant and all dependencies.
					timeLeft = 0 < initThreshold - Date.now();
				}
				if(timeLeft){
					messageInterpreter(messageEvent.data.workerData); // Init arena state.
				}else{
					throw new Error('Init participant ('+messageEvent.data.url+') timeout ('+threshold+'s).');
				}
				resolve();
				postMessage(null);
			}).catch(error => {throw new Error(error)});
		});
	})
};
postMessage(null);
