'use strict'
class ArenaHelper{
	static #log = [];
	static #settings = null;
	static #responseQueue = [];
	static #participants = null;
	static #participants_onError = null;
	static #participants_onMessage = null;
	static #participants_onMessageTimeout = null;
	static #participants_workerCreated = null;
	static #arenaReady = null;
	static #participants_getParticipantWrapper = null;
	static #postMessage_native = ()=>{};
	static #postMessage = data => {
		ArenaHelper.#postMessage_native.call(globalThis, data);
	}
	static #setParticipants = participants => {this.#participants = participants};
	static log = (type='', value, raw=false)=>{
		this.#log.push({type: type, value: raw ? value : JSON.parse(JSON.stringify(value))});
	}
	static #getBaseReturn = ()=>{
		return {settings: ArenaHelper.#settings, log: this.#log};
	}
	static postDone = ()=>{
		this.#participants.terminateAllWorkers();
		let returnObject = this.#getBaseReturn();
		returnObject.scores = this.#participants.getScores();
		ArenaHelper.#postMessage({type: 'Done', message: returnObject});
	}
	static postAbort = (participant='', error='')=>{
		this.#participants.terminateAllWorkers();
		let returnObject = this.#getBaseReturn();
		returnObject.participantName = participant.name === undefined ? participant : participant.name;
		returnObject.error = error;
		ArenaHelper.#postMessage({type: 'Aborted', message: returnObject});
	}
	static #onmessage = messageEvent=>{
		switch(messageEvent.data.type){
			default: throw new Error('Message type "'+messageEvent.data.type+'" not found.');
			case 'Event': break;
			case 'Start': ArenaHelper.#arenaReady(); break;
			case 'Response': ArenaHelper.#response(messageEvent.data.data.event, messageEvent.data.data.source, messageEvent.data.data.payload); break;
		}
	}
	static #onmessageerror = messageEvent=>{
		console.error(messageEvent);
		ArenaHelper.postAbort('Message-Error', error.data);
	}
	static #response = (event, source, payload) => {
		switch(event){
			default: throw new Error('Response-Event "'+event+'" not found.');
			case 'Message': ArenaHelper.#participants_onMessage(source, payload); break;
			case 'Message-Timeout': ArenaHelper.#participants_onMessageTimeout(source, payload); break;
			case 'Error': ArenaHelper.#participants_onError(source, payload); break;
			case 'Worker-Created': ArenaHelper.#participants_workerCreated(source); break;
		}
		while(ArenaHelper.#responseQueue.length && ArenaHelper.#responseQueue[0].done !== null){
			let queueItem = ArenaHelper.#responseQueue[0];
			queueItem.done({responseReceived: queueItem.responseReceived, responseRejected: queueItem.responseRejected});
			ArenaHelper.#responseQueue.splice(0, 1);
		}
	}
	static init = null;
	static #init = null;
	static preInit(){
		function fatal(message){
			console.error(message);
			ArenaHelper.postAbort('Fatal-Abort', message);
		}
		let debug = false;
		ArenaHelper.#init = ()=>{
			if(typeof ArenaHelper.init === 'function'){
				if(debug){debugger;} // Use the browser debugger to step in to the ArenaHelper.init function below.
				ArenaHelper.init(ArenaHelper.#participants, ArenaHelper.#settings);
			}else{
				fatal('ArenaHelper.init is not a function.');
			}
		}
		let onmessage_preInit = messageEvent => {
			if(messageEvent.data.settings.general.seed === ''){
				throw new Error('No seed given!');
			}
			debug = messageEvent.data.debug;
			Math.seedrandom(messageEvent.data.settings.general.seed);
			// Disable features that could be used to generate unpredictable random numbers.
			delete Math.seedrandom;
			Date = null;
			performance = null;
			console.log('// TODO: Decuple (new) Worker.');
			// Initiate participants.
			new ArenaHelper.Participants(messageEvent.data);
			onmessage = ArenaHelper.#onmessage;
		}
		onmessage = onmessage_preInit;
		onmessageerror = ArenaHelper.#onmessageerror;
		ArenaHelper.#postMessage_native = postMessage;
		let postMessage_error = () => {
			fatal('postMessage() is locked by ArenaHelper, use any of the ArenaHelper.post...() methods instead.');
		}
		postMessage = postMessage_error;
		let _ArenaHelperPostMessage = ArenaHelper.#postMessage;
		function onMessageWatcher(){
			let error = null;
			if(onmessage !== ArenaHelper.#onmessage && onmessage !== onmessage_preInit){
				error = 'onmessage';
			}else if(onmessageerror !== ArenaHelper.#onmessageerror){
				error = 'onmessageerror';
			}else if(postMessage !== postMessage_error){
				error = 'postMessage';
			}else if(_ArenaHelperPostMessage ==! ArenaHelper.#postMessage){
				fatal('INTERNAL ERROR!');
			}else{
				setTimeout(onMessageWatcher, 1000);
			}
			if(error !== null){
				fatal(error+' is required by the ArenaHelper, use ArenaHelper.'+error+'.');
			}
		}
		onMessageWatcher();
		new Promise(resolve => ArenaHelper.#arenaReady = resolve).then(() => ArenaHelper.#init());
		ArenaHelper.#postMessage(null);
	}
	static Participants = class{
		static #getWorker = (participantWrapper, name) => {
			return participantWrapper.private.workers.find(workerWrapper => workerWrapper.name === name);
		}
		static #sendMessage(queueItem){
			ArenaHelper.#postMessage({type: 'Message-Worker', message: queueItem.message});
		}
		static #messageWorker = (name='', participantWrapper, body) => {
			let workerWrapper = ArenaHelper.Participants.#getWorker(participantWrapper, name);
			if(!workerWrapper.ready){
				throw new Error('Error: Worker called before it was ready.');
			}
			let promise;
			if(body.type === 'Post'){
				body.index = workerWrapper.messageIndex++;
				let responseReceived;
				let responseRejected;
				promise = new Promise((resolve, reject) => {responseReceived = resolve; responseRejected = reject;});
				let queueItem = {
					done: null,
					messageIndex: body.index,
					message: {receiver: workerWrapper.iframeId, body: body},
					responseReceived: responseReceived,
					responseRejected: responseRejected
				};
				ArenaHelper.#responseQueue.push(queueItem);
				workerWrapper.pendingMessages.push(queueItem);
				if(workerWrapper.pendingMessages.length === 1){
					ArenaHelper.Participants.#sendMessage(queueItem);
				}
			}else{
				throw new Error('Message type "'+body.type+'" is not implemented.');
			}
			return promise;
		}
		static #getPendingMessage = (participantWrapper, workerName, messageIndex) => {
			let workerWrapper = ArenaHelper.Participants.#getWorker(participantWrapper, workerName);
			if(workerWrapper.pendingMessages.length){
				let queueItem = workerWrapper.pendingMessages.shift();
				if(workerWrapper.pendingMessages.length){
					ArenaHelper.Participants.#sendMessage(workerWrapper.pendingMessages[0]);
				}
				return new Promise(resolve => queueItem.done = resolve);
			}
			throw new Error('queueItem not found. '+JSON.stringify({participant: participantWrapper.participant.name, worker: workerName, messageIndex: messageIndex}));
		}
		/** INPUT
		 *	Input is the same as input to the arena. Read about '?debug' to find out how to access it.
		 *	READ: https://github.com/AI-Tournaments/AI-Tournaments#develop-environment
		 */
		constructor(data={}){
			if(ArenaHelper.#participants !== null){
				throw new Error('Participants is already constructed.');
			}
			class Settings{
				constructor(settings={}){
					for(const key in settings){
						if(Object.hasOwnProperty.call(settings, key)){
							this[key] = settings[key];
						}
					}
				}
			}
			ArenaHelper.#settings = new Settings(data.settings);
			ArenaHelper.#participants = this;
			let promises = [];
			let _teams = [];
			let wrappers = [];
			ArenaHelper.#setParticipants(this);
			ArenaHelper.#participants_getParticipantWrapper = source => _teams[source.participant[0]].members[source.participant[1]];
			ArenaHelper.#participants_onError = (source, messageIndex) => {
				let participantWrapper = ArenaHelper.#participants_getParticipantWrapper(source);
				console.error('// TODO: Write error message! (or maybe not?)');
				ArenaHelper.Participants.#getPendingMessage(participantWrapper, source.name, messageIndex).then(pendingMessage => {
					console.log("// TODO: Kill participant.");
					pendingMessage.responseRejected({participant: participantWrapper.participant, message: 'ParticipantError'});
				});
			}
			ArenaHelper.#participants_onMessage = (source, payload) => {
				let participantWrapper = ArenaHelper.#participants_getParticipantWrapper(source);
				ArenaHelper.Participants.#getPendingMessage(participantWrapper, source.name, payload.index).then(pendingMessage => {
					pendingMessage.responseReceived({participant: participantWrapper.participant, workerName: source.name, data: payload.message});
				});
			}
			ArenaHelper.#participants_onMessageTimeout = (source, payload) => {
				let participantWrapper = ArenaHelper.#participants_getParticipantWrapper(source);
				ArenaHelper.Participants.#getPendingMessage(participantWrapper, source.name, payload.index).then(pendingMessage => {
					pendingMessage.responseRejected({participant: participantWrapper.participant, message: 'MessageTimeout'});
				});
			}
			ArenaHelper.#participants_workerCreated = source => {
				let participantWrapper = ArenaHelper.#participants_getParticipantWrapper(source);
				let workerWrapper = ArenaHelper.Participants.#getWorker(participantWrapper, source.name);
				workerWrapper.ready = true;
				workerWrapper.promiseWorkerReady();
			}
			this.addWorker = (participant, name='') => {
				if(name !== ''){
					console.log('// TODO: (Fixed?) Add a wrapping sandbox outside of iframe.sandbox.arena.html, because the current blocks network and prevent more Workers to be created.');
				}
				let team = _teams[participant.team];
				let participantWrapper = team.members[participant.member];
				let workerWrapper = ArenaHelper.Participants.#getWorker(participantWrapper, name);
				if(workerWrapper !== undefined){
					throw new Error('Participant already has worker with name "'+name+'".');
				}
				workerWrapper = {
					name: name,
					promiseWorkerReady: null,
					ready: false,
					iframeId: 'matchIndex-'+data.matchIndex+'_team-'+participant.team+'_'+'member-'+participant.member+'_'+encodeURIComponent(name),
					messageIndex: 0,
					pendingMessages: []
				};
				if(team.precomputedWorkerData === null){
					let opponents = [];
					_teams.forEach((team, teamIndex) => {
						if(participant.team === teamIndex){
							opponents.push(null);
						}else{
							let names = [];
							opponents.push(names);
							team.members.forEach(participantWrapper => {
								let name = null;
								if(data.settings.general.discloseOpponents === 'Yes'){
									name = participantWrapper.participant.name;
								}else if(data.settings.general.discloseOpponents === 'AccountOnly'){
									name = participantWrapper.participant.name.split('/')[0];
								}
								names.push(name);
							});
						}
					});
					team.precomputedWorkerData = {
						settings: data.settings,
						opponents: opponents
					};
				}
				participantWrapper.private.workers.push(workerWrapper);
				ArenaHelper.#postMessage({
					type: 'Add-Worker',
					message: {
						iframeId: workerWrapper.iframeId,
						participant: [participant.team, participant.member],
						name: name,
						url: participantWrapper.private.url,
						workerData: {
							...team.precomputedWorkerData,
							iframeId: workerWrapper.iframeId
						}
					}
				});
				return new Promise(resolve => workerWrapper.promiseWorkerReady = resolve);
			}
			this.killWorker = (participant, name)=>{
				participant.postMessage('Kill', name, true).then(()=>{
					let participantWrapper = _teams[participant.team].members[participant.member];
					let workers = participantWrapper.private.workers;
					let workerWrapper = workers.find(workerWrapper => workerWrapper.name === name);
					let index = workers.findIndex(w => w === workerWrapper);
					workers.splice(index, 1);
				});
			}
			this.postToAll = (message='') => {
				let promises = [];
				_teams.forEach((team,index) => {
					promises.push(...this.postToTeam(index, message));
				});
				return promises;
			}
			this.postToTeam = (team=-1, message='') => {
				let promises = [];
				_teams[team].members.forEach(participantWrapper => {
					promises.push(participantWrapper.participant.postMessage(message));
				});
				return promises;
			}
			this.get = (team=-1, participant=-1) => {
				return _teams[team].members[participant].participant;
			}
			this.addScore = (team, score) => {
				_teams[team].score += score;
			}
			this.addBonusScore = (participant, score) => {
				_teams[participant.team].members[participant.member].private.score += score;
			}
			this.countTeams = () => _teams.length;
			this.countMembers = teamIndex => {
				let count = 0;
				if(teamIndex === undefined){
					_teams.forEach(team => {
						count += team.members.length;
					})
				}else{
					_teams[teamIndex].members.length;
				}
				return count;
			}
			this.getScores = () => {
				let scores = [];
				_teams.forEach(team => {
					let result = {
						score: team.score,
						members: [],
						team: team.number
					};
					scores.push(result);
					team.members.forEach(participantWrapper => {
						result.members.push({
							name: participantWrapper.participant.name,
							bonus: participantWrapper.private.score
						});
					});
				});
				return scores;
			}
			this.terminateAllWorkers = () => {
				wrappers.forEach(participantWrapper => {
					participantWrapper.private.workers.forEach(workerWrapper => {
						this.killWorker(participantWrapper.participant, workerWrapper.name);
					});
				});
			}
			class Participant{
				constructor(name, teamIndex, participantIndex, participantWrapper){
					this.name = name;
					this.team = teamIndex,
					this.member = participantIndex,
					this.payload = {};
					this.addWorker = name => {
						ArenaHelper.#participants.addWorker(this, name);
					}
					this.postMessage = async (data, workerName='', systemMessage=false) => ArenaHelper.Participants.#messageWorker(workerName, participantWrapper, {type: 'Post', message: data, systemMessage: systemMessage});
				}
			}
			data.participants.forEach((team, teamIndex) => {
				let members = [];
				_teams.push({score: 0, members: members, number: teamIndex, precomputedWorkerData: null});
				team.forEach((participant, participantIndex) => {
					let participantWrapper = {
						participant: null,
						team: team,
						private: {
							url: participant.url,
							score: 0,
							workers: []
						}
					};
					participantWrapper.participant = new Participant(participant.name, teamIndex, participantIndex, participantWrapper);
					members.push(participantWrapper);
					wrappers.push(participantWrapper);
				});
			});
			_teams.forEach(team => {
				team.members.forEach(participantWrapper => {
					let promise = this.addWorker(participantWrapper.participant, '');
					promises.push(promise);
				});
			});
			let _onError = error=>{
				ArenaHelper.postAbort('Did-Not-Start', error);
			}
			Promise.allSettled(promises).then(() => {
				ArenaHelper.#postMessage({type: 'Ready-To-Start', message: null});
			}).catch(error => _onError(error));
		}
	}
	static CreateWorkerFromRemoteURL(url='', includeScripts=[]){
		function createObjectURL(blob){
			let urlObject = URL.createObjectURL(blob);
			setTimeout(()=>{URL.revokeObjectURL(urlObject);},10000); // Worker does not work if urlObject is removed to early.
			return urlObject;
		}
		return fetch(url)
		.then(response => response.text())
		.then(text => {
			let _importScripts = 'importScripts(\''+includeScripts.join('\', \'')+'\'); ' + (url.endsWith('/arena.js') ? 'ArenaHelper' : 'ParticipantHelper') + '.preInit(); ';
			let useStrict = text.toLowerCase().startsWith('use strict', 1);
			text = (useStrict ? '\'use strict\'; ' : '') + 'let __url = \''+url+'\'; ' + _importScripts + text;
			let blob;
			try{
				blob = new Blob([text], {type: 'application/javascript'});
			}catch(e){
				blob = new (window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder)();
				blob.append(text);
				blob = blob.getBlob();
			}
			let resolve;
			let promise = new Promise(_resolve => resolve = _resolve);
			let worker = new Worker(createObjectURL(blob));
			worker.onmessage = () => resolve(worker);
			return promise;
		});
	}
}
