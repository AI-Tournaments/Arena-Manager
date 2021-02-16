'use strict'
class ParticipantHelper{
	static #instance = null;
	static #initiated = false;
	static #name = __url;
	static #postMessage_native = ()=>{}
	static init = ()=>{};
	static onmessage = ()=>{}
	static onmessageerror = ()=>{}
	static respond = (data=null) => {
		ParticipantHelper.#postMessage_native.call(globalThis, data);
	}
	static #onmessage = messageEvent=>{
		if(ParticipantHelper.#initiated){
			if(typeof ParticipantHelper.onmessage === 'function'){
				ParticipantHelper.onmessage(messageEvent.data.message, messageEvent.data.type);
			}else{
				fatal('ParticipantHelper.onmessage is not a function.');
			}
		}else{
			if(messageEvent.data.settings.general.seed === ''){
				throw new Error('No seed given!');
			}
			Math.seedrandom(messageEvent.data.settings.general.seed);
			ParticipantHelper.random = new Math.seedrandom(messageEvent.data.settings.general.seed);
			// Disable features that could be used to generate unpredictable random numbers.
			delete Math.seedrandom;
			Date = null;
			performance = null;
			// Initiate participant.
			ParticipantHelper.init(messageEvent.data);
			ParticipantHelper.#initiated = true;
		}
	}
	static #onmessageerror = messageEvent=>{
		console.log('// Will probably never be used but wraps default function anyway for future proofing.');
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
		ParticipantHelper.respond(null);
	}
}
