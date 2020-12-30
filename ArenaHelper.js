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
	static Participants = class{
		/** INPUT
		 *	Input is the same as input to the arena. Read about '?debug' to find out how to access it.
		 *	READ: https://github.com/AI-Tournaments/AI-Tournaments#develop-environment
		 */
		constructor(data={}, onReady=()=>{}, onError=()=>{}, participantDropped=()=>{}){
			if(ArenaHelper.#participants !== null){
				throw new Error('Participants is already constructed.');
			}
			ArenaHelper.#setParticipants(this);
			let terminated = false;
			let promises = [];
			let _teams = [];
			let wrappers = [];
			let ready = [];
			this.addWorker = (participant, name='', workerReady=()=>{}) => {
				let participantWrapper = _teams[participant.team].members[participant.member];
				if(undefined !== participantWrapper.private.workers.find(workerWrapper => workerWrapper.name === name)){
					throw new Error('Participant already has worker with name "'+name+'".');
				}
				return ArenaHelper.CreateWorkerFromRemoteURL(participantWrapper.private.url, true).then(worker => {
					let workerWrapper = {
						lastCalled: undefined,
						worker: worker,
						name: name
					};
					participantWrapper.private.workers.push(workerWrapper);
					worker.onmessage = messageEvent => {
						if(participantWrapper.private.precomputedWorkerData === undefined){
							participantWrapper.private.precomputedWorkerData = messageEvent.data;
						}
						workerWrapper.lastCalled = undefined;
						workerReady();
						worker.onmessage = messageEvent => {
							workerWrapper.lastCalled = undefined;
							if(typeof participantWrapper.participant.onmessage === 'function'){
								participantWrapper.participant.onmessage(messageEvent, participantWrapper.participant, workerWrapper.name);
							}
						}
					}
					worker.onerror = messageEvent => {
						if(typeof participantWrapper.participant.onerror === 'function'){
							participantWrapper.participant.onerror(messageEvent);
						}
					}
					if(participantWrapper.private.precomputedWorkerData !== undefined){
						let data = JSON.parse(JSON.stringify(team.precomputedWorkerData));
						data.name = name;
						data.precomputedWorkerData = participantWrapper.private.precomputedWorkerData;
						worker.postMessage(data);
					}
				});
			}
			this.killWorker = (participant, name)=>{
				let participantWrapper = _teams[participant.team].members[participant.member];
				let workerWrapper = participantWrapper.private.workers.find(workerWrapper => workerWrapper.name === name);
				let index = participantWrapper.private.workers.findIndex(w => w === workerWrapper);
				worms.splice(index, 1);
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
					let result = {};
					scores.push(result);
					result.score = team.score;
					result.members = [];
					team.members.forEach(participantWrapper => {
						let member = {};
						result.members.push(member);
						member.name = participantWrapper.participant.name;
						member.bonus = participantWrapper.private.score;
					});
				});
				return scores;
			}
			this.getTeamColor = indexOrParticipant => {
				let index = typeof indexOrParticipant === 'object' ? indexOrParticipant.team : indexOrParticipant;
				let color = {};
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
				color.R = hue2rgb(_p, _q, hue + 1/3.0)*255;
				color.G = hue2rgb(_p, _q, hue)*255;
				color.B = hue2rgb(_p, _q, hue - 1/3.0)*255;
				return color;
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
				let _team = [];
				_teams.push({score: 0, members: _team});
				team.forEach((participant, participantIndex) => {
					let participantReady;
					ready.push(new Promise(resolve => participantReady = resolve));
					let _participantWrapper = {};
					let _participant = {};
					_participantWrapper.private = {
						url: participant.url,
						score: 0,
						workers: [],
						precomputedWorkerData: undefined
					};
					_participantWrapper.participant = _participant;
					_participantWrapper.team = team;
					_team.push(_participantWrapper);
					wrappers.push(_participantWrapper);
					_participant.name = participant.name;
					_participant.team = teamIndex;
					_participant.member = participantIndex;
					_participant.payload = {};
					_participant.onmessage = null;
					_participant.onerror = null;
					_participant.postMessage = (data, workerName) => {
						let workerWrapper = workerName === undefined ? _participantWrapper.private.workers[0] : participantWrapper.private.workers.find(workerWrapper => workerWrapper.name === workerName);
						workerWrapper.lastCalled = new Date().getTime();
						workerWrapper.worker.postMessage(JSON.parse(JSON.stringify(data)));
					}
					promises.push(this.addWorker(_participant, 'main', participantReady));
				});
			});
			Promise.all(promises).then(() => {
				let opponents = [];
				_teams.forEach(team => {
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
				});
				_teams.forEach((team,index) => {
					let _opponents = JSON.parse(JSON.stringify(opponents));
					_opponents[index] = undefined;
					team.precomputedWorkerData = {
						settings: data.settings,
						opponents: _opponents
					};
					let workerData = JSON.parse(JSON.stringify(team.precomputedWorkerData));
					workerData.name = 'main';
					this.postToTeam(index, workerData);
				});
				executionWatcher(data.settings.general.timelimit_ms);
				Promise.all(ready).then(onReady).catch(error => onError(error));
			}).catch(error => onError(error));
			function executionWatcher(executionLimit=1000){
				wrappers.forEach(participantWrapper => {
					participantWrapper.private.workers.forEach(workerWrapper => {
						let executionTimeViolation = workerWrapper.lastCalled === undefined ? false : executionLimit < new Date().getTime() - workerWrapper.lastCalled;
						if(workerWrapper.lastCalled === null || executionTimeViolation){
							participantWrapper.team.splice(participantWrapper.team.indexOf(participantWrapper), 1);
							if(executionTimeViolation){
								workerWrapper.worker.terminate();
								participantDropped(participantWrapper.participant, 'Execution time violation.', workerWrapper.name);
							}
						}
					});
				});
				if(!terminated){
					setTimeout(executionWatcher, executionLimit, executionLimit);
				}
			}
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
