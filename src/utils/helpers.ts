// FILE FOR USEFUL, REUSABLE FUNCTIONS
// IMPORTS

// RANDOM FUNCTIONS
// INCLUSIVE MIN AND MAX RANDOM INT FUNCTION
function randomIntFromInterval(min: number, max: number) {
	return Math.floor(Math.random() * (max - min + 1) + min);
}

// INCLUSIVE MIN AND MAX RANDOM FLOAT FUNCTION
function randomFloatFromInterval(min: number, max: number) {
	return Math.random() * (max - min + 1) + min;
}

// RANDOM ELEMENT FROM ARRAY
function randomElementFromArray(array: any[]) {
	return array[Math.floor(Math.random() * array.length)];
}

// RANDOM ELEMENT FROM OBJECT
function randomElementFromObject(object: any) {
	return object[Object.keys(object)[Math.floor(Math.random() * Object.keys(object).length)]];
}

// EXPORTS
export {
	randomIntFromInterval,
	randomFloatFromInterval,
	randomElementFromArray,
	randomElementFromObject,
};