'use strict'
function a(){
	let sourceWindow = undefined;
	let arenaList = document.getElementById('arena');
	let arenaFilter = document.getElementById('arena-filter');
	let inputSortByStars = document.getElementById('sort-by-stars');
	arenaFilter.addEventListener('change', getArenas);
	arenaList.onchange = event => {
		let option = getOption(arenaList, event);
		if(option !== undefined){
			let json = JSON.parse(option.dataset.json);
			document.getElementById('link-arena').href = json.html_url;
			sourceWindow.postMessage({type: 'arena-changed', value: {option: json, settings: {sortByStars: inputSortByStars.checked, height: document.documentElement.offsetHeight}}});
		}
	}
	window.onmessage = messageEvent => {
		switch(messageEvent.data.type){
			case 'get-arenas':
				if(sourceWindow === undefined){
					sourceWindow = messageEvent.source;
					getArenas(messageEvent.data.value.preSelectedArena);
				}
				break;
			case 'add-arena':
				addArena(messageEvent.data.value[0], messageEvent.data.value[1]);
				break;
		}
	}
	function addArena(url, name){
		let option = document.createElement('option');
		let json = {
			name: name,
			raw_url: url,
			html_url: url,
			full_name: name,
			default_branch: null,
			stars: -1
		};
		option.innerHTML = json.name;
		option.dataset.json = JSON.stringify(json);
		arenaList.appendChild(option);
		Array.from(arenaList.options).forEach(option => {
			if(option.selected){
				option.selected = false;
			}
		});
		option.selected = true;
		arenaList.onchange({target: option});
	}
	function getArenas(preSelectedArena=''){
		while(0 < arenaList.length){
			arenaList.remove(0);
		}
		GitHubApi.fetchArenas().then(repos => {
			let preSelected = undefined;
			let options = [...arenaFilter.selectedOptions].flatMap(selectedOption => selectedOption.value);
			repos.forEach(repo => {
				let official = repo.owner.login === 'AI-Tournaments';
				if(options.includes('all') || (official && options.includes('official')) || (!official && options.includes('community'))){
					let cssStar = getComputedStyle(document.documentElement).getPropertyValue('--github-stars').trim();
					cssStar = cssStar.substring(1,cssStar.length-1);
					let option = document.createElement('option');
					if(preSelectedArena === repo.full_name){
						preSelected = option;
					}
					let json = {
						official: official,
						name: repo.full_name.replace(/.*\/|-Arena/g, ''),
						raw_url: 'https://raw.githubusercontent.com/'+repo.full_name+'/'+repo.default_branch+'/',
						html_url: repo.html_url,
						full_name: repo.full_name,
						default_branch: repo.default_branch,
						stars: repo.stargazers_count
					};
					option.innerHTML = json.name + ' ' + cssStar + repo.stargazers_count;
					option.dataset.json = JSON.stringify(json);
					arenaList.appendChild(option);
				}
			});
			sortOptions(arenaList);
			if(preSelected === undefined){
				arenaList.onchange({target: arenaList.options[0]});
			}else{
				arenaList.options[0].selected = false;
				preSelected.selected = true;
				arenaList.onchange({target: preSelected});
			}
		});
	}
	function getOption(element, event){
		for(const option of element.getElementsByTagName('option')){
			if(option.value === event.target.value){
				return option;
			}
		}
	}
	function sortOptions(selectElement){
		function value(option){
			return inputSortByStars.checked ? JSON.parse(option.dataset.json).stars : option.value;
		}
		let options = [...selectElement.options];
		options.sort(function(a, b){
			if(a.classList.contains('local') ? true : value(a) < value(b)){return -1;}
			if(b.classList.contains('local') ? true : value(b) < value(a)){return 1;}
			return 0;
		});
		for(let option of options){
			selectElement.add(option);
		}
	}
}
