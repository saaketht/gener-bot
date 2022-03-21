import { MessageEmbed } from 'discord.js';

module.exports = {
	name: 'buttons',
	async execute(message: { author: { bot: any; }; content: string; reply: (arg0: { embeds: any[]; }) => any; }) {
		if (message.author.bot) return;
		const command = message.content.toLowerCase().split(' ');
		if (command.includes('buttonsTest')) {
			const exampleEmbed = new MessageEmbed()
				.setColor('#0099ff')
				.setTitle('Some title')
				.setURL('https://discord.js.org/')
				.setAuthor({ name: 'Some name', iconURL: 'https://i.imgur.com/AfFp7pu.png', url: 'https://discord.js.org' })
				.setDescription('Some description here')
				.setThumbnail('https://i.imgur.com/AfFp7pu.png')
				.addFields(
					{ name: 'Regular field title', value: 'Some value here' },
					{ name: '\u200B', value: '\u200B' },
					{ name: 'Inline field title', value: 'Some value here', inline: true },
					{ name: 'Inline field title', value: 'Some value here', inline: true },
				)
				.addField('Inline field title', 'Some value here', true)
				.setImage('https://i.imgur.com/AfFp7pu.png')
				.setTimestamp()
				.setFooter({ text: 'Some footer text here', iconURL: 'https://i.imgur.com/AfFp7pu.png' });

			await message.reply({ embeds: [exampleEmbed] });
		}
	},
};