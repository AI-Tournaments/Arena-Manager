'use strict'
function a(){
	let arenaProperties;
	let arenaList = document.getElementById('arena-datalist');
	let participantList = document.getElementById('participants-selectable');
	let settingsIframe = document.getElementById('settings');
	let logContainer = document.getElementById('logContainer');
	let outputSum = document.getElementById('outputSum');
	let btnAddTeam = document.getElementById('add-team');
	btnAddTeam.onclick = createTeam;
	let btnStart = document.getElementById('btnStart');
	btnStart.onclick = start;
	let btnTransfer = document.getElementById('transfer');
	btnTransfer.onclick = transferToTeam;
	let contentWindows = {
		iFrameLog: []
	};
	document.getElementById('arena').onchange = event => {
		let option = getOption(arenaList, event);
		if(option !== undefined){
			btnAddTeam.disabled = true;
			for(const element of document.getElementsByClassName('participant-team-container')){
				element.parentNode.removeChild(element);
			}
			document.title = event.target.value + ' Arena';
			settingsIframe.contentWindow.postMessage({type: 'SetArena', value: event.target.value});
			getParticipants(option.value);
		}
	}
	fetch('https://api.github.com/orgs/AI-Tournaments/repos').then(response => response.json()).then(repos => {
		repos.forEach(repo => {
			if(repo.full_name.endsWith('-Arena')){
				let option = document.createElement('option');
				option.value = repo.full_name.replace(/.*\/|-Arena/g, '');
				option.dataset.full_name = repo.full_name;
				arenaList.appendChild(option);
			}
		});
	});
	window.onmessage = messageEvent => {
		if(messageEvent.data.type === 'auto-run'){
			document.title = messageEvent.data.title;
			begin(messageEvent.data.settings, messageEvent.data.bracket);
			sendLog(messageEvent);
		}else if(contentWindows.iFrameLog.includes(messageEvent.source)){
			writeArenaLog(messageEvent);
		}else if(settingsIframe.contentWindow === messageEvent.source){
			switch(messageEvent.data.type){
				case 'properties':
					arenaProperties = messageEvent.data.value.properties;
					settingsIframe.style.height = messageEvent.data.value.height + 'px';
					for(let i = 0; i < Math.max(1, arenaProperties.header.limits.teams.min); i++){
						createTeam();
					}
					break;
				case 'settings': begin(messageEvent.data.value); break;
			}
			
		}else{
			console.error('Source element not defined!');
			console.error(messageEvent.source.frameElement);
		}
	}
	function sendLog(messageEvent){
		if(outputSum.dataset.done){
			messageEvent.source.postMessage({type: 'log', value: {id: messageEvent.data.id, log: JSON.parse(outputSum.dataset.array)}}, messageEvent.origin);
		}else{
			setTimeout(()=>{sendLog(messageEvent)}, 1000);
		}
	}
	function writeArenaLog(messageEvent){
		let iframe = document.getElementById(messageEvent.data.id);
		let output = iframe.parentElement.getElementsByClassName('log')[0];
		if(messageEvent.origin === 'null'){
			while(0 < output.childElementCount){
				output.removeChild(output.firstChild);
			}
			let isDone = true;
			let aborted = []; // TODO: Use.
			messageEvent.data.value.data.forEach(posts => {
				let container = document.createElement('div');
				output.appendChild(container);
				let isDone_local = false;
				let score = undefined;
				posts.forEach(post => {
					isDone_local |= post.type === 'Done' || post.type === 'Aborted';
					if(post.type === 'Done'){
						score = post.value.score;
					}else if(post.type === 'Aborted'){
						score = null;
						aborted.push(post.value);
					}
					let label = document.createElement('label');
					label.htmlFor = iframe.src + ':' + post.id;
					label.classList.add(post.type);
					label.innerHTML = post.type;
					container.appendChild(label);
					let pre = document.createElement('pre');
					pre.id = iframe.src + ':' + post.id;
					pre.classList.add(post.type);
					pre.innerHTML = JSON.stringify(post.value,null,'\t');
					container.appendChild(pre);
				});
				isDone &= isDone_local;
				if(isDone_local){
					if(score === null){
						outputSum.dataset.aborted = JSON.stringify(aborted);
					}else{
						let array = outputSum.dataset.array === undefined ? [] : JSON.parse(outputSum.dataset.array);
						score.forEach(s => {
							let entry = array.find(entry => entry.name === s.name);
							if(entry === undefined){
								entry = {type: 'score', name: s.name, score: 0, scores: []};
								array.push(entry);
							}
							entry.scores.push(s.score);
							entry.score = entry.scores.reduce(function(a,b){return a+b;})/entry.scores.length;
						});
						outputSum.dataset.array = JSON.stringify(array);
						outputSum.innerHTML = JSON.stringify(array,null,'\t');
					}
				}
			});
			if(isDone){
				outputSum.dataset.array = JSON.stringify(messageEvent.data.value);
				outputSum.dataset.done = true;
				outputSum.innerHTML = JSON.stringify(messageEvent.data.value,null,'\t');
				contentWindows.iFrameLog.splice(contentWindows.iFrameLog.indexOf(messageEvent.source), 1);
				for(const element of document.getElementsByClassName('replay-container')){
					element.parentNode.removeChild(element);
				}
				let replayContainer = document.createElement('iframe');
				replayContainer.classList.add('replay-container');
				replayContainer.src = '../Replay/#'+outputSum.dataset.array;
				document.body.appendChild(replayContainer);
			}else{
				getIFrameLog(iframe);
			}
		}
	};
	function getOption(element, event){
		for(const option of element.getElementsByTagName('option')){
			if(option.value === event.target.value){
				return option;
			}
		}
	}
	function sortOptions(selectElement){
		let options = [...selectElement.options];
		options.sort(function(a, b){
			if(a.value < b.value){return -1;}
			if(b.value < a.value){return 1;}
			return 0;
		});
		for(let option of options){
			selectElement.add(option);
		}
	}
	function validateTeams(){
		let selectElements = document.getElementsByClassName('participant-team');
		return arenaProperties.header.limits.teams.min <= selectElements.length && selectElements.length <= arenaProperties.header.limits.teams.max;
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
	function getParticipants(arena=''){
		for(const selectElement of document.getElementsByClassName('participants')){
			while(0 < selectElement.length){
				selectElement.remove(0);
			}
		}
		let promises = [];
		fetch('https://api.github.com/search/repositories?q=topic:AI-Tournament+topic:Participant+topic:'+arena,{
			headers: {Accept: 'application/vnd.github.mercy-preview+json'} // TEMP: Remove when out of preview. https://docs.github.com/en/rest/reference/search#search-topics-preview-notices
		}).then(response => response.json()).then(response => {
			response.items.forEach(repo => {
				promises.push(fetch('https://api.github.com/repos/' + repo.full_name + '/git/trees/' + repo.default_branch)
				.then(response => response.json())
				.then(data => {
					data.tree.forEach(file =>{
						if(file.type === 'blob' && file.path === 'participant.js'){
							let option = document.createElement('option');
							option.dataset.name = repo.full_name.replace('AI-Tournament-Participant-'+arena+'-','');
							option.dataset.url = 'https://raw.githubusercontent.com/' + repo.full_name + '/' + repo.default_branch + '/' + file.path;
							option.innerHTML = option.dataset.name;
							participantList.appendChild(option);
						}
					});
				})
				.catch(error => {
					console.error(error);
				}));
			});
			Promise.all(promises).then(() => {
				sortOptions(participantList);
			})
		});
	}

	function createTeam(){
		let teamIndex = document.getElementsByClassName('participant-team-container').length + 1;
		btnAddTeam.disabled = !validateTeams();
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
		input.value = btnTransfer.value;
		input.onclick = transferToTeam;
		label.htmlFor = teamID;
		label.innerHTML = 'Team ' + teamIndex;
		select.id = teamID;
		select.classList.add('participants');
		select.classList.add('participant-team');
		select.multiple = true;
		document.getElementById('participant-groups').appendChild(participantTeam);
	}
	function start(){
		while(0 < logContainer.childElementCount){
			logContainer.removeChild(logContainer.firstChild);
		}
		outputSum.innerHTML = '';
		for(var key in outputSum.dataset){
			delete outputSum.dataset[key];
		}
		settingsIframe.contentWindow.postMessage({type: 'GetSettings'});
	}
	function begin(settings, bracket=[]){
		let json = {
			arena: document.title.split(' ')[0],
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
							url: option.dataset.url
						});
					}
				}
			}
		}
		let div = document.createElement('div');
		logContainer.appendChild(div);
		let iframe = document.createElement('iframe');
		iframe.src = 'iframe.sandbox.html#' + JSON.stringify(json);
		iframe.sandbox = 'allow-scripts';
		iframe.style.display = 'none';
		iframe.id = Date() + '_' + Math.random();
		div.appendChild(iframe);
		let output = document.createElement('div');
		output.style.display = 'none';
		output.classList.add('log');
		div.appendChild(output);
		setTimeout(()=>{getIFrameLog(iframe, output)}, 1000);
	}
	function getIFrameLog(iframe){
		contentWindows.iFrameLog.push(iframe.contentWindow);
		iframe.contentWindow.postMessage(iframe.id, '*');
	}
}
