'use strict'
class ParticipantHelper{
	static #instance = null;
	static #initiated = false;
	static #name = __url;
	static #postMessage_native = ()=>{}
	static onmessage = ()=>{}
	static onmessageerror = ()=>{}
	static respond = data => {
		ParticipantHelper.#postMessage_native.call(globalThis, data);
	}
	static #onmessage = messageEvent=>{
		if(ParticipantHelper.#initiated){
			ParticipantHelper.onmessage(messageEvent.data);
		}else{
			ParticipantHelper.init(messageEvent.data);
			ParticipantHelper.#initiated = true;
		}
	}
	static #onmessageerror = messageEvent=>{
		ParticipantHelper.onmessageerror(messageEvent);
	}
	static random;
	static preInit(){
		if(ParticipantHelper.#instance !== null){
			throw new Error('ParticipantHelper is already constructed.');
		}
		ParticipantHelper.#instance = this;
		onmessage = ParticipantHelper.#onmessage;
		onmessageerror = ParticipantHelper.#onmessageerror;
		ParticipantHelper.#postMessage_native = postMessage;
		let postMessage_error = () => {
			throw new Error(ParticipantHelper.#name +': '+ 'postMessage() is wrapped inside ParticipantHelper, use ParticipantHelper.respond().');
		}
		postMessage = postMessage_error;
		let _ParticipantHelperPostMessage = ParticipantHelper.postMessage;
		function onMessageWatcher(){
			let error = null;
			if(onmessage !== ParticipantHelper.#onmessage){
				error = 'onmessage';
			}else if(onmessageerror !== ParticipantHelper.#onmessageerror){
				error = 'onmessageerror';
			}else if(postMessage !== postMessage_error || _ParticipantHelperPostMessage !== ParticipantHelper.postMessage){
				error = 'postMessage';
			}else{
				setTimeout(onMessageWatcher, 1000);
			}
			if(error !== null){
				throw new Error(ParticipantHelper.#name +': '+ error+' is required by the ParticipantHelper, use ParticipantHelper.'+error+'.');
			}
		}
		onMessageWatcher();
		if(Math.seedrandom !== undefined){
			console.log('// TODO: seed');
			ParticipantHelper.random = Math.seedrandom('// TODO: seed');
		}
		let random_error = () => {
			throw new Error(ParticipantHelper.#name +': '+ 'Use ParticipantHelper.random if random is allowed by the arena.');
		}

		// Disable features that could be used to generate unpredictable random numbers.
		Math.random = random_error;
		Math.seedrandom = random_error;
		Date = null;
		performance = null;

		// Report ready.
		ParticipantHelper.respond(null);
	}
}
