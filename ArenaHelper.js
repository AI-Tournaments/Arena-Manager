'use strict'
class ArenaHelper{
	static #log = [];
	static #participants = null;
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
		postMessage({type: 'Done', message: {score: scores, teamColors: colors, settings: participants.getSettings(), log: this.#log}});
	}
	static postAbort = (participant='', error='')=>{
		this.#participants.terminateAllWorkers();
		let participantName = participant.name === undefined ? participant : participant.name;
		postMessage({type: 'Aborted', message: {participantName: participantName, error: error}});
	}
	static #onmessage = messageEvent=>{
		switch(messageEvent.data.type){
			default:
				debugger;
				break;
			case 'Start':
				ArenaHelper.Participants.onReadyCallback();
				break;
		}
		if(messageEvent.data === 'Start'){
			debugger;
			console.error('TODO: Change to messageEvent.data.type');
			ArenaHelper.Participants.onReadyCallback();
		}
	}
	static #onmessageerror = messageEvent=>{
		console.error(messageEvent);
		ArenaHelper.postAbort('Message-Error', error.data);
	}
	static Participants = class{
		static onReadyCallback;
		/** INPUT
		 *	Input is the same as input to the arena. Read about '?debug' to find out how to access it.
		 *	READ: https://github.com/AI-Tournaments/AI-Tournaments#develop-environment
		 */
		constructor(data={}, onReady=()=>{}, participantDropped=()=>{}){
			if(ArenaHelper.#participants !== null){
				throw new Error('Participants is already constructed.');
			}
			ArenaHelper.#setParticipants(this);
			onmessage = ArenaHelper.#onmessage;
			onmessageerror = ArenaHelper.#onmessageerror;
			function onMessageWatcher(){
				if(onmessage !== ArenaHelper.#onmessage || onmessageerror !== ArenaHelper.#onmessageerror){
					let message = 'onmessage is required by the ArenaHelper, do not reassign a callback to onmessage after arena initiation.';
					console.error(message);
					ArenaHelper.postAbort('OnMessage-Detached', message);
				}else{
					setTimeout(onMessageWatcher, 1000);
				}
			}
			onMessageWatcher();
			ArenaHelper.Participants.onReadyCallback = onReady;
			let terminated = false;
			let promises = [];
			let _teams = [];
			let wrappers = [];
			let ready = [];
			this.addWorker = (participant, name='') => {
				let team = _teams[participant.team];
				let participantWrapper = team.members[participant.member];
				let worker = participantWrapper.private.workers.find(workerWrapper => workerWrapper.name === name);
				if(worker !== undefined){
					throw new Error('Participant already has worker with name "'+name+'".');
				}
				let workerWrapper = {
					lastCalled: undefined,
					name: name,
					promiseWorkerReady: null
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
				postMessage({
					type: 'Add-Worker',
					message: {
						iframeId: 'team-'+participant.team+'_'+'member-'+participant.member,
						participant: [participant.team, participant.member],
						name: name,
						url: participantWrapper.private.url,
						workerData: team.precomputedWorkerData
					}
				});
				return new Promise(resolve => workerWrapper.promiseWorkerReady = resolve);
				/*//////////////// Old.
				return ArenaHelper.CreateWorkerFromRemoteURL(participantWrapper.private.url, true).then(worker => {
					participantWrapper.private.workers.push(workerWrapper);
					worker.onmessage = messageEvent => {
						console.error('Kill internet!');
						Promise.all(promises).then(() => {
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
							let workerData = JSON.parse(JSON.stringify(team.precomputedWorkerData));
							worker.postMessage(index, workerData);
						});
						worker.onmessage = messageEvent => {
							workerWrapper.lastCalled = undefined;
							workerReady();
							worker.onmessage = messageEvent => {
								workerWrapper.lastCalled = undefined;
								if(typeof participantWrapper.participant.onmessage === 'function'){
									participantWrapper.participant.onmessage(messageEvent, participantWrapper.participant, workerWrapper.name);
								}
							}
						}
					}
					worker.onerror = messageEvent => {
						if(typeof participantWrapper.participant.onerror === 'function'){
							participantWrapper.participant.onerror(messageEvent);
						}
					}
				x	if(participantWrapper.private.precomputedWorkerData !== undefined){
				x		let data = JSON.parse(JSON.stringify(team.precomputedWorkerData));
				x		data.name = name;
				x		data.precomputedWorkerData = participantWrapper.private.precomputedWorkerData;
				x		worker.postMessage(data);
				x	}
					worker.postMessage(null);
				});
				*/
			}
			this.killWorker = (participant, name)=>{
				let participantWrapper = _teams[participant.team].members[participant.member];
				let workers = participantWrapper.private.workers;
				let workerWrapper = workers.find(workerWrapper => workerWrapper.name === name);
				let index = workers.findIndex(w => w === workerWrapper);
				workers.splice(index, 1);
				workerWrapper.lastCalled = null;
				workerWrapper.worker.terminate();
			}
			this.postToAll = (message='') => {
				_teams.forEach((team,index) => {
					this.postToTeam(index, message);
				});
			}
			this.postToTeam = (team=-1, message='') => {
				_teams[team].members.forEach(participantWrapper => {
					participantWrapper.participant.postMessage(message);
				});
			}
			this.addCallbackToAll = (onmessage=(participant,messageEvent)=>{},onerror=(participant,messageEvent)=>{}) => {
				_teams.forEach((team,index) => {
					this.addCallbackToTeam(index, onmessage, onerror);
				});
			}
			this.addCallbackToTeam = (team=-1,onmessage=(participant,messageEvent)=>{},onerror=(participant,messageEvent)=>{}) => {
				_teams[team].members.forEach(participantWrapper => {
					if(typeof onmessage === 'function'){
						participantWrapper.participant.onmessage = messageEvent=>{onmessage(participantWrapper.participant, messageEvent)};
					}else if(onmessage === null){
						participantWrapper.participant.onmessage = onmessage;
					}
					if(typeof onerror === 'function'){
						participantWrapper.participant.onerror = messageEvent=>{onerror(participantWrapper.participant, messageEvent)};
					}else if(onerror === null){
						participantWrapper.participant.onerror = onerror;
					}
				});
			}
			this.get = (team=-1, participant=-1) => {
				return _teams[team].members[participant].participant;
			}
			this.getSettings = ()=>{
				return data.settings;
			}
			this.addScore = (team, score) => {
				_teams[team].score += score;
			}
			this.addBonusScore = (participant, score) => {
				_teams[participant.team].members[participant.member].private.score += score;
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
			data.participants.forEach((team, teamIndex) => {
				let members = [];
				_teams.push({score: 0, members: members, precomputedWorkerData: null});
				team.forEach((participant, participantIndex) => {
					let participantReady;
					ready.push(new Promise(resolve => participantReady = resolve));
					let _participantWrapper = {
						participant: {
							name: participant.name,
							team: teamIndex,
							member: participantIndex,
							payload: {},
							onmessage: null,
							onerror: null,
							postMessage: (data, workerName) => {
								let workerWrapper = workerName === undefined ? _participantWrapper.private.workers[0] : participantWrapper.private.workers.find(workerWrapper => workerWrapper.name === workerName);
								workerWrapper.lastCalled = new Date().getTime();
								workerWrapper.worker.postMessage(JSON.parse(JSON.stringify(data)));
							}
						},
						team: team,
						private: {
							url: participant.url,
							score: 0,
							workers: []
						}
					};
					members.push(_participantWrapper);
					wrappers.push(_participantWrapper);
					let promise = this.addWorker(_participantWrapper.participant, '');
					promise.then(participantReady);
					promises.push(promise);
				});
			});
			let _onError = error=>{
				ArenaHelper.postAbort('Did-Not-Start', error);
			}
			Promise.all(promises).then(() => {
				Promise.all(ready).then(()=>{
					postMessage({type: 'Ready-To-Start', message: null});
				}).catch(error => _onError(error));
			}).catch(error => _onError(error));
		}
	}
	static CreateWorkerFromRemoteURL(url='', useFetch=false){
		function createObjectURL(blob){
			let urlObject = URL.createObjectURL(blob);
			setTimeout(()=>{URL.revokeObjectURL(urlObject);},10000); // Worker does not work if urlObject is removed to early.
			return urlObject;
		}
		if(useFetch){
			async function asyncFetch(url){
				let worker = undefined;
				await fetch(url)
				.then(response => response.text())
				.then(text => {
					let blob;
					try{
						blob = new Blob([text], {type: 'application/javascript'});
					}catch(e){
						window.BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder;
						blob = new BlobBuilder();
						blob.append(text);
						blob = blob.getBlob();
					}
					worker = new Worker(createObjectURL(blob));
				});
				return worker;
			}
			return asyncFetch(url);
		}else{
			async function createWorker(){
				return new Worker(createObjectURL(new Blob(['importScripts("'+url+'");'], {type: 'application/javascript'})));
			}
			return new Promise(createWorker);
		}
	}
}
