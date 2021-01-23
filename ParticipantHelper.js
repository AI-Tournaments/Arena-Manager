'use strict'
class ParticipantHelper{
	static #instance = null;
	static #initiated = false;
	static init = ()=>{}
	static onmessage = ()=>{}
	static onmessageerror = ()=>{}
	static #onmessage = messageEvent=>{
		if(ParticipantHelper.#initiated){
			ParticipantHelper.onmessage(messageEvent.data);
		}else{
			ParticipantHelper.init(messageEvent.data);
			ParticipantHelper.#initiated = true;
		}
	}
	static #onmessageerror = messageEvent=>{
		ParticipantHelper.onmessageerror();
	}
	static random;
	constructor(){
		if(ParticipantHelper.#instance !== null){
			throw new Error('ParticipantHelper is already constructed.');
		}
		ParticipantHelper.#instance = this;
		onmessage = ParticipantHelper.#onmessage;
		onmessageerror = ParticipantHelper.#onmessageerror;
		function onMessageWatcher(){
			if(onmessage !== ParticipantHelper.#onmessage || onmessageerror !== ParticipantHelper.#onmessageerror){
				throw new Error('onmessage is required by the ParticipantHelper, use ParticipantHelper.onmessage.');
			}else{
				setTimeout(onMessageWatcher, 1000);
			}
		}
		onMessageWatcher();
		let randomError = () => {
			throw new Error('Use ParticipantHelper.random if random is allowed by the arena.');
		}
		if(Math.seedrandom !== undefined){
			console.log('// TODO: seed');
			ParticipantHelper.random = Math.seedrandom('// TODO: seed');
		}
		Math.random = randomError;
		Math.seedrandom = randomError;
	}
}
new ParticipantHelper();
