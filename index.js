'use strict'
let addArena;
let addParticipant;
function a(){
	let _sortByStars = false;
	let _json;
	let _replayContainer;
	let _parentWindow = null;
	let localArenas = {};
	let localParticipants = null
	let arenaProperties;
	let arenaMatches = null;
	let selectArena = document.getElementById('selectArena');
	let settingsIframe = document.getElementById('settings');
	let logContainer = document.getElementById('logContainer');
	let btnAddTeam = document.getElementById('add-team');
	let participantGroups = document.getElementById('participant-groups');
	requestAnimationFrame(()=>{
		let item = localStorage.getItem('Local arena development');
		if(item !== null){
			addArena(...JSON.parse(item));
		}
	});
	btnAddTeam.onclick = createTeam;
	let btnStart = document.getElementById('btnStart');
	btnStart.onclick = start;
	let pendingArenaSandboxes = [];
	let arenaListReady;
	let arenaListReadyPromise = new Promise(resolve => arenaListReady = resolve);
	let availableParticipantsWrapper = document.createElement('div');
	let availableParticipants_btn = document.createElement('input');
	availableParticipants_btn.type = 'button';
	availableParticipants_btn.id = 'transfer';
	availableParticipants_btn.onclick = transferToTeam;
	availableParticipants_btn.dataset.select = 'participants-selectable';
	availableParticipants_btn.value = 'Transfer here';
	availableParticipantsWrapper.appendChild(availableParticipants_btn);
	let availableParticipants_label = document.createElement('label');
	availableParticipants_label.for = 'participants-selectable';
	availableParticipants_label.innerHTML = 'Available participants';
	availableParticipantsWrapper.appendChild(availableParticipants_label);
	let availableParticipants_select = document.createElement('select');
	availableParticipants_select.id = 'participants-selectable';
	availableParticipants_select.classList.add('participants');
	availableParticipants_select.multiple = true;
	availableParticipantsWrapper.appendChild(availableParticipants_select);
	participantGroups.appendChild(availableParticipantsWrapper);
	window.onhashchange = ()=>selectArena.contentWindow.postMessage({type: 'get-arenas', value: location.hash.substring(1)});
	window.onhashchange();
	window.onmessage = messageEvent => {
		if(messageEvent.data.type === 'Replay-Height'){
			_replayContainer.style.height = parseFloat(messageEvent.data.value) + 'px';
		}else if(messageEvent.data.type === 'auto-run'){
			_json = messageEvent.data.arena;
			document.title = messageEvent.data.type;
			begin(messageEvent.data.settings, messageEvent.data.bracket);
			getTournamentLog(messageEvent);
		}else if(messageEvent.data.type === 'arena-changed'){
			if(document.title !== 'auto-run'){
				document.getElementById('wrapper').classList.remove('hidden');
				_sortByStars = messageEvent.data.value.settings.sortByStars;
				selectArena.style.height = messageEvent.data.value.settings.height + 'px';
				_json = messageEvent.data.value.option;
				btnAddTeam.disabled = true;
				Array.from(document.getElementsByClassName('participant-team-container')).forEach(element => {
					element.parentNode.removeChild(element);
				});
				document.title = _json.name + ' Arena';
				settingsIframe.contentWindow.postMessage({type: 'SetArena', value: _json.raw_url}, '*');
				getParticipants(_json.full_name);
				if(_parentWindow !== null){
					_parentWindow.postMessage({type: 'arena-changed', value: _json.full_name}, '*');
				}
			}
		}else if(pendingArenaSandboxes.includes(messageEvent.source)){
			writeArenaLog(messageEvent);
		}else if(messageEvent.data.type === 'SetParent'){
			_parentWindow = messageEvent.source;
		}else if(settingsIframe.contentWindow === messageEvent.source){
			switch(messageEvent.data.type){
				case 'properties':
					arenaProperties = messageEvent.data.value.properties;
					for(let i = 0; i < Math.max(1, arenaProperties.header.limits.teams.min); i++){
						createTeam();
					}
					if(localParticipants !== null){
						localParticipants.reverse().forEach((participant, index) => {
							if(typeof participant === 'object'){
								let option = addParticipant(participant[0], participant[1]);
								let select = document.getElementById('participant-team-' + participant[2]);
								if(select){
									select.add(option);
								}
							}else{
								addParticipant(participant, 'Manually added participant '+(index+1));
							}
						});
						localParticipants = null;
						btnStart.disabled = !validateStart();
					}
					break;
				case 'settings': begin(messageEvent.data.value); break;
				case 'size-changed': settingsIframe.style.height = messageEvent.data.value.height + 'px'; break;
			}
		}else{
			console.error('Source element not defined!');
			console.error(messageEvent.source.frameElement);
		}
	}
	addArena = (url='', name='', replayURL='', ...participants) => {
		if(url === ''){return;}
		if(typeof url === 'string'){
			url = {arena: url, includeScripts: {arena: [], participants: []}};
		}
		if(name === ''){
			name = url.arena;
		}
		localArenas[url.arena] = replayURL;
		let json = {
			name: name,
			raw_url: url.arena,
			html_url: url.arena,
			full_name: 'local/'+name,
			default_branch: null,
			stars: -1,
			commit: null,
			version: null,
			includeScripts: url.includeScripts
		};
		arenaListReadyPromise.then(()=>{
			localParticipants = participants;
			selectArena.contentWindow.postMessage({type: 'add-arena', value: json});
		});
	}
	addParticipant = (url='', name='Manually added participant') => {
		let option = addParticipantOption(url, name);
		option.classList.add('local');
		sortOptions(availableParticipants_select);
		return option;
	}
	function getTournamentLog(messageEvent){
		if(pendingArenaSandboxes.length === 0){
			let dataset = [];
			for(const key in arenaMatches){
				if(Object.hasOwnProperty.call(arenaMatches, key)){
					const arenaMatch = arenaMatches[key];
					debugger;
					console.log(arenaMatch);
				}
			}
			messageEvent.source.postMessage({type: 'log', value: {id: messageEvent.data.id, log: dataset}}, messageEvent.origin);
		}else{
			setTimeout(()=>{getTournamentLog(messageEvent)}, 1000);
		}
	}
	function writeArenaLog(messageEvent){
		let iframe = document.getElementById(messageEvent.data.iframeID);
		let arenaMatch = arenaMatches[iframe];
		if(arenaMatch === undefined){
			arenaMatch = [];
			arenaMatches[iframe] = arenaMatch;
		}
		if(messageEvent.origin === 'null'){
			iframe.parentElement.removeChild(iframe);
			let defaultReplay = localArenas[_json.raw_url];
			let replayData = {
				header: {
					defaultReplay: defaultReplay
				},
				body: messageEvent.data.value
			};
			pendingArenaSandboxes.splice(pendingArenaSandboxes.indexOf(messageEvent.source), 1);
			Array.from(document.getElementsByClassName('replay-container')).forEach(element => {
				element.parentNode.removeChild(element);
			});
			if(!document.title.startsWith('auto-run')){
				_replayContainer = document.createElement('iframe');
				_replayContainer.classList.add('replay-container');
				_replayContainer.src = '../Replay/';
				document.body.appendChild(_replayContainer);
				setTimeout(()=>{
					_replayContainer.contentWindow.postMessage({type: 'Init-Fetch-Replay-Height'}, '*');
					_replayContainer.contentWindow.postMessage({type: 'Replay-Data', replayData: JSON.stringify(replayData)}, '*');
				}, 1000);
			}
		}
	}
	function sortOptions(selectElement){
		function value(option){
			return _sortByStars ? option.dataset.stars : option.value;
		}
		let options = [...selectElement.options];
		options.sort(function(a, b){
			if(a.classList.contains('local') && b.classList.contains('local')){
				if(value(a) < value(b)){return -1;}
				if(value(b) < value(a)){return 1;}
			}else{
			if(a.classList.contains('local') ? true : value(a) < value(b)){return -1;}
			if(b.classList.contains('local') ? true : value(b) < value(a)){return 1;}
			}
			return 0;
		});
		for(let option of options){
			selectElement.add(option);
		}
	}
	function validateTeamsMax(){
		let selectElements = document.getElementsByClassName('participant-team');
		return selectElements.length <= arenaProperties.header.limits.teams.max;
	}
	function validateTeamsMin(){
		let selectElements = document.getElementsByClassName('participant-team');
		return arenaProperties.header.limits.teams.min <= selectElements.length;
	}
	function validateTeams(){
		return validateTeamsMin() && validateTeamsMax();
	}
	function validateStart(){
		let selectElements = document.getElementsByClassName('participant-team');
		let allValid = validateTeams();
		let total = 0;
		for(const selectElement of selectElements){
			total += selectElement.length;
			allValid &= arenaProperties.header.limits.participantsPerTeam.min <= selectElement.length && selectElement.length <= arenaProperties.header.limits.participantsPerTeam.max;
		}
		allValid &= arenaProperties.header.limits.participants.min <= total && total <= arenaProperties.header.limits.participants.max;
		return allValid;
	}
	function transferToTeam(event){
		let selectElement_moveTo = document.getElementById(event.target.dataset.select);
		let selectElements = document.getElementsByClassName('participants');
		for(const selectElement of selectElements){
			for(let option of [...selectElement.selectedOptions]){
				selectElement_moveTo.add(option);
				option.selected = false;
			}
		}
		btnStart.disabled = !validateStart();
		sortOptions(selectElement_moveTo);
	}
	function getParticipants(arenaFullName=''){
		let arena = arenaFullName.replace('/','--');
		let arenaReplace = 'AI-Tournaments-Participant-'+arena.replace(/AI-Tournaments--|-Arena/g, '')+'-';
		Array.from(document.getElementsByClassName('participants')).forEach(selectElement => {
			while(0 < selectElement.length){
				selectElement.remove(0);
			}
		});
		if(localParticipants === null){
			let promises = [];
			GitHubApi.fetch('search/repositories?q=topic:AI-Tournaments+topic:AI-Tournaments-Participant+topic:'+arena,{
				headers: {Accept: 'application/vnd.github.mercy-preview+json'} // TEMP: Remove when out of preview. https://docs.github.com/en/rest/reference/search#search-topics-preview-notices
			}).then(response => response.json()).then(response => {
				response.items.forEach(repo => {
					if(!repo.topics.includes('ai-tournaments-retired')){
						promises.push(GitHubApi.fetch('repos/' + repo.full_name + '/git/trees/' + repo.default_branch)
						.then(response => response.json())
						.then(data => {
							data.tree.forEach(file =>{
								if(file.type === 'blob' && file.path === 'participant.js'){
									let url = 'https://raw.githubusercontent.com/' + repo.full_name + '/' + repo.default_branch + '/' + file.path;
									let name = repo.full_name.replace(arenaReplace,'');
									addParticipantOption(url, name);
								}
							});
						})
						.catch(error => {
							console.error(error);
						}));
					}
				});
				Promise.all(promises).then(() => {
					sortOptions(availableParticipants_select);
					arenaListReady();
				})
			});
		}
	}
	function addParticipantOption(url, name){
		let option = document.createElement('option');
		option.dataset.raw_url = url;
		option.dataset.name = name;
		option.innerHTML = option.dataset.name;
		availableParticipants_select.appendChild(option);
		return option;
	}
	function createTeam(){
		let teamIndex = document.getElementsByClassName('participant-team-container').length + 1;
		btnAddTeam.disabled = !validateTeamsMax();
		let teamID = 'participant-team-' + teamIndex;
		let participantTeam = document.createElement('div');
		participantTeam.classList.add('participant-team-container');
		let input = document.createElement('input');
		participantTeam.appendChild(input);
		let label = document.createElement('label');
		participantTeam.appendChild(label);
		let select = document.createElement('select');
		participantTeam.appendChild(select);
		input.type = 'button';
		input.dataset.select = teamID;
		input.value = availableParticipants_btn.value;
		input.onclick = transferToTeam;
		label.htmlFor = teamID;
		label.innerHTML = 'Team ' + teamIndex;
		select.id = teamID;
		select.classList.add('participants');
		select.classList.add('participant-team');
		select.multiple = true;
		participantGroups.appendChild(participantTeam);
	}
	function start(){
		while(0 < logContainer.childElementCount){
			logContainer.removeChild(logContainer.firstChild);
		}
		arenaMatches = {};
		settingsIframe.contentWindow.postMessage({type: 'GetSettings'}, '*');
	}
	function begin(settings, bracket=[]){
		let json = {
			arena: _json,
			urls: {
				ArenaHelper: location.origin+location.pathname.replace(/[^\/]*$/,'')+'ArenaHelper.js',
				ParticipantHelper: location.origin+location.pathname.replace(/[^\/]*$/,'')+'ParticipantHelper.js',
				randomseed: 'https://cdnjs.cloudflare.com/ajax/libs/seedrandom/3.0.5/seedrandom.min.js'
			},
			iframeID: Date()+'_'+Math.random(),
			participants: bracket,
			settings: settings
		};
		if(0 === json.participants.length){
			for(const select of document.getElementsByClassName('participants')){
				if(select.id !== 'participants-selectable'){
					let team = [];
					json.participants.push(team);
					for(const option of select.options){
						team.push({
							name: option.dataset.name,
							url: option.dataset.raw_url
						});
					}
				}
			}
		}
		let isDebugMode = location.href.includes('?debug');
		let div = document.createElement('div');
		logContainer.appendChild(div);
		let iframe = document.createElement('iframe');
		iframe.src = 'iframe.sandbox.arena.html'+(isDebugMode?'?debug':'');
		iframe.sandbox = 'allow-scripts';
		iframe.style.display = 'none';
		iframe.id = json.iframeID;
		div.appendChild(iframe);
		let output = document.createElement('div');
		if(!isDebugMode){
			output.style.display = 'none';
		}
		output.classList.add('log');
		div.appendChild(output);
		pendingArenaSandboxes.push(iframe.contentWindow);
		setTimeout(()=>iframe.contentWindow.postMessage(json, '*'), 1000);
	}
}
