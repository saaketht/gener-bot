/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Message, MessageAttachment } from 'discord.js';
import { readFile } from 'fs/promises';
import { BucketParams } from '../@types/bot/BucketParams';
import { s3PutCommand } from '../libs/s3_create_and_upload_object';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const imageDataURI = require('image-data-uri');
import Canvas from '@napi-rs/canvas';
import fetch from 'node-fetch';
import JsonBigint from 'json-bigint';
import dotenv from 'dotenv';
dotenv.config();

const REQUEST_TIMEOUT_SEC = 60000;
const S3Bucket: string = process.env.S3_BUCKET_NAME || '';
// const clientId = process.env.privilegedIds;
const activationStr = 'ai-image';
module.exports = {
	name: 'ai-image',
	async execute(message: Message) {
		if (message.author.bot) return;
		const command = message.content.toLowerCase().split(' ');
		// console.log(command);
		const searchIndex = command.findIndex(checkIndex);
		if (searchIndex != -1 && command.length > 1) {
			console.log (message.author.username + ' ran ' + activationStr + '!');
			// message.reply('this feature fr in the works rn');
			// const queryStartTime = new Date();
			const searchQuery = [];
			for (let index = searchIndex + 1; index < command.length; index++) {
				// console.log(command[index]);
				searchQuery.push(command[index]);
			}
			const backendUrl = 'https://sour-kings-chew-34-80-170-5.loca.lt/';
			const text = searchQuery.join(' ');
			const result: any = await Promise.race([
				(await fetch(backendUrl + '/dalle', {
					method: 'POST',
					headers: {
						'Bypass-Tunnel-Reminder': 'go',
						'mode': 'no-cors',
					},
					body: JSON.stringify({
						text,
						'num_images': 1,
					}),
				},
				).then((response) => {
					if (!response.ok) {
						throw Error(response.statusText);
					}
					return response;
				})).text(), new Promise((_, reject) => setTimeout(
					() => reject(new Error('Timeout')), REQUEST_TIMEOUT_SEC)),
			]);
			// console.log(typeof result[0]);
			const urlMaker = 'data:image/png;base64,';
			const bigIntParsed = JsonBigint.parse(result);
			const hugeURL = urlMaker + bigIntParsed[0];
			const timestamp = Date.now();
			const imageBucketKey = message.author.id + searchQuery.join('_') + timestamp;

			const path = './tempDalleDir/' + imageBucketKey;

			const loc = await imageDataURI.outputFile(hugeURL, path).then((res: any) => console.log(res));
			console.log('img key generated!: ' + imageBucketKey + ', stored at: ' + loc);

			const canvas = Canvas.createCanvas(256, 256);
			const context = canvas.getContext('2d');
			const image = await readFile(path + '.png');
			const background = new Canvas.Image();
			background.src = image;
			context.drawImage(background, 0, 0, canvas.width, canvas.height);
			const attachment = new MessageAttachment(canvas.toBuffer('image/png'), 'image.png');


			const s3Params: BucketParams = {
				Bucket: S3Bucket,
				Key: imageBucketKey,
				Body: image,
			};
			let output: any;
			if (S3Bucket === '') {
				console.log('No Bucket Name Found!');
			}
			else {
				output = s3PutCommand(s3Params);
			}
			console.log(output);
			message.reply({ files: [attachment] });
		}
	},
};

function checkIndex(string: string) {
	return (string === activationStr || string === 'generimage');
}
