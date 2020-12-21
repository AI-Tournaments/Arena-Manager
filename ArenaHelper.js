'use strict'
class ArenaHelper{
	static Participants = class{
		/** INPUT
		 *	Input is the same as input to the arena. Read about '?debug' to find out how to access it.
		 *	READ: https://github.com/AI-Tournaments/AI-Tournaments#develop-environment
		 */
		constructor(data={}, onReady=()=>{}, onError=()=>{}, participantDropped=()=>{}){
			let terminated = false;
			let promises = [];
			let _teams = [];
			let wrappers = [];
			data.participants.forEach(team => {
				let _team = [];
				_teams.push({score: 0, members: _team});
				team.forEach(participant => {
					let _participantWrapper = {};
					let _participant = {};
					_participantWrapper.private = {
						url: participant.url,
						score: 0,
						worker: null
					};
					_participantWrapper.private.score = 0;
					_participantWrapper.private.worker = null;
					_participantWrapper.participant = _participant;
					_participantWrapper.team = team;
					_team.push(_participantWrapper);
					wrappers.push(_participantWrapper);
					_participant.name = participant.name;
					_participant.payload = {};
					_participant.onmessage = null;
					_participant.onerror = null;
					promises.push(this.CreateWorkerFromRemoteURL(_participantWrapper.private.url, true).then(worker => {
						_participantWrapper.private.worker = worker;
						worker.onmessage = messageEvent => {
							_participantWrapper.private.lastCalled = undefined;
							if(typeof _participant.onmessage === 'function'){
								_participant.onmessage(messageEvent);
							}
						}
						worker.onerror = messageEvent => {
							if(typeof _participant.onerror === 'function'){
								_participant.onerror(messageEvent);
							}
						}
						_participant.postMessage = data => {
							_participantWrapper.private.lastCalled = new Date().getTime();
							worker.postMessage(data);
						}
					}));
				});
			});
			Promise.all(promises).then(() => {
				let opponents = [];
				_teams.forEach(team => {
					let names = [];
					opponents.push(names);
					team.members.forEach(wrapper => {
						let name = null;
						if(data.settings.general.displayOpponents === 'Yes'){
							name = wrapper.participant.name;
						}else if(data.settings.general.displayOpponents === 'AccountOnly'){
							name = wrapper.participant.name.split('/')[0];
						}
						names.push(name);
					});
				});
				_teams.forEach((team,index) => {
					let _opponents = JSON.parse(JSON.stringify(opponents));
					_opponents[index] = undefined;
					this.postToTeam(index, {settings: data.settings, opponents: _opponents});
				});
				executionWatcher(data.settings.general.timelimit_ms);
				onReady();
			}).catch(error => onError(error));
			function executionWatcher(executionLimit=1000){
				wrappers.forEach(wrapper => {
					let executionTimeViolation = wrapper.private.lastCalled === undefined ? false : executionLimit < new Date().getTime() - wrapper.private.lastCalled;
					if(wrapper.private.lastCalled === null || executionTimeViolation){
						wrapper.team.splice(wrapper.team.indexOf(wrapper), 1);
						if(executionTimeViolation){
							wrapper.private.worker.terminate();
							participantDropped(wrapper.participant.name, 'Execution time violation.');
						}
					}
				});
				if(!terminated){
					setTimeout(executionWatcher, executionLimit, executionLimit);
				}
			}
			this.postToAll = (message='') => {
				_teams.forEach((team,index) => {
					postToTeam(index, message);
				});
			}
			this.postToTeam = (team=-1, message='') => {
				_teams[team].members.forEach(wrapper => {
					wrapper.participant.postMessage(message);
				});
			}
			this.addCallbackToAll = (onmessage=(participant,messageEvent)=>{},onerror=(participant,messageEvent)=>{}) => {
				_teams.forEach((team,index) => {
					addCallbackToTeam(index, onmessage, onerror);
				});
			}
			this.addCallbackToTeam = (team=-1,onmessage=(participant,messageEvent)=>{},onerror=(participant,messageEvent)=>{}) => {
				_teams[team].members.forEach(wrapper => {
					if(typeof onmessage === 'function'){
						wrapper.onmessage = messageEvent=>{onmessage(wrapper, messageEvent)};
					}else if(onmessage === null){
						wrapper.onmessage = onmessage;
					}
					if(typeof onerror === 'function'){
						wrapper.onerror = messageEvent=>{onerror(wrapper, messageEvent)};
					}else if(onerror === null){
						wrapper.onerror = onerror;
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
			/*this.addBonusScore = (participant, score) => {
				_teams.forEach(team => {
					team.members.forEach(_participant => {
						if(participant === _participant.participant){
							_participant.private.score += score;
						}
					});
				});
			}*/
			this.getScores = () => {
				let scores = [];
				_teams.forEach(team => {
					let result = {};
					scores.push(result);
					result.score = team.score;
					result.members = [];
					team.members.forEach(wrapper => {
						let member = {};
						result.members.push(member);
						member.name = wrapper.participant.name;
						member.bonus = wrapper.private.score;
					});
				});
				return scores;
			}
			this.getTeamColor = index => {
				let color = {};
				let hue = Double(index)/Double(_teams.length);
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
			this.terminate = () => {
				terminated = true;
				wrappers.forEach(wrapper => {
					wrapper.private.lastCalled = null;
					wrapper.private.worker.terminate();
				});
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
			return new Worker(createObjectURL(new Blob(['importScripts("'+url+'");'], {type: 'application/javascript'})), options);
		}
	}
}