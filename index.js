'use strict'
function a(){
	const EXTERNAL_RESOURCES = (()=>{
		let version = {
			'{engine262}': 'ad1b2d2e4fd5024a05313e740f084a46acf20564',
			'{seedrandom}': '3.0.5'
		};
		let resources = {
			engine262: 'https://raw.githubusercontent.com/engine262/engine262/{engine262}/engine262.js',
			seedrandom: 'https://cdnjs.cloudflare.com/ajax/libs/seedrandom/{seedrandom}/seedrandom.min.js'
		}
		for(const resourceKey in resources){
			if(Object.hasOwnProperty.call(resources, resourceKey)){
				for(const versionKey in version){
					if(Object.hasOwnProperty.call(version, versionKey)){
						resources[resourceKey] = resources[resourceKey].replace(versionKey, version[versionKey]);
					}
				}
			}
		}
		Object.freeze(resources);
		return resources;
	})();
	let styleMode = window.self == window.top ? 'top' : 'iFrame';
	document.documentElement.classList.add(styleMode);
	let _sortByStars = false;
	let _json;
	let _replayContainer;
	let _parentWindow = null;
	let _settingsOverride = null;
	let _replayData = null;
	let _rerunUntilErrorCounter = 0;
	let localArenas = {};
	let localParticipants = null
	let arenaProperties;
	let arenaMatches = null;
	let selectArena = document.getElementById('selectArena');
	let settingsIframe = document.getElementById('settings');
	let iframeWrapper = document.getElementById('iframeWrapper');
	let btnAddTeam = document.getElementById('add-team');
	let btnRemoveTeam = document.getElementById('remove-team');
	let participantGroups = document.getElementById('participant-groups');
	let arenaReadme = document.getElementById('arena-readme');
	let arenaReadmeFieldset = document.getElementById('fieldset-arena-readme');
	arenaReadmeFieldset.getElementsByTagName('legend')[0].addEventListener('click', ()=>{
		arenaReadmeFieldset.classList.toggle('hidden');
		arenaReadme.style.height = arenaReadme.contentWindow.window.document.documentElement.scrollHeight + 'px';
	});
	btnAddTeam.onclick = createTeam;
	btnRemoveTeam.onclick = removeTeam;
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
	addArena(getLocalDevelopment() ?? {});
	window.onhashchange = ()=>{
		let hash = location.hash;
		while(1 < hash.length && hash[1] === '#'){
			hash = hash.substring(2);
		}
		selectArena.contentWindow.postMessage({
			type: 'get-arenas',
			value: {
				preSelectedArena: hash.substring(1)
			}
		});
	};
	window.onhashchange();
	window.onmessage = messageEvent => {
		if(messageEvent.data.type === 'Replay-Initiated'){
			_replayContainer.contentWindow.postMessage({type: 'Replay-Data', replayData: JSON.stringify(_replayData)}, '*');
		}else if(messageEvent.data.type === 'Settings-Initiated'){
			settingsIframe.contentWindow.postMessage({type: 'MatchParentStyle', value: styleMode}, '*');
		}else if(messageEvent.data.type === 'Sandbox-Arena-Initiated'){
			let pendingArenaSandbox = pendingArenaSandboxes.find(s => s.contentWindow === messageEvent.source);
			if(pendingArenaSandbox){
				pendingArenaSandbox.ready();
			}
		}else if(messageEvent.data.type === 'Replay-Height'){
			_replayContainer.style.height = parseFloat(messageEvent.data.value) + 'px';
			document.documentElement.scrollTop = document.documentElement.scrollHeight;
		}else if(messageEvent.data.type === 'auto-run'){
			debugger // Is this used for anything else then client side tournament?
			_json = messageEvent.data.arena;
			document.title = messageEvent.data.type;
			begin(messageEvent.data.settings, messageEvent.data.bracket);
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
				settingsIframe.contentWindow.postMessage({type: 'SetArena', value: _json.raw_url, settingsOverride: _settingsOverride}, '*');
				getParticipants(_json.full_name);
				arenaReadme.srcdoc = '';
				arenaReadmeFieldset.classList.add('hidden');
				fetch((_json.default ?? _json.raw_url)+'README.md').then(response => response.ok?response.text():null).then(readme => {
					if(readme){
						GitHubApi.formatMarkdown(readme, {async: true, removeBodyMargin: true}).then(iframe => arenaReadme.srcdoc = iframe.srcdoc);
					}
				});
				if(_parentWindow){
					_parentWindow.postMessage({type: 'arena-changed', value: _json.full_name}, '*');
				}
			}
		}else if(pendingArenaSandboxes.findIndex(s => s.contentWindow === messageEvent.source) !== -1){
			openReplay(messageEvent);
		}else if(messageEvent.data.type === 'SetParent'){
			_parentWindow = messageEvent.source;
			window.onresize = ()=>{
				_parentWindow.postMessage({type: 'resize', value: {height: document.documentElement.clientHeight}}, '*');
			}
		}else if(settingsIframe.contentWindow === messageEvent.source){
			switch(messageEvent.data.type){
				case 'properties':
					arenaProperties = messageEvent.data.value.properties;
					for(let i = 0; i < Math.max(1, arenaProperties.header.limits.teams.min); i++){
						createTeam();
					}
					if(localParticipants){
						let teams = localParticipants.filter(p => 0 <= p.team);
						teams = 0 < teams.length ? teams.sort(p => -p.team)[0].team : 0;
						while(document.getElementsByClassName('participant-team-container').length < teams){
							createTeam();
						}
						localParticipants.forEach((participant, index) => {
							if(typeof participant === 'object'){
								let fallbackName = 'Manually added '+(index+1)+ ' ('+(participant.url[0]==='!'?'interface':'participant')+')';
								let option = addParticipant(participant.url, participant.name ?? fallbackName);
								let select = document.getElementById('participant-team-' + participant.team);
								if(select){
									select.add(option);
								}
							}else{
								addParticipant(participant, 'Manually added '+(index+1)+ ' ('+(participant[0]==='!'?'interface':'participant')+')');
							}
						});
						localParticipants = null;
						btnStart.disabled = !validateStart();
						try{
							let setup = getLocalDevelopment();
							if(setup && setup.autoStart){
								start();
							}
						}catch(error){}
					}
					break;
				case 'settings': begin(messageEvent.data.value); break;
				case 'size-changed': settingsIframe.style.height = messageEvent.data.value.height + 'px'; break;
			}
		}else{
			console.error('Source element not defined', messageEvent.source.frameElement);
		}
		if(window.onresize){
			window.onresize();
		}
	}
	function addArena(localDevelopment){
		if(localDevelopment.arena){
			if(!localDevelopment.arena.name){
				localDevelopment.arena.name = localDevelopment.arena.url;
			}
			localArenas[localDevelopment.arena.url] = localDevelopment.arena.replay;
			let arena = {
				name: localDevelopment.arena.name,
				raw_url: localDevelopment.arena.url,
				html_url: localDevelopment.arena.url,
				full_name: 'local/'+localDevelopment.arena.name,
				default_branch: null,
				stars: -1,
				commit: null,
				version: null
			};
			_settingsOverride = {arena: arena.raw_url, settings: localDevelopment.arena.settings};
			arenaListReadyPromise.then(()=>{
				localParticipants = localDevelopment.participants;
				selectArena.contentWindow.postMessage({type: 'add-arena', value: arena});
			});
		}else{
			localParticipants = localDevelopment.participants;
		}
	}
	function addParticipant(url='', name='Manually added participant'){
		let option = addParticipantOption(url, name);
		option.classList.add('local');
		sortOptions(availableParticipants_select);
		return option;
	}
	function getLocalDevelopment(){
		try{
			return JSON.parse(localStorage.getItem('LocalDevelopment.Setups')).find(setup => setup.active);
		}catch(error){}
	}
	function isLocalDevelopment(){
		return !!getLocalDevelopment();
	}
	function strip(html=''){
		let output;
		let tempString;
		do{
			tempString = output;
			let element = document.createElement('div');
			element.innerHTML = html;
			output = element.textContent || element.innerText || '';
		}
		while(tempString !== output && output !== '');
		return output;
	}
	function openReplay(messageEvent){
		let iframe = document.getElementById(messageEvent.data.iframeID);
		let arenaMatch = arenaMatches[iframe];
		if(!arenaMatch){
			arenaMatch = [];
			arenaMatches[iframe] = arenaMatch;
		}
		iframe.parentElement.removeChild(iframe);
		let containsErrors = !!messageEvent.data.value.matchLogs.filter(matchLog => matchLog.error).length;
		let setup = getLocalDevelopment() ?? {};
		if(setup.rerunUntilError){
			_rerunUntilErrorCounter++;
			console.log('Rerun counter', _rerunUntilErrorCounter);
		}
		if(setup.rerunUntilError && !containsErrors){
			start();
		}else{
			if(setup.rerunUntilError){
				messageEvent.data.value.matchLogs.filter(matchLog => matchLog.error).forEach(matchLog => matchLog.error+=' (Rerun counter: '+_rerunUntilErrorCounter+')');
				console.debug('Rerun testing crash', {'Rerun counter': _rerunUntilErrorCounter, 'Crash settings': messageEvent.data.value.settings});
				_rerunUntilErrorCounter = 0;
			}
			if(containsErrors && isLocalDevelopment()){
				console.table(messageEvent.data.value.matchLogs.map((matchLog, index) => {return {Origin: matchLog.participantName, Error: matchLog.error, Seed: matchLog.seed, Match: index, Log: matchLog.log}}).filter(r => r.Error));
			}
			_replayData = {
				header: {
					id: {
						salt_: Math.random(),
						timestamp: JSON.parse(JSON.stringify(new Date()))
					},
					meta: {
						host: document.location.host
					},
					defaultReplay: localArenas[_json.raw_url] ?? messageEvent.data.defaultReplay
				},
				body: messageEvent.data.value
			};
			pendingArenaSandboxes.splice(pendingArenaSandboxes.findIndex(s => s.contentWindow === messageEvent.source), 1);
			Array.from(document.getElementsByClassName('replay-container')).forEach(element => {
				element.parentNode.removeChild(element);
			});
			if(!document.title.startsWith('auto-run')){
				_replayContainer = document.createElement('iframe');
				_replayContainer.classList.add('replay-container');
				_replayContainer.src = '/Replay/';
				document.body.appendChild(_replayContainer);
			}
		}
	}
	function sortOptions(selectElement){
		function value(option){
			return _sortByStars ? option.dataset.stars : option.value;
		}
		function addToGroup(option, group){
			[...selectElement.getElementsByTagName('optgroup')].forEach(optgroup => {
				if(optgroup.label === group){
					optgroup.appendChild(option);
				}
			});
		}
		let options = [...selectElement.options];
		while(0 < selectElement.length){
			selectElement.remove(0);
		}
		['Yours', 'Locals', 'Following', 'Followers'].forEach(name => {
			let optgroup = document.createElement('optgroup')
			optgroup.label = name;
			selectElement.add(optgroup);
		});
		options.sort((a, b) => value(a)-value(b));
		for(let option of options){
			let owner = '';
			if(option.dataset.name.includes('/')){
				owner = option.dataset.name.replace(/\/(.*)/, '');
			}
			let sessionStorage = GitHubApi.getSessionStorage();
			if(owner === sessionStorage.username){
				addToGroup(option, 'Yours');
			}else if(option.classList.contains('local')){
				addToGroup(option, 'Locals');
			}else if(sessionStorage.following.includes(owner)){
				addToGroup(option, 'Following');
			}else if(sessionStorage.followers.includes(owner)){
				addToGroup(option, 'Followers');
			}else{
				selectElement.add(option);
			}
		}
		['Yours', 'Locals', 'Following', 'Followers'].forEach(name => {
			[...selectElement.getElementsByTagName('optgroup')].forEach(optgroup => {
				if(optgroup.label === name){
					if(!optgroup.childElementCount){
						optgroup.parentNode.removeChild(optgroup);
					}
				}
			});
		});
	}
	function validateTeamsMax(){
		let selectElements = document.getElementsByClassName('participant-team');
		let max = arenaProperties.header.limits.teams.max;
		btnAddTeam.disabled = max <= selectElements.length;
		return selectElements.length <= max;
	}
	function validateTeamsMin(){
		let selectElements = document.getElementsByClassName('participant-team');
		let min = selectElements.length < arenaProperties.header.limits.teams.min;
		btnRemoveTeam.disabled = selectElements.length < min;
		return min <= selectElements.length;
	}
	function validateTeams(){
		return validateTeamsMin() && validateTeamsMax();
	}
	function validateStart(){
		let limits = arenaProperties.header.limits;
		let selectElements = document.getElementsByClassName('participant-team');
		let allValid = validateTeams();
		let total = 0;
		for(const selectElement of selectElements){
			total += selectElement.length;
			let participantsPerTeam = limits.participantsPerTeam;
			allValid &= (participantsPerTeam.min) <= selectElement.length && selectElement.length <= (participantsPerTeam.max);
		}
		let participants = limits.participants;
		allValid &= participants.min <= total && total <= participants.max;
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
		if(!localParticipants || !_settingsOverride){
			GitHubApi.fetch('search/repositories?q=topic:AI-Tournaments+topic:AI-Tournaments-Participant+topic:'+arena).then(response => response.json()).then(response => {
				let promises = [];
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
				Promise.allSettled(promises).then(() => {
					sortOptions(availableParticipants_select);
					arenaListReady();
				})
			});
		}
	}
	function addParticipantOption(url, name){
		let option = document.createElement('option');
		option.dataset.raw_url = url;
		option.dataset.name = strip(name).trim();
		option.innerHTML = option.dataset.name;
		availableParticipants_select.appendChild(option);
		return option;
	}
	function createTeam(){
		let teamIndex = document.getElementsByClassName('participant-team-container').length + 1;
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
		validateTeams();
	}
	function removeTeam(){
		let teams = document.getElementsByClassName('participant-team-container');
		let team = teams[teams.length-1];
		for(let option of [...team.getElementsByClassName('participant-team')[0].options]){
			availableParticipants_select.add(option);
			option.selected = false;
		}
		team.parentNode.removeChild(team);
		sortOptions(availableParticipants_select);
		validateTeams();
	}
	function start(){
		while(0 < iframeWrapper.childElementCount){
			iframeWrapper.removeChild(iframeWrapper.firstChild);
		}
		arenaMatches = {};
		settingsIframe.contentWindow.postMessage({type: 'GetSettings'}, '*');
	}
	function begin(data, bracket=[]){
		let json = {
			arena: _json,
			properties: arenaProperties,
			localDevelopment: isLocalDevelopment(),
			urls: {
				ArenaHelper: location.origin+location.pathname.replace(/[^\/]*$/,'')+'ArenaHelper.js',
				replay: data.header.replay,
				...EXTERNAL_RESOURCES
			},
			iframeID: Date()+'_'+Math.random(),
			participants: bracket,
			settings: data.settings
		};
		if(json.participants.length === 0){
			for(const select of document.getElementsByClassName('participants')){
				if(select.id !== 'participants-selectable'){
					let team = [];
					json.participants.push(team);
					for(const option of [...select.options].sort((a,b) => a.dataset.name.localeCompare(b.dataset.name))){
						team.push({
							name: option.dataset.name,
							url: option.dataset.raw_url
						});
					}
				}
			}
		}
		let iframe = document.createElement('iframe');
		iframe.src = 'iframe.sandbox.arena.html';
		iframe.sandbox = 'allow-scripts';
		if(json.participants.flat().flatMap(p => p.url).find(url => url.startsWith('!'))){
			iframe.sandbox += ' allow-popups allow-same-origin';
		}
		iframe.style.display = 'none';
		iframe.id = json.iframeID;
		iframeWrapper.appendChild(iframe);
		let resolve;
		new Promise(r => resolve = r).then(async()=>{
			await queue(()=>pendingArenaSandboxes.findIndex(s => s.contentWindow === iframe.contentWindow) !== -1);
			iframe.contentWindow.postMessage(json, '*')
		});
		pendingArenaSandboxes.push({contentWindow: iframe.contentWindow, ready: resolve});
	}
}
