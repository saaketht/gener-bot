// INCLUSIVE MIN AND MAX RANDOM INT FUNCTION
function randomIntFromInterval(min: number, max: number) {
	return Math.floor(Math.random() * (max - min + 1) + min);
}

function findIndex(searchIn: string | string[], searchFor: string) {
	return searchIn.includes(searchFor);
}

export {
	randomIntFromInterval,
	findIndex,
};