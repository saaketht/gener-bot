import { MessageEmbed, Message } from 'discord.js';

module.exports = {
	name: 'buttons',
	async execute(message: Message) {
		if (message.author.bot) return;
		const command = message.content.toLowerCase().split(' ');
		if (command.includes('embedtest')) {
			const exampleEmbed = new MessageEmbed()
				.setColor('#0099ff')
				.setTitle('Some title')
				.setURL('https://discord.js.org/')
				.setAuthor({ name: 'Some name', iconURL: 'https://pixnio.com/free-images/2019/02/08/2019-02-08-14-11-45.jpg', url: 'https://discord.js.org' })
				.setDescription('Some description here')
				.setThumbnail('https://pixnio.com/free-images/2019/02/08/2019-02-08-14-11-45.jpg')
				.addFields(
					{ name: 'Regular field title', value: 'Some value here' },
					{ name: '\u200B', value: '\u200B' },
					{ name: 'Inline field title', value: 'Some value here', inline: true },
					{ name: 'Inline field title', value: 'Some value here', inline: true },
				)
				.addField('Inline field title', 'Some value here', true)
				.setImage('https://wallup.net/wp-content/uploads/2018/09/25/625601-abstract-wavy_lines-colorful-748x387.jpg')
				.setTimestamp()
				.setFooter({ text: 'Some footer text here', iconURL: 'http://1.bp.blogspot.com/-1rGY7U_HKuM/TgltFHC-tgI/AAAAAAAADG4/75iXHaKLX6Q/s1600/abstract+background+%25285%2529.jpg' });

			// await message.reply({ embeds: [exampleEmbed] });
			await message.reply({ embeds: [exampleEmbed] });
		}
	},
};