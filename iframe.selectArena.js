'use strict'
let addParticipant;
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
		if(sourceWindow === undefined){
			sourceWindow = messageEvent.source;
			getArenas(messageEvent.data);
		}
	}
	function getArenas(preSelectedArena=''){
		while(0 < arenaList.length){
			arenaList.remove(0);
		}
		function addOptions(repos){
			let preSelected = undefined;
			repos.forEach(repo => {
				if(repo.owner.login === 'AI-Tournaments' ? repo.full_name.endsWith('-Arena') : true){
					let cssStar = getComputedStyle(document.documentElement).getPropertyValue('--github-stars').trim();
					cssStar = cssStar.substring(1,cssStar.length-1);
					let option = document.createElement('option');
					if(preSelectedArena === repo.full_name){
						preSelected = option;
					}
					let json = {};
					json.name = repo.full_name.replace(/.*\/|-Arena/g, '');
					json.html_url = repo.html_url;
					option.innerHTML = json.name + ' ' + cssStar + repo.stargazers_count;
					json.full_name = repo.full_name;
					json.default_branch = repo.default_branch;
					json.stars = repo.stargazers_count;
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
		}
		for(const selectedOption of arenaFilter.selectedOptions){
			if(['all', 'official'].includes(selectedOption.value)){
				fetch('https://api.github.com/orgs/AI-Tournaments/repos').then(response => response.json()).then(addOptions);
			}
			if(['all', 'community'].includes(selectedOption.value)){
				fetch('https://api.github.com/search/repositories?q=topic:AI-Tournaments+topic:Community-Arena-v1').then(response => response.json()).then(response => addOptions(response.items));
			}
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
