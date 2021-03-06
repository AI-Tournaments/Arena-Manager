'use strict'
let _url;
let _interpreter;
let _pendingMessage;
let _localDevelopment;
class Messenger {
	static #state = ''; // TODO: Replace with: https://github.com/engine262/engine262/issues/191
	static #stepsInit;
	static #stepsRemaining = 0;
	static #responseTimeout = Error();
	static #doCount = true;
	static messageInProgress = false;
	static tick(){
		if(Messenger.#doCount){
			if(Messenger.#stepsRemaining-- < 1){
				throw Messenger.#responseTimeout;
			}
		}
	}
	static countExecutionSteps(value){
		if(typeof value === 'boolean'){
			Messenger.#doCount = value;
			return;
		}
		try{
			Messenger.#doCount = value[0].boolean;
		}catch(error){
			console.error('FATAL', 'Value not boolean');
			throw error;
		}
	}
	static getStepsUsed(){
		return Messenger.#stepsInit - Messenger.#stepsRemaining;
	}
	static async messageInterpreter(input, executionSteps=NaN){
		if(Messenger.messageInProgress){
			throw Error('Message in progress');
		}
		if(isNaN(executionSteps)){
			throw Error('Input `executionSteps` is not a number');
		}
		Messenger.countExecutionSteps(true);
		Messenger.messageInProgress = true;
		Messenger.#stepsInit = Messenger.#stepsRemaining = executionSteps;
		if(typeof input !== 'string'){
			input = 'onmessage('+JSON.stringify(input)+');';
		}
		if(!Messenger.#state){
			input = '\n'+input;
		}
		await new Promise(r=>{setTimeout(()=>{r()})}); // Micro sleep
		let response;
		try{
			response = _interpreter.evaluateScript(input);
			if(response.Type !== 'throw'){
				Messenger.#state += input;
			}
		}catch(error){
			response = error;
		}
		try{
			if(response === Messenger.#responseTimeout){
				Messenger.#stepsRemaining = Infinity;
				await initNewInterpreter(Messenger.#state);
				Messenger.#stepsRemaining = executionSteps;
				let timeoutMessage = '\nonmessage({"type": "Timeout-Rollback"});';
				try{
					response = _interpreter.evaluateScript(timeoutMessage);
				}catch(error){}
				if(response !== Messenger.#responseTimeout && response.Type !== 'throw'){
					Messenger.#state += timeoutMessage;
				}else{
					Messenger.#stepsRemaining = Infinity;
					await initNewInterpreter(Messenger.#state);
					if(_localDevelopment){
						console.error('Missed timeout message', Messenger.#state+timeoutMessage);
					}
				}
				throw {type: 'Response-Timeout', response: 'Did not finish in time'};
			}else if(response.Type === 'throw'){
				let message = response.Value.string;
				if(!message){
					response.Value.properties.map.get('message').Value.string;
				}
				throw {type: 'Response-Error', response: message};
			}
		}catch(error){
			throw error;
		}finally{
			Messenger.messageInProgress = false;
		}
	};
}
let initNewInterpreter = ()=>{};
onmessage = messageEvent => {
	_url = messageEvent.data.url;
	function onResponse(response){
		function logResponseAlreadyReceived(){
			if(_localDevelopment){
				console.warn('Response to message already received. Skipped.', _url);
			}
		}
		function getValue(response){
			if(!response.length){
				throw Error('No response');
			}
			return JSON.parse(response[0].string);
		}
		if(!_pendingMessage){
			logResponseAlreadyReceived();
			return;
		}
		let usedSteps = Messenger.getStepsUsed();
		_pendingMessage.then(()=>{
			if(_pendingMessage === null){
				postMessage({
					type: 'Response',
					response: {
						value: getValue(response),
						executionSteps: {
							toRespond: usedSteps,
							toTerminate: Messenger.getStepsUsed()
						}
					}
				});
			}else{
				logResponseAlreadyReceived();
			}
		});
		_pendingMessage = null;
	}
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
	});
	_localDevelopment = messageEvent.data.localDevelopment;
	let generalSettings = messageEvent.data.workerData.settings.general;
	let executionLimit = 0 < generalSettings.executionStepsInit ? generalSettings.executionStepsInit : Infinity;
	let interpreterReady;
	(()=>{
		let promise = new Promise(r => interpreterReady = r);
		onmessage = messageEvent => {
			promise.then(() => {
				_pendingMessage = Messenger.messageInterpreter({type: 'Post', data: messageEvent.data.message}, executionLimit).then(()=>{
					if(_pendingMessage){
						_pendingMessage = false;
						postMessage({type: 'Response-Timeout', response: 'No response'});
					}
				}).catch(errorMessage => {
					_pendingMessage = false;
					postMessage(errorMessage);
				});
			});
		};
	})();
	fetch(_url).then(response => response.text()).then(participantSource => {
		let header = (()=>{
			try{
				return JSON.parse(participantSource.substring(participantSource.indexOf('/**')+3, participantSource.indexOf('**/')));
			}catch(error){
				return {};
			}
		})();
		if(header.dependencies){
			let scope = _url.slice(0, _url.lastIndexOf('/')+1);
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
			const {
				Agent,
				setSurroundingAgent,
				ManagedRealm,
				Value,
				Get,
				CreateDataProperty
			} = self['@engine262/engine262'];
			setSurroundingAgent(new Agent({
				onNodeEvaluation(){
					Messenger.tick();
				}
			}));
			initNewInterpreter = async state => {
				let random = new Math.seedrandom(messageEvent.data.workerData.settings.general.seed+'@'+messageEvent.data.iframeId);
				_interpreter = new ManagedRealm({});
				let postMessageName = '_'+Date.now()+'_postMessage';
				let countExecutionStepsName = '_'+Date.now()+'_countExecutionSteps';
				_interpreter.scope(() => {
					CreateDataProperty(_interpreter.GlobalObject, new Value(postMessageName), new Value(onResponse));
					CreateDataProperty(_interpreter.GlobalObject, new Value(countExecutionStepsName), new Value(Messenger.countExecutionSteps));
					let math = Get(_interpreter.GlobalObject, new Value('Math'));
					CreateDataProperty(math.Value, new Value('random'), new Value(()=>{return new Value(random())}));
				});
				if(state){
					_interpreter.evaluateScript(state);
				}else{
					await Messenger.messageInterpreter('let __url=\''+_url+'\';\nlet onmessage = null; function postMessage(input){'+countExecutionStepsName+'(false); '+postMessageName+'(JSON.stringify(input)); '+countExecutionStepsName+'(true);}', Infinity);
					await Messenger.messageInterpreter((await Promise.allSettled(participantSources)).map(r => r.value).join(';\n'), executionLimit).catch(errorMessage => {
						postMessage({type: 'Fetal-Error', response: errorMessage.response});
					});
					await Messenger.messageInterpreter({type: 'Settings', ...messageEvent.data.workerData}, executionLimit).then(()=>{
						interpreterReady();
					}).catch(errorMessage => {
						throw new Error('Participant ('+_url+') initiation failed: '+errorMessage.response);
					});
					return _interpreter;
				}
			}
			initNewInterpreter().then(()=>{
				postMessage(null);
			}).catch(error => {postMessage({type: 'Init-Error', response: error})});
		});
	});
};
postMessage(null);
