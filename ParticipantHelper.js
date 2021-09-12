'use strict'
class ParticipantHelper{
	static #executionWatcher = undefined;
	static #executionLimit = undefined;
	static #instance = null;
	static #initiated = false;
	static #name = __url;
	static #messageIndex;
	static #postMessage_native = ()=>{}
	static init = ()=>{};
	static onmessage = ()=>{}
	static onmessageerror = ()=>{}
	static #messageTimeout = ()=>{
		ParticipantHelper.onmessage(ParticipantHelper.#messageIndex, 'Message-Timeout');
		ParticipantHelper.#postMessage_native.call(globalThis, {type: 'Message-Timeout'});
	}
	static #onmessage = messageEvent=>{
		if(ParticipantHelper.#initiated){
			if(typeof ParticipantHelper.onmessage === 'function'){
				class Message{
					constructor(data){
						this.data = data.message;
						this.type = data.type;
						this.messageIndex = data.index;
						this.respond = (data=null) => {
							if(ParticipantHelper.#executionWatcher !== undefined){
								ParticipantHelper.#executionWatcher = clearTimeout(ParticipantHelper.#executionWatcher);
								ParticipantHelper.#postMessage_native.call(globalThis, {type: 'Response', response: data});
							}
						}
					}
				}
				ParticipantHelper.#messageIndex = messageEvent.data.index;
				ParticipantHelper.#executionWatcher = setTimeout(ParticipantHelper.#messageTimeout, ParticipantHelper.#executionLimit);
				ParticipantHelper.onmessage(new Message(messageEvent.data));
			}else{
				fatal('ParticipantHelper.onmessage is not a function.');
			}
		}else{
			if(messageEvent.data.settings.general.seed === ''){
				throw new Error('No seed given!');
			}
			Math.seedrandom(messageEvent.data.settings.general.seed+'@'+messageEvent.data.iframeId);
			// Disable features that could be used to generate unpredictable random numbers.
			delete Math.seedrandom;
			Date = null;
			performance = null;
			console.log('// TODO: Decuple (new) Worker.');
			// Initiate participant.
			ParticipantHelper.#executionLimit = messageEvent.data.settings.general.executionLimit;
			class Settings{
				constructor(settings={}){
					for(const key in settings){
						if(Object.hasOwnProperty.call(settings, key)){
							this[key] = settings[key];
						}
					}
				}
			}
			class Opponents extends Array{
				constructor(opponents=[]){
					super(...opponents);
				}
			}
			ParticipantHelper.init(new Settings(messageEvent.data.settings), new Opponents(messageEvent.data.opponents));
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
		ParticipantHelper.#postMessage_native.call(globalThis, null);
	}
}
