'use strict'
function a(){
	console.log('// TODO: Fix height of iframe or scroll of parent when this takes two rows on small screen.');
	let _arenas = [];
	let _preSelectedArena = '';
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
			let github_logo = document.getElementById('GitHub-logo');
			github_logo.style.height = 0;
			sourceWindow.postMessage({type: 'arena-changed', value: {option: json, settings: {sortByStars: inputSortByStars.checked, height: document.documentElement.offsetHeight}}});
			github_logo.style.height = document.documentElement.offsetHeight+'px';
		}
	}
	window.onmessage = messageEvent => {
		switch(messageEvent.data.type){
			case 'get-arenas':
				if(sourceWindow === undefined){
					sourceWindow = messageEvent.source;
				}
				_preSelectedArena = messageEvent.data.value.preSelectedArena;
				getArenas();
				break;
			case 'add-arena':
				addArena_local(messageEvent.data.value);
				break;
		}
	}
	function addArena_local(json){
		let option = document.createElement('option');
		option.classList.add('local');
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
	function getArenas(){
		[...arenaList.getElementsByTagName('option')].filter(o => !o.classList.contains('local')).forEach(o => arenaList.removeChild(o));
		GitHubApi.fetchArenas().then(arenas => {
			_arenas = arenas;
			filterPreviews();
		});
	}
	function filterPreviews(){
		let preSelected = undefined;
		let options = [...arenaFilter.selectedOptions].flatMap(selectedOption => selectedOption.value);
		_arenas.filter(arena => arena.version).forEach(arena => {
			if(options.includes('all') || (arena.official && options.includes('official')) || (!arena.official && options.includes('community'))){
				let cssStar = getComputedStyle(document.documentElement).getPropertyValue('--github-stars').trim();
				cssStar = cssStar.substring(1,cssStar.length-1);
				let option = document.createElement('option');
				if(_preSelectedArena === arena.full_name){
					preSelected = option;
				}
				option.innerHTML = arena.name + ' ' + cssStar + arena.stars;
				option.dataset.json = JSON.stringify(arena);
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
