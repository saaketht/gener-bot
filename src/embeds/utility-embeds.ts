import { EmbedBuilder, ChatInputCommandInteraction, User } from 'discord.js';
import { randomIntFromInterval } from '../utils/helpers';

// embed for ping command
const getPongEmbed = (): EmbedBuilder => {
	const rand = randomIntFromInterval(1, 6);
	let link: string;
	switch (rand) {
	case 1:
		link = 'https://cdn.pixabay.com/photo/2016/02/18/23/26/table-tennis-1208376_1280.jpg';
		break;
	case 2:
		link = 'https://c.pxhere.com/photos/fc/ec/table_tennis_ping_pong_passion_sport-822217.jpg!d';
		break;
	case 3:
		link = 'https://cdn.pixabay.com/photo/2016/02/18/23/26/table-tennis-1208378_960_720.jpg';
		break;
	case 4:
		link = 'https://occ-0-2794-2219.1.nflxso.net/dnm/api/v6/E8vDc_W8CLv7-yMQu8KMEC7Rrr8/AAAABVPLxOla8KuCOL5wlIO0Zct0wLxj24PA6S96EHbjq6A9H0V9_ln2DfMx5WdMMtQA7OF5lS5-CRnQKKA_tioaoTMhTkYj.jpg?r=10d';
		break;
	case 5:
		link = 'https://c.tenor.com/zO32JIfw1LkAAAAC/ping-pong-anime.gif';
		break;
	default:
		link = 'http://clipart-library.com/images/8i65zynLT.png';
		break;
	}
	return new EmbedBuilder()
		.setColor('#FF0000')
		.setTitle('ping response')
		.setDescription('pong')
		.setImage(link)
		.setTimestamp();
};

// embed for server info command
const getServerEmbed = (interaction: ChatInputCommandInteraction): EmbedBuilder => {
	let img = 'https://s7.gifyu.com/images/waves.gif';
	if (interaction.guild?.iconURL() !== 'undefined' && interaction.guild?.iconURL() !== null) {
		const guild: any = interaction.guild;
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		img = guild.iconURL();
	}
	return new EmbedBuilder()
		.setColor(Math.floor(Math.random() * 0xFFFFFF))
		.setTitle('server_info')
		.setDescription(`Server name: ${interaction.guild?.name}\nTotal members: ${interaction.guild?.memberCount}`)
		.setImage(img)
		.setTimestamp();

};

// embed for user info command
const getUserEmbed = (interaction: ChatInputCommandInteraction): EmbedBuilder => {
	return new EmbedBuilder()
		.setColor(0x2C2F33)
		.setTitle('user_info')
		.setDescription(`Your tag: ${interaction.user.tag}\nYour id: ${interaction.user.id}`)
		.setImage(interaction.user.displayAvatarURL())
		.setTimestamp();
};

// embed for avatar command
const getAvatarEmbed = (user: User): EmbedBuilder => {
	return new EmbedBuilder()
		.setColor(0x23272A)
		.setTitle('get_avatar')
		.setDescription(`${user.username}'s avatar:`)
		.setImage(user.displayAvatarURL())
		.setTimestamp();
};

export {
	getPongEmbed,
	getServerEmbed,
	getUserEmbed,
	getAvatarEmbed,
};
