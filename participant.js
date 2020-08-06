'use strict'
class Participant{
	constructor(participant={}){
		this.worker = createWorkerFromRemoteURL(participant.url, true);
		this.name = participant.name;
	}
}