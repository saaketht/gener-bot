import { MessageEmbed, Interaction, User, CommandInteraction } from 'discord.js';
import { randomIntFromInterval } from '../functions/functions';

const getPongEmbed = (): MessageEmbed => {
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
	return new MessageEmbed()
		.setColor('#FFFFFF')
		.setTitle('ping_response')
		.setDescription('PONG')
		.setImage(link)
		.setTimestamp();
};

const getPingEmbed = (): MessageEmbed => {
	const rand = randomIntFromInterval(1, 7);
	let link: string;
	switch (rand) {
	case 1:
		link = 'https://c.tenor.com/LyaFwroePycAAAAC/ping-pong-ping-pong-the-animation.gif';
		break;
	case 2:
		link = 'https://c.tenor.com/8I81GjIeBYIAAAAd/anime-sport.gif';
		break;
	case 3:
		link = 'https://c.tenor.com/djgxMWCZ5AMAAAAC/ping-pong-smile.gif';
		break;
	case 4:
		link = 'https://c.tenor.com/pKgZTHLV6dEAAAAd/table-tennis.gif';
		break;
	case 5:
		link = 'https://c.tenor.com/HKIZEZ-mrfEAAAAC/ping-pong-anime.gif';
		break;
	case 6:
		link = 'https://c.tenor.com/phlZaF95p4kAAAAd/serve-table-tennis.gif';
		break;
	case 7:
		link = 'https://c.tenor.com/g44lccSjD6sAAAAC/jesse-and.gif';
		break;
	default:
		link = 'https://c.tenor.com/YGQKSBCxS2QAAAAi/trick-table-tennis.gif';
		break;
	}
	return new MessageEmbed()
		.setColor('RED')
		.setTitle('ping_response')
		.setDescription('PING')
		.setImage(link)
		.setTimestamp();
};

const getServerEmbed = (interaction: CommandInteraction): MessageEmbed => {
	let img = 'https://s7.gifyu.com/images/waves.gif';
	if (interaction.guild?.iconURL() !== 'undefined' && interaction.guild?.iconURL() !== null) {
		const guild: any = interaction.guild;
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		img = guild.iconURL();
	}
	return new MessageEmbed()
		.setColor('RANDOM')
		.setTitle('server_info')
		.setDescription(`Server name: ${interaction.guild?.name}\nTotal members: ${interaction.guild?.memberCount}`)
		.setImage(img)
		.setTimestamp();

};

const getUserEmbed = (interaction: Interaction): MessageEmbed => {
	return new MessageEmbed()
		.setColor('DARK_BUT_NOT_BLACK')
		.setTitle('user_info')
		.setDescription(`Your tag: ${interaction.user.tag}\nYour id: ${interaction.user.id}`)
		.setImage(interaction.user.displayAvatarURL({ dynamic: true }))
		.setTimestamp();
};

const getAvatarEmbed = (user: User): MessageEmbed => {
	return new MessageEmbed()
		.setColor('NOT_QUITE_BLACK')
		.setTitle('get_avatar')
		.setDescription(`${user.username}'s avatar:`)
		.setImage(user.displayAvatarURL({ dynamic: true }))
		.setTimestamp();
};

export {
	getPongEmbed,
	getPingEmbed,
	getServerEmbed,
	getUserEmbed,
	getAvatarEmbed,
};
