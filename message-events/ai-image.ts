import { Message } from 'discord.js';
import { S3Client } from '@aws-sdk/client-s3';
const REGION = 'us-east-1';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import JsonBigint from 'json-bigint';
dotenv.config();

const REQUEST_TIMEOUT_SEC = 60000;
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
			const backendUrl = 'https://hip-clubs-reply-35-196-71-172.loca.lt/';
			const text = searchQuery.join(' ');
			const res: any = await Promise.race([
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
			/* TODO: upload image by sending data URL to AWS S3 so that shorter links can be made
			and so images can be saved for later for whatever reason */
			const s3Client = new S3Client({ region: REGION });


			const urlMaker = 'data:image/png;base64,';
			const bigIntParsed = JsonBigint.parse(res);
			const hugeURL = urlMaker + bigIntParsed[0];
			const imageRes = await fetch(hugeURL).then(response => response.json());
			console.log('sending a really long ' + typeof bigIntParsed[0] + ' to be embedded as a url to ai generated image');
			console.log(imageRes);
			message.reply(imageRes);
		}
	},
};

function checkIndex(string: string) {
	return (string === activationStr || string === 'generimage');
}
