'use strict'
class ArenaHelper{
	static #log = [];
	static #logTypeCount = {};
	static #settings = null;
	static #arenaReady = null;
	static #responseQueue = [];
	static #participants = null;
	static #participants_onError = null;
	static #participants_onMessage = null;
	static #participants_workerCreated = null;
	static #participants_onMessageTimeout = null;
	static #participants_getParticipantWrapper = null;
	static #postMessage_native = ()=>{};
	static #postMessage = data => {
		ArenaHelper.#postMessage_native.call(globalThis, data);
	}
	static #setParticipants = participants => {this.#participants = participants};
	static log = (type='', value)=>{
		value = structuredClone(value);
		this.#log.push({type, value});
		if(!this.#logTypeCount[type]){
			this.#logTypeCount[type] = 0;
		}
		this.#logTypeCount[type]++;
	}
	static countLog = (type='')=>{
		return this.#logTypeCount[type];
	}
	static #getBaseReturn = ()=>{
		return {settings: ArenaHelper.#settings, log: this.#log};
	}
	static postDone = ()=>{
		this.#participants.terminateAllWorkers();
		const message = this.#getBaseReturn();
		message.scores = this.#participants.getScores();
		ArenaHelper.#postMessage({type: 'Done', message});
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
			case 'Response': ArenaHelper.#participants_onMessage(source, payload); break;
			case 'Init-Error':
			case 'Fetal-Error':
			case 'Response-Error':
				if(ArenaHelper.localDevelopment){
					let participantWrapper = ArenaHelper.#participants_getParticipantWrapper(source);
					console.error(event, 'Error occurred in message '+payload.messageIndex+' for participant "'+participantWrapper.participant.name+'", worker "'+source.name+'".\n'+payload.message);
				}
				ArenaHelper.#participants_onError(event, source, payload);
				break;
			case 'Response-Timeout':
				if(ArenaHelper.localDevelopment){
					let participantWrapper = ArenaHelper.#participants_getParticipantWrapper(source);
					console.warn(event, 'Message '+payload.messageIndex+' timed out for participant "'+participantWrapper.participant.name+'", worker "'+source.name+'", reason "'+payload.message+'".');
				}
				ArenaHelper.#participants_onMessageTimeout(source, payload);
				break;
			case 'Worker-Created': ArenaHelper.#participants_workerCreated(source); break;
		}
		while(ArenaHelper.#responseQueue.length && ArenaHelper.#responseQueue[0].done){
			let queueItem = ArenaHelper.#responseQueue[0];
			queueItem.done({responseReceived: queueItem.responseReceived});
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
		ArenaHelper.#init = ()=>{
			if(typeof ArenaHelper.init === 'function'){
				ArenaHelper.init(ArenaHelper.#participants, ArenaHelper.#settings);
			}else{
				fatal('ArenaHelper.init is not a function.');
			}
		}
		let onmessage_preInit = messageEvent => {
			if(messageEvent.data.settings.general.seed === ''){
				throw new Error('No seed given!');
			}
			Math.seedrandom(messageEvent.data.settings.general.seed);
			// Disable features that could be used to generate unpredictable random numbers.
			delete Math.seedrandom;
			Date = null;
			performance = null;
			globalThis.setTimeout=()=>{};
			globalThis.setInterval=()=>{};
			console.log('// TODO: Decuple (new) Worker.'); // Why?
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
		self.addEventListener('unhandledrejection', function(promiseRejectionEvent){
			let message;
			if(promiseRejectionEvent.reason.stack){
				let stack = promiseRejectionEvent.reason.stack.split('\n');
				message = stack[0]+' @ '+stack[1].trim().split(':').slice(Math.max(-2)).join(':');
			}else{
				message = promiseRejectionEvent.reason;
			}
			ArenaHelper.postAbort('Arena', message);
		});
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
			if(!workerWrapper.ready && !body.systemMessage){
				throw new Error('Error: Worker called before it was ready.');
			}
			let promise;
			if(body.type === 'Post'){
				body.index = workerWrapper.messageIndex++;
				let responseReceived;
				promise = new Promise((resolve, reject) => {responseReceived = resolve;});
				let queueItem = {
					done: null,
					messageIndex: body.index,
					message: {receiver: workerWrapper.iframeId, body: body},
					responseReceived: responseReceived
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
		static #getPendingMessage = (participantWrapper, workerName) => {
			let workerWrapper = ArenaHelper.Participants.#getWorker(participantWrapper, workerName);
			if(workerWrapper.pendingMessages.length){
				let queueItem = workerWrapper.pendingMessages.shift();
				if(workerWrapper.pendingMessages.length){
					ArenaHelper.Participants.#sendMessage(workerWrapper.pendingMessages[0]);
				}
				return new Promise(resolve => queueItem.done = resolve);
			}
			return Promise.reject({reason: 'queueItem not found.', participant: participantWrapper.participant.name, worker: workerName});
		}
		/**
		 *	Input is the same as input to the arena.
		 */
		constructor(data={}){
			if(ArenaHelper.#participants !== null){
				throw new Error('Participants is already constructed.');
			}
			Object.defineProperty(ArenaHelper, 'localDevelopment', {
				value: data.localDevelopment,
				writable : false,
				enumerable : true,
				configurable : false
			});
			class Settings{
				constructor(settings={}){
					for(const key in settings){
						if(Object.hasOwnProperty.call(settings, key)){
							this[key] = settings[key];
						}
					}
				}
			}
			class Response {
				constructor(fields={}){
					for(const key in fields){
						if(Object.hasOwnProperty.call(fields, key)){
							this[key] = fields[key];
							Object.defineProperty(this, key, {
								value: fields[key],
								writable: false,
								enumerable: true,
								configurable: false
							});
						}
					}
				}
			}
			class ResponseError extends Response {}
			class ResponseMessage extends Response {}
			class ResponseTimeout extends Response {}
			ArenaHelper.#settings = new Settings(data.settings);
			ArenaHelper.#participants = this;
			let promises = [];
			let _teams = [];
			let wrappers = [];
			ArenaHelper.#setParticipants(this);
			ArenaHelper.#participants_getParticipantWrapper = source => _teams[source.participant[0]].members[source.participant[1]];
			ArenaHelper.#participants_onError = (event, source, payload) => {
				let participantWrapper = ArenaHelper.#participants_getParticipantWrapper(source);
				if(typeof payload.messageIndex === 'number'){
					ArenaHelper.Participants.#getPendingMessage(participantWrapper, source.name).then(pendingMessage => {
						pendingMessage.responseReceived(new ResponseError({participant: participantWrapper.participant, workerName: source.name}));
					}).catch(()=>{});
				}else{
					ArenaHelper.postAbort(event, 'participant: '+participantWrapper.participant.name+'\nworker: '+source.name+'\n'+payload.message);
				}
			}
			ArenaHelper.#participants_onMessage = (source, payload) => {
				let participantWrapper = ArenaHelper.#participants_getParticipantWrapper(source);
				ArenaHelper.Participants.#getPendingMessage(participantWrapper, source.name, payload.index).then(pendingMessage => {
					pendingMessage.responseReceived(new ResponseMessage({participant: participantWrapper.participant, workerName: source.name, message: {data: payload.message.value, ticks: payload.message.executionSteps}}));
				}).catch(()=>{});
			}
			ArenaHelper.#participants_onMessageTimeout = (source, payload) => {
				let participantWrapper = ArenaHelper.#participants_getParticipantWrapper(source);
				ArenaHelper.Participants.#getPendingMessage(participantWrapper, source.name, payload.index).then(pendingMessage => {
					pendingMessage.responseReceived(new ResponseTimeout({participant: participantWrapper.participant, workerName: source.name}));
				}).catch(()=>{});
			}
			ArenaHelper.#participants_workerCreated = source => {
				let participantWrapper = ArenaHelper.#participants_getParticipantWrapper(source);
				let workerWrapper = ArenaHelper.Participants.#getWorker(participantWrapper, source.name);
				workerWrapper.ready = true;
				workerWrapper.promiseWorkerReady();
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
			this.find = callback => {
				return _teams.find(team => team.members.find(member => callback(member.participant)));
			}
			this.forEach = callback => {
				_teams.forEach(team => team.members.forEach(member => callback(member.participant)));
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
						participantWrapper.participant.killWorker(workerWrapper.name);
					});
				});
			}
			class Participant{
				constructor(name, teamIndex, participantIndex, participantWrapper){
					const _team = _teams[teamIndex];
					this.payload = {};
					[
						{
							name: 'name',
							value: name
						},{
							name: 'team',
							value: teamIndex
						},{
							name: 'member',
							value: participantIndex
						},{
							name: 'addWorker',
							value: (name='')=>{
								if(name !== ''){
									console.log('// TODO: (Fixed?) Add a wrapping sandbox outside of iframe.sandbox.arena.html, because the current blocks network and prevent more Workers to be created.');
								}
								let workerWrapper = ArenaHelper.Participants.#getWorker(participantWrapper, name);
								if(workerWrapper !== undefined){
									throw new Error('Participant already has worker with name "'+name+'".');
								}
								workerWrapper = {
									name: name,
									promiseWorkerReady: null,
									ready: false,
									iframeId: 'matchIndex-'+data.matchIndex+'_team-'+teamIndex+'_'+'member-'+participantIndex+'_'+encodeURIComponent(name),
									messageIndex: 0,
									pendingMessages: []
								};
								if(_team.precomputedWorkerData === null){
									let opponents = [];
									_teams.forEach(team => {
										if(team === _team){
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
									_team.precomputedWorkerData = {
										settings: data.settings,
										opponents: opponents
									};
								}
								participantWrapper.private.workers.push(workerWrapper);
								ArenaHelper.#postMessage({
									type: 'Add-Worker',
									message: {
										iframeId: workerWrapper.iframeId,
										participant: [teamIndex, participantIndex],
										name: name,
										url: participantWrapper.private.url,
										workerData: {
											..._team.precomputedWorkerData
										}
									}
								});
								return new Promise(resolve => workerWrapper.promiseWorkerReady = resolve);
							}
						},{
							name: 'killWorker',
							value: name=>{
								this.postMessage('Kill', name, true).then(()=>{
									const workers = participantWrapper.private.workers;
									const workerWrapper = workers.find(workerWrapper => workerWrapper.name === name);
									const index = workers.findIndex(w => w === workerWrapper);
									workers.splice(index, 1);
								});
							}
						},{
							name: 'postMessage',
							value: async (data, workerName='', systemMessage=false) => ArenaHelper.Participants.#messageWorker(workerName, participantWrapper, {type: 'Post', message: data, systemMessage: systemMessage})
						},{
							name: 'addScore',
							value: points=>_team.score += points
						},{
							name: 'addBonusScore',
							value: points=>participantWrapper.private.score += points
						}
					].forEach(field => {
						Object.defineProperty(this, field.name, {
							value: field.value,
							writable: false,
							enumerable: true,
							configurable: false
						});
					});
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
					let promise = participantWrapper.participant.addWorker('');
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
	static CreateWorkerFromRemoteURL(url='', options={}, seed){
		function createObjectURL(javascript){
			let blob;
			try{
				blob = new Blob([javascript], {type: 'application/javascript'});
			}catch(e){
				blob = new (window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder)();
				blob.append(javascript);
				blob = blob.getBlob();
			}
			return URL.createObjectURL(blob);
		}
		return fetch(url).then(response => response.text()).then(jsCode => {
			let _includeScripts = [];
			if(options.system){
				_includeScripts.push(...options.system);
			}
			if(options.mutators){
				_includeScripts.push(...options.mutators);
			}
			let header = (()=>{
				try{
					return JSON.parse(jsCode.substring(jsCode.indexOf('/**')+3, jsCode.indexOf('**/')));
				}catch(error){
					return {};
				}
			})();
			if(header.dependencies){
				let scope = url.slice(0, url.lastIndexOf('/')+1);
				header.dependencies.forEach((dependency, index) => {
					header.dependencies[index] = scope + dependency;
				});
			}else{
				header.dependencies = [];
			}
			let useStrict = jsCode.toLowerCase().startsWith('use strict', 1);
			let preCode = '';
			if(_includeScripts.length){
				preCode += `importScripts('${_includeScripts.join('\', \'')}');\n`;
			}
			if(url.endsWith('/arena.js')){
				preCode += 'ArenaHelper.preInit();\n';
			}else if(seed){
				jsCode = (' '+jsCode).replace(/(?<=\W)_onmessage(?=\W)/g, '_'+Date.now()+'_onmessage');
				jsCode = jsCode.replace(/(?<=\W)onmessage(?=\W)/g, '_onmessage').trim();
				preCode += 'Math.seedrandom(\''+seed+'\');\ndelete Math.seedrandom;\nlet _onmessage=function(){}\nonmessage=(m)=>{_onmessage(m.data.workerData ? m.data.workerData : {type: m.data.type, data: m.data.message})};\nlet postMessage_native = globalThis.postMessage;\nlet postMessage=function(value,toRespond=1,toTerminate=2){postMessage_native({value: value, executionSteps: {toRespond, toTerminate}})};\npostMessage_native(null);\n';
			}
			if(header.dependencies.length){
				preCode += `importScripts('${header.dependencies.join('\', \'')}');\n`;
			}
			if(preCode){
				preCode = 'let __url=\''+url+'\';\nlet __mutators=[];\n'+preCode+'// 👇 ?'+url+' 👇\n';
				if(useStrict){
					preCode = '\'use strict\'\n' + preCode;
				}
			}
			let resolve;
			let promise = new Promise(_resolve => resolve = _resolve);
			let urlObject = createObjectURL(preCode+jsCode);
			let worker = new Worker(urlObject);
			worker.onmessage = ()=>{URL.revokeObjectURL(urlObject); resolve(worker);};
			return promise;
		});
	}
}
