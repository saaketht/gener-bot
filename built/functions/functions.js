"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findIndex = exports.randomIntFromInterval = void 0;
// INCLUSIVE MIN AND MAX RANDOM INT FUNCTION
function randomIntFromInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}
exports.randomIntFromInterval = randomIntFromInterval;
function findIndex(searchIn, searchFor) {
    return searchIn.includes(searchFor);
}
exports.findIndex = findIndex;
