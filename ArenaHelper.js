'use strict'
class ArenaHelper{
	static #log = [];
	static #settings = null;
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
	static postDone = ()=>{
		this.#participants.terminateAllWorkers();
		let scores = this.#participants.getScores();
		let colors = [];
		scores.forEach((team, index) => {
			colors.push(this.#participants.getTeamColor(index));
		});
		ArenaHelper.#postMessage({type: 'Done', message: {score: scores, teamColors: colors, settings: participants.getSettings(), log: this.#log}});
	}
	static postAbort = (participant='', error='')=>{
		this.#participants.terminateAllWorkers();
		let participantName = participant.name === undefined ? participant : participant.name;
		ArenaHelper.#postMessage({type: 'Aborted', message: {participantName: participantName, error: error}});
	}
	static #onmessage = messageEvent=>{
		switch(messageEvent.data.type){
			default: throw new Error('Message type "'+messageEvent.data.type+'" not found.');
			case 'Start': ArenaHelper.#arenaReady(); break;
			case 'Event': ArenaHelper.#event(messageEvent.data.data.event, messageEvent.data.data.source, messageEvent.data.data.payload); break;
		}
	}
	static #onmessageerror = messageEvent=>{
		console.error(messageEvent);
		ArenaHelper.postAbort('Message-Error', error.data);
	}
	static #event = (event, source, payload) => {
		switch(event){
			default: throw new Error('Event "'+event+'" not found.');
			case 'Message': ArenaHelper.#participants_onMessage(source, payload); break;
			case 'Message-Timeout': ArenaHelper.#participants_onMessageTimeout(source, payload); break;
			case 'Error': ArenaHelper.#participants_onError(source, payload); break;
			case 'Worker-Created': ArenaHelper.#participants_workerCreated(source); break;
		}
	}
	static init = null;
	static #init = null;
	static preInit(){
		function fatal(message){
			console.error(message);
			ArenaHelper.postAbort('Fatal-Abort', message);
			throw new Error(message);
		}
		ArenaHelper.#init = ()=>{
			if(typeof ArenaHelper.init === 'function'){
				ArenaHelper.init(ArenaHelper.#settings, ArenaHelper.#participants);
			}else{
				fatal('ArenaHelper.init is not a function.');
			}
		}
		let onmessage_preInit = messageEvent => {
			if(messageEvent.data.settings.general.seed === ''){
				throw new Error('No seed given!');
			}
			Math.seedrandom(messageEvent.data.settings.general.seed);
			ArenaHelper.random = new Math.seedrandom(messageEvent.data.settings.general.seed);
			// Disable features that could be used to generate unpredictable random numbers.
			delete Math.seedrandom;
			Date = null;
			performance = null;
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
		static #messageWorker = (name='', participantWrapper, body) => {
			let workerWrapper = ArenaHelper.Participants.#getWorker(participantWrapper, name);
			if(!workerWrapper.ready){
				throw new Error('Error: Worker called before it was ready.');
			}
			let promise;
			if(body.type === 'post'){
				body.index = workerWrapper.messageIndex++;
				let responseReceived;
				let responseRejected;
				promise = new Promise((resolve, reject) => {responseReceived = resolve; responseRejected = reject;});
				workerWrapper.pendingMessages.push({index: body.index, responseReceived: responseReceived, responseRejected: responseRejected});
			}
			ArenaHelper.#postMessage({type: 'Message-Worker', message: {receiver: workerWrapper.iframeId, body: body}});
			return promise;
		}
		static #getPendingMessage = (participantWrapper, workerName, messageIndex) => {
			let workerWrapper = ArenaHelper.Participants.#getWorker(participantWrapper, workerName);
			let message;
			for(let index = 0; index < workerWrapper.pendingMessages.length; index++){
				if(workerWrapper.pendingMessages[index].index === messageIndex){
					message = workerWrapper.pendingMessages[index];
					workerWrapper.pendingMessages.splice(index, 1);
					return message;
				}
			}
			if(message === undefined){
				throw new Error('Message not found.');
			}
		}
		/** INPUT
		 *	Input is the same as input to the arena. Read about '?debug' to find out how to access it.
		 *	READ: https://github.com/AI-Tournaments/AI-Tournaments#develop-environment
		 */
		constructor(data={}){
			if(ArenaHelper.#participants !== null){
				throw new Error('Participants is already constructed.');
			}
			ArenaHelper.#settings = data.settings;
			ArenaHelper.#participants = this;
			let terminated = false;
			let promises = [];
			let _teams = [];
			let wrappers = [];
			ArenaHelper.#setParticipants(this);
			ArenaHelper.#participants_getParticipantWrapper = source => _teams[source.participant[0]].members[source.participant[1]];
			ArenaHelper.#participants_onError = (source, messageIndex) => {
				let participantWrapper = ArenaHelper.#participants_getParticipantWrapper(source);
				console.error('// TODO: Write error message! (or maybe not?)');
				let pendingMessage = ArenaHelper.Participants.#getPendingMessage(participantWrapper, source.name, messageIndex);
				console.log("// TODO: Kill participant.");
				pendingMessage.responseRejected({participant: participantWrapper.participant, message: 'ParticipantError'});
			}
			ArenaHelper.#participants_onMessage = (source, payload) => {
				let participantWrapper = ArenaHelper.#participants_getParticipantWrapper(source);
				let pendingMessage = ArenaHelper.Participants.#getPendingMessage(participantWrapper, source.name, payload.index);
				pendingMessage.responseReceived({participant: participantWrapper.participant, workerName: source.name, data: payload.message});
			}
			ArenaHelper.#participants_onMessageTimeout = (source, payload) => {
				let participantWrapper = ArenaHelper.#participants_getParticipantWrapper(source);
				let pendingMessage = ArenaHelper.Participants.#getPendingMessage(participantWrapper, source.name, payload.index);
				pendingMessage.responseRejected({participant: participantWrapper.participant, message: 'MessageTimeout'});
			}
			ArenaHelper.#participants_workerCreated = source => {
				let participantWrapper = ArenaHelper.#participants_getParticipantWrapper(source);
				let workerWrapper = ArenaHelper.Participants.#getWorker(participantWrapper, source.name);
				workerWrapper.ready = true;
				workerWrapper.promiseWorkerReady();
			}
			this.addWorker = (participant, name='') => {
				if(name !== ''){
					console.log('// TODO: Add a wrapping sandbox outside of iframe.sandbox.arena.html, because the current blocks network and prevent more Workers to be created.');
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
					iframeId: 'team-'+participant.team+'_'+'member-'+participant.member+'_'+name,
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
								if(data.settings.general.displayOpponents === 'Yes'){
									name = participantWrapper.participant.name;
								}else if(data.settings.general.displayOpponents === 'AccountOnly'){
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
						workerData: team.precomputedWorkerData
					}
				});
				return new Promise(resolve => workerWrapper.promiseWorkerReady = resolve);
			}
			this.killWorker = (participant, name)=>{
				let participantWrapper = _teams[participant.team].members[participant.member];
				let workers = participantWrapper.private.workers;
				let workerWrapper = workers.find(workerWrapper => workerWrapper.name === name);
				let index = workers.findIndex(w => w === workerWrapper);
				workers.splice(index, 1);
				ArenaHelper.#postMessage({type: 'Kill-Worker', message: workerWrapper.iframeId});
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
						members: []
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
			this.getTeamColor = indexOrParticipant => {
				let index = typeof indexOrParticipant === 'object' ? indexOrParticipant.team : indexOrParticipant;
				let hue = index/_teams.length;
				let saturation = 0.5;
				let lightness = 0.5;
				let _q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
				let _p = 2 * lightness - _q;
				function hue2rgb(_p, _q, _t){
					if(_t < 0){_t += 1;}
					if(_t > 1){_t -= 1;}
					if(_t < 1/6.0){return _p + (_q - _p) * 6 * _t;}
					if(_t < 1/2.0){return _q;}
					if(_t < 2/3.0){return _p + (_q - _p) * (2/3.0 - _t) * 6;}
					return _p;
				}
				return {
					R: hue2rgb(_p, _q, hue + 1/3.0),
					G: hue2rgb(_p, _q, hue),
					B: hue2rgb(_p, _q, hue - 1/3.0)
				};
			}
			this.terminateAllWorkers = () => {
				terminated = true;
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
					this.postMessage = async (data, workerName) => {
						return ArenaHelper.Participants.#messageWorker(workerName, participantWrapper, {type: 'post', message: data});
					}
					this.sendUpdate = (data, workerName) => {
						ArenaHelper.Participants.#messageWorker(workerName, participantWrapper, {type: 'update', message: data});
					}
				}
			}
			data.participants.forEach((team, teamIndex) => {
				let members = [];
				_teams.push({score: 0, members: members, precomputedWorkerData: null});
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
			Promise.all(promises).then(() => {
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
				window.BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder;
				blob = new BlobBuilder();
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
