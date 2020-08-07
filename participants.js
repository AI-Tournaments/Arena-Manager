'use strict'
class Participants{
	constructor(teams=[]){
		teams.forEach(team => {
			team.forEach(participant => {
				this.worker = createWorkerFromRemoteURL(participant.url, true);
				this.name = participant.name;
				this.score = 0;
				this.aborted = false;
			});
		});
		this.addScore = (participant, score) => {
			teams.forEach(team => {
				team.forEach(_participant => {
					if(participant === _participant){
						participant.score += score;
					}
				});
			});
		}
		this.getScores = () => {
			return {};
		}
	}
}