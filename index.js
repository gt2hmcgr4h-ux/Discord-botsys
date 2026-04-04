const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, REST, Routes } = require(‘discord.js’);
const mongoose = require(‘mongoose’);
const http = require(‘http’);

http.createServer((req, res) => res.end(‘Bot is alive!’)).listen(process.env.PORT || 3000);

const userSchema = new mongoose.Schema({
userId: String, guildId: String,
xp: { type: Number, default: 0 }, level: { type: Number, default: 0 },
credits: { type: Number, default: 0 }, reputation: { type: Number, default: 0 },
lastRep: { type: Date, default: null }, messages: { type: Number, default: 0 },
});
userSchema.index({ userId: 1, guildId: 1 }, { unique: true });
const warnSchema = new mongoose.Schema({ userId: String, guildId: String, moderatorId: String, reason: String, warnId: String }, { timestamps: true });
const guildSchema = new mongoose.Schema({ guildId: { type: String, unique: true }, welcomeChannel: { type: String, default: null }, welcomeMessage: { type: String, default: ‘Welcome {user} to {server}!’ }, antiLink: { type: Boolean, default: false }, antiSpam: { type: Boolean, default: false }, xpEnabled: { type: Boolean, default: true } });
const User = mongoose.model(‘User’, userSchema);
const Warning = mongoose.model(‘Warning’, warnSchema);
const Guild = mongoose.model(‘Guild’, guildSchema);

async function getUser(userId, guildId) { return await User.findOneAndUpdate({ userId, guildId }, {}, { upsert: true, new: true, setDefaultsOnInsert: true }); }
async function getGuild(guildId) { return await Guild.findOneAndUpdate({ guildId }, {}, { upsert: true, new: true, setDefaultsOnInsert: true }); }
function xpForLevel(level) { return 100 * (level * level) + 100 * level; }
function genId() { return Math.random().toString(36).slice(2, 10).toUpperCase(); }
function parseDuration(str) { if (!str) return null; const m = str.match(/^(\d+)(s|m|h|d)$/i); if (!m) return null; const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 }; return parseInt(m[1]) * units[m[2].toLowerCase()]; }
function formatDur(ms) { if (!ms) return ‘Permanent’; const d = Math.floor(ms/86400000), h = Math.floor((ms%86400000)/3600000), m = Math.floor((ms%3600000)/60000), s = Math.floor((ms%60000)/1000); return [d&&(d+‘d’),h&&(h+‘h’),m&&(m+‘m’),s&&(s+‘s’)].filter(Boolean).join(’ ’); }
const BLUE = 0x5865f2, GREEN = 0x23a559, RED = 0xf23f43, YELLOW = 0xf0b232;
function emb(color, title, desc) { const e = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp(); if (desc) e.setDescription(desc); return e; }

const commands = [
new SlashCommandBuilder().setName(‘ban’).setDescription(‘Ban a member’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’).setRequired(true)).addStringOption(o=>o.setName(‘reason’).setDescription(‘Reason’)).addStringOption(o=>o.setName(‘duration’).setDescription(‘e.g. 7d’)).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
new SlashCommandBuilder().setName(‘kick’).setDescription(‘Kick a member’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’).setRequired(true)).addStringOption(o=>o.setName(‘reason’).setDescription(‘Reason’)).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
new SlashCommandBuilder().setName(‘mute’).setDescription(‘Timeout a member’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’).setRequired(true)).addStringOption(o=>o.setName(‘duration’).setDescription(‘e.g. 10m, 1h’).setRequired(true)).addStringOption(o=>o.setName(‘reason’).setDescription(‘Reason’)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
new SlashCommandBuilder().setName(‘unmute’).setDescription(‘Remove timeout’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
new SlashCommandBuilder().setName(‘warn’).setDescription(‘Warn a member’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’).setRequired(true)).addStringOption(o=>o.setName(‘reason’).setDescription(‘Reason’).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
new SlashCommandBuilder().setName(‘warnings’).setDescription(‘View warnings’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
new SlashCommandBuilder().setName(‘clear’).setDescription(‘Delete messages’).addIntegerOption(o=>o.setName(‘amount’).setDescription(‘1-100’).setRequired(true).setMinValue(1).setMaxValue(100)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
new SlashCommandBuilder().setName(‘lock’).setDescription(‘Lock channel’).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
new SlashCommandBuilder().setName(‘unlock’).setDescription(‘Unlock channel’).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
new SlashCommandBuilder().setName(‘slowmode’).setDescription(‘Set slowmode’).addIntegerOption(o=>o.setName(‘seconds’).setDescription(‘0-21600’).setRequired(true).setMinValue(0).setMaxValue(21600)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
new SlashCommandBuilder().setName(‘rank’).setDescription(‘View rank’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’)),
new SlashCommandBuilder().setName(‘top’).setDescription(‘Leaderboard’),
new SlashCommandBuilder().setName(‘setxp’).setDescription(‘Set XP’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’).setRequired(true)).addIntegerOption(o=>o.setName(‘amount’).setDescription(‘XP’).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
new SlashCommandBuilder().setName(‘setlevel’).setDescription(‘Set level’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’).setRequired(true)).addIntegerOption(o=>o.setName(‘level’).setDescription(‘Level’).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
new SlashCommandBuilder().setName(‘user’).setDescription(‘User info’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’)),
new SlashCommandBuilder().setName(‘avatar’).setDescription(‘Get avatar’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’)),
new SlashCommandBuilder().setName(‘server’).setDescription(‘Server info’),
new SlashCommandBuilder().setName(‘roles’).setDescription(‘List roles’),
new SlashCommandBuilder().setName(‘roll’).setDescription(‘Roll dice’).addIntegerOption(o=>o.setName(‘sides’).setDescription(‘Sides’).setMinValue(2).setMaxValue(1000)),
new SlashCommandBuilder().setName(‘rep’).setDescription(‘Give rep’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’).setRequired(true)),
new SlashCommandBuilder().setName(‘credits’).setDescription(‘View credits’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’)),
new SlashCommandBuilder().setName(‘profile’).setDescription(‘View profile’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’)),
new SlashCommandBuilder().setName(‘setwelcome’).setDescription(‘Set welcome channel’).addChannelOption(o=>o.setName(‘channel’).setDescription(‘Channel’).setRequired(true)).addStringOption(o=>o.setName(‘message’).setDescription(‘Message’)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
new SlashCommandBuilder().setName(‘antilink’).setDescription(‘Toggle anti-link’).addStringOption(o=>o.setName(‘toggle’).setDescription(‘on/off’).setRequired(true).addChoices({name:‘on’,value:‘on’},{name:‘off’,value:‘off’})).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
new SlashCommandBuilder().setName(‘antispam’).setDescription(‘Toggle anti-spam’).addStringOption(o=>o.setName(‘toggle’).setDescription(‘on/off’).setRequired(true).addChoices({name:‘on’,value:‘on’},{name:‘off’,value:‘off’})).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
new SlashCommandBuilder().setName(‘help’).setDescription(‘Show all commands’),
];

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.MessageContent] });
const xpCooldowns = new Map();
const spamTracker = new Map();

client.once(‘ready’, async () => {
console.log(‘Bot is online: ’ + client.user.tag);
client.user.setActivity(’/help | Discord Bot’);
const rest = new REST({ version: ‘10’ }).setToken(process.env.TOKEN);
try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(c=>c.toJSON()) }); console.log(‘Commands registered!’); }
catch(e) { console.error(e); }
});

client.on(‘guildMemberAdd’, async (member) => {
try {
const g = await getGuild(member.guild.id);
if (!g.welcomeChannel) return;
const ch = member.guild.channels.cache.get(g.welcomeChannel);
if (!ch) return;
const msg = g.welcomeMessage.replace(’{user}’,’<@’+member.id+’>’).replace(’{username}’,member.user.username).replace(’{server}’,member.guild.name).replace(’{membercount}’,member.guild.memberCount);
ch.send({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle(‘Welcome to ‘+member.guild.name+’!’).setDescription(msg).setThumbnail(member.user.displayAvatarURL()).setTimestamp()] });
} catch(e) { console.error(e); }
});

client.on(‘messageCreate’, async (message) => {
if (message.author.bot || !message.guild) return;
try {
const g = await getGuild(message.guild.id);
if (g.antiLink && /(https?://|discord.gg/)/i.test(message.content) && !message.member.permissions.has(‘ManageMessages’)) {
await message.delete().catch(()=>{});
const w = await message.channel.send({ embeds: [emb(YELLOW,‘No Links!’,’<@’+message.author.id+’> Links are not allowed!’)] });
setTimeout(()=>w.delete().catch(()=>{}),5000); return;
}
if (g.antiSpam) {
const key = message.author.id+’-’+message.guild.id, now = Date.now(), data = spamTracker.get(key)||{count:0,last:0};
data.count = now-data.last<3000?data.count+1:1; data.last=now; spamTracker.set(key,data);
if (data.count>=5) { await message.member.timeout(60000,‘Anti-spam’).catch(()=>{}); message.channel.send({embeds:[emb(RED,‘Anti-Spam’,’<@’+message.author.id+’> muted for spamming!’)]}); data.count=0; }
}
if (!g.xpEnabled) return;
const xpKey = message.author.id+’-’+message.guild.id;
if (xpCooldowns.has(xpKey)) return;
xpCooldowns.set(xpKey,true); setTimeout(()=>xpCooldowns.delete(xpKey),60000);
const user = await getUser(message.author.id,message.guild.id);
user.xp += Math.floor(Math.random()*10+15); user.messages+=1;
if (user.xp>=xpForLevel(user.level+1)) { user.level+=1; message.channel.send({embeds:[emb(BLUE,‘Level Up!’,‘Congrats <@’+message.author.id+’>! You reached Level ‘+user.level+’!’)]}); }
await user.save();
} catch(e) { console.error(e); }
});

client.on(‘interactionCreate’, async (interaction) => {
if (!interaction.isChatInputCommand()) return;
const cmd = interaction.commandName;
try {
if (cmd===‘ban’) {
const t=interaction.options.getMember(‘user’), reason=interaction.options.getString(‘reason’)||‘No reason’, dur=parseDuration(interaction.options.getString(‘duration’));
if (!t||!t.bannable) return interaction.reply({embeds:[emb(RED,‘Error’,‘Cannot ban this user.’)],ephemeral:true});
await t.user.send({embeds:[emb(RED,‘Banned from ‘+interaction.guild.name,‘Reason: ‘+reason)]}).catch(()=>{});
await t.ban({reason}); if(dur) setTimeout(()=>interaction.guild.members.unban(t.id).catch(()=>{}),dur);
await interaction.reply({embeds:[emb(RED,‘Member Banned’,‘User: ‘+t.user.tag+’\nReason: ‘+reason+’\nDuration: ‘+(dur?formatDur(dur):‘Permanent’))]});
} else if (cmd===‘kick’) {
const t=interaction.options.getMember(‘user’), reason=interaction.options.getString(‘reason’)||‘No reason’;
if (!t||!t.kickable) return interaction.reply({embeds:[emb(RED,‘Error’,‘Cannot kick.’)],ephemeral:true});
await t.user.send({embeds:[emb(YELLOW,‘Kicked’,‘Reason: ‘+reason)]}).catch(()=>{}); await t.kick(reason);
await interaction.reply({embeds:[emb(YELLOW,‘Member Kicked’,‘User: ‘+t.user.tag+’\nReason: ‘+reason)]});
} else if (cmd===‘mute’) {
const t=interaction.options.getMember(‘user’), dur=parseDuration(interaction.options.getString(‘duration’)), reason=interaction.options.getString(‘reason’)||‘No reason’;
if (!dur||dur>2419200000) return interaction.reply({embeds:[emb(RED,‘Error’,‘Invalid duration.’)],ephemeral:true});
if (!t||!t.moderatable) return interaction.reply({embeds:[emb(RED,‘Error’,‘Cannot timeout.’)],ephemeral:true});
await t.timeout(dur,reason);
await interaction.reply({embeds:[emb(YELLOW,‘Muted’,‘User: ‘+t.user.tag+’\nDuration: ‘+formatDur(dur)+’\nReason: ‘+reason)]});
} else if (cmd===‘unmute’) {
const t=interaction.options.getMember(‘user’); await t.timeout(null);
await interaction.reply({embeds:[emb(GREEN,‘Unmuted’,‘User: ‘+t.user.tag)]});
} else if (cmd===‘warn’) {
const t=interaction.options.getMember(‘user’), reason=interaction.options.getString(‘reason’), warnId=genId();
await Warning.create({userId:t.id,guildId:interaction.guild.id,moderatorId:interaction.user.id,reason,warnId});
const total=await Warning.countDocuments({userId:t.id,guildId:interaction.guild.id});
await t.user.send({embeds:[emb(YELLOW,‘Warning’,‘Reason: ‘+reason+’\nTotal: ‘+total+’\nID: ‘+warnId)]}).catch(()=>{});
await interaction.reply({embeds:[emb(YELLOW,‘Warning Issued’,‘User: ‘+t.user.tag+’\nReason: ‘+reason+’\nTotal: ‘+total+’\nID: ‘+warnId)]});
} else if (cmd===‘warnings’) {
const t=interaction.options.getUser(‘user’)||interaction.user;
const warns=await Warning.find({userId:t.id,guildId:interaction.guild.id}).sort({createdAt:-1}).limit(10);
if (!warns.length) return interaction.reply({embeds:[emb(GREEN,‘No Warnings’,t.tag+’ has no warnings.’)]});
await interaction.reply({embeds:[emb(YELLOW,‘Warnings - ‘+t.tag,warns.map((w,i)=>(i+1)+’. ‘+w.warnId+’ - ‘+w.reason).join(’\n’))]});
} else if (cmd===‘clear’) {
const amount=interaction.options.getInteger(‘amount’);
await interaction.deferReply({ephemeral:true});
const msgs=[…(await interaction.channel.messages.fetch({limit:amount})).values()].filter(m=>Date.now()-m.createdTimestamp<1209600000);
const deleted=await interaction.channel.bulkDelete(msgs,true);
await interaction.editReply({embeds:[emb(GREEN,‘Cleared’,‘Deleted ‘+deleted.size+’ messages.’)]});
} else if (cmd===‘lock’) {
await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone,{SendMessages:false});
await interaction.reply({embeds:[emb(RED,‘Locked’,interaction.channel.name+’ has been locked.’)]});
} else if (cmd===‘unlock’) {
await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone,{SendMessages:null});
await interaction.reply({embeds:[emb(GREEN,‘Unlocked’,interaction.channel.name+’ has been unlocked.’)]});
} else if (cmd===‘slowmode’) {
const s=interaction.options.getInteger(‘seconds’); await interaction.channel.setRateLimitPerUser(s);
await interaction.reply({embeds:[emb(YELLOW,‘Slowmode’,s===0?‘Disabled.’:‘Set to ‘+s+’ seconds.’)]});
} else if (cmd===‘rank’) {
const t=interaction.options.getUser(‘user’)||interaction.user, u=await getUser(t.id,interaction.guild.id);
const all=await User.find({guildId:interaction.guild.id}).sort({xp:-1}), rank=all.findIndex(x=>x.userId===t.id)+1;
await interaction.reply({embeds:[new EmbedBuilder().setColor(BLUE).setTitle(‘Rank - ‘+t.username).setThumbnail(t.displayAvatarURL()).addFields({name:‘Rank’,value:’#’+rank,inline:true},{name:‘Level’,value:’’+u.level,inline:true},{name:‘XP’,value:u.xp+’/’+xpForLevel(u.level+1),inline:true}).setTimestamp()]});
} else if (cmd===‘top’) {
const top=await User.find({guildId:interaction.guild.id}).sort({xp:-1}).limit(10);
const lines=await Promise.all(top.map(async(u,i)=>{try{const usr=await client.users.fetch(u.userId);return(i+1)+’. ‘+usr.username+’ - Lv.’+u.level+’ (’+u.xp+’ XP)’;}catch{return(i+1)+’. Unknown - Lv.’+u.level;}}));
await interaction.reply({embeds:[emb(BLUE,‘Leaderboard’,lines.join(’\n’)||‘No data.’)]});
} else if (cmd===‘setxp’) {
const t=interaction.options.getUser(‘user’), a=interaction.options.getInteger(‘amount’);
await User.findOneAndUpdate({userId:t.id,guildId:interaction.guild.id},{xp:a},{upsert:true});
await interaction.reply({embeds:[emb(GREEN,‘XP Set’,t.tag+’ XP set to ‘+a)]});
} else if (cmd===‘setlevel’) {
const t=interaction.options.getUser(‘user’), l=interaction.options.getInteger(‘level’);
await User.findOneAndUpdate({userId:t.id,guildId:interaction.guild.id},{level:l,xp:xpForLevel(l)},{upsert:true});
await interaction.reply({embeds:[emb(GREEN,‘Level Set’,t.tag+’ level set to ‘+l)]});
} else if (cmd===‘user’) {
const t=interaction.options.getUser(‘user’)||interaction.user, mb=await interaction.guild.members.fetch(t.id).catch(()=>null);
const e=new EmbedBuilder().setColor(BLUE).setTitle(‘User - ‘+t.username).setThumbnail(t.displayAvatarURL()).addFields({name:‘ID’,value:t.id,inline:true},{name:‘Created’,value:’<t:’+Math.floor(t.createdTimestamp/1000)+’:R>’,inline:true});
if(mb) e.addFields({name:‘Joined’,value:’<t:’+Math.floor(mb.joinedTimestamp/1000)+’:R>’,inline:true});
await interaction.reply({embeds:[e.setTimestamp()]});
} else if (cmd===‘avatar’) {
const t=interaction.options.getUser(‘user’)||interaction.user;
await interaction.reply({embeds:[new EmbedBuilder().setColor(BLUE).setTitle(‘Avatar - ‘+t.username).setImage(t.displayAvatarURL({size:4096})).setTimestamp()]});
} else if (cmd===‘server’) {
const g=interaction.guild;
await interaction.reply({embeds:[new EmbedBuilder().setColor(BLUE).setTitle(‘Server - ‘+g.name).setThumbnail(g.iconURL()).addFields({name:‘Owner’,value:’<@’+g.ownerId+’>’,inline:true},{name:‘Members’,value:’’+g.memberCount,inline:true},{name:‘Channels’,value:’’+g.channels.cache.size,inline:true},{name:‘Roles’,value:’’+g.roles.cache.size,inline:true}).setTimestamp()]});
} else if (cmd===‘roles’) {
const roles=interaction.guild.roles.cache.sort((a,b)=>b.position-a.position).filter(r=>r.id!==interaction.guild.id);
await interaction.reply({embeds:[emb(BLUE,‘Roles’,roles.map(r=>r.toString()).join(’, ‘).slice(0,4000))]});
} else if (cmd===‘roll’) {
const s=interaction.options.getInteger(‘sides’)||6;
await interaction.reply({embeds:[emb(BLUE,‘Dice Roll’,‘You rolled ‘+(Math.floor(Math.random()*s)+1)+’ out of ‘+s+’!’)]});
} else if (cmd===‘rep’) {
const t=interaction.options.getUser(‘user’);
if(t.id===interaction.user.id) return interaction.reply({embeds:[emb(RED,‘Error’,‘Cannot rep yourself!’)],ephemeral:true});
const giver=await getUser(interaction.user.id,interaction.guild.id), now=new Date();
if(giver.lastRep&&now-giver.lastRep<86400000){const h=Math.ceil((86400000-(now-giver.lastRep))/3600000);return interaction.reply({embeds:[emb(YELLOW,‘Cooldown’,‘Try again in ‘+h+’ hour(s).’)],ephemeral:true});}
const recv=await getUser(t.id,interaction.guild.id); recv.reputation+=1; await recv.save(); giver.lastRep=now; await giver.save();
await interaction.reply({embeds:[emb(GREEN,‘Rep Given’,t.username+’ now has ‘+recv.reputation+’ rep!’)]});
} else if (cmd===‘credits’) {
const t=interaction.options.getUser(‘user’)||interaction.user, u=await getUser(t.id,interaction.guild.id);
await interaction.reply({embeds:[emb(BLUE,‘Credits’,t.username+’ has ‘+u.credits+’ credits.’)]});
} else if (cmd===‘profile’) {
const t=interaction.options.getUser(‘user’)||interaction.user, u=await getUser(t.id,interaction.guild.id);
await interaction.reply({embeds:[new EmbedBuilder().setColor(BLUE).setTitle(‘Profile - ‘+t.username).setThumbnail(t.displayAvatarURL()).addFields({name:‘Level’,value:’’+u.level,inline:true},{name:‘XP’,value:’’+u.xp,inline:true},{name:‘Credits’,value:’’+u.credits,inline:true},{name:‘Rep’,value:’’+u.reputation,inline:true},{name:‘Messages’,value:’’+u.messages,inline:true}).setTimestamp()]});
} else if (cmd===‘setwelcome’) {
const ch=interaction.options.getChannel(‘channel’), msg=interaction.options.getString(‘message’)||‘Welcome {user} to {server}!’;
await Guild.findOneAndUpdate({guildId:interaction.guild.id},{welcomeChannel:ch.id,welcomeMessage:msg},{upsert:true});
await interaction.reply({embeds:[emb(GREEN,‘Welcome Set’,‘Channel: <#’+ch.id+’>’)]});
} else if (cmd===‘antilink’) {
const on=interaction.options.getString(‘toggle’)===‘on’;
await Guild.findOneAndUpdate({guildId:interaction.guild.id},{antiLink:on},{upsert:true});
await interaction.reply({embeds:[emb(on?GREEN:RED,‘Anti-Link ‘+(on?‘ON’:‘OFF’),‘Anti-link is now ‘+(on?‘enabled’:‘disabled’)+’.’)]});
} else if (cmd===‘antispam’) {
const on=interaction.options.getString(‘toggle’)===‘on’;
await Guild.findOneAndUpdate({guildId:interaction.guild.id},{antiSpam:on},{upsert:true});
await interaction.reply({embeds:[emb(on?GREEN:RED,‘Anti-Spam ‘+(on?‘ON’:‘OFF’),‘Anti-spam is now ‘+(on?‘enabled’:‘disabled’)+’.’)]});
} else if (cmd===‘help’) {
await interaction.reply({embeds:[new EmbedBuilder().setColor(BLUE).setTitle(‘All Commands’).addFields({name:‘Moderation’,value:’/ban /kick /mute /unmute /warn /warnings /clear /lock /unlock /slowmode’},{name:‘Leveling’,value:’/rank /top /setxp /setlevel /profile’},{name:‘Info’,value:’/user /avatar /server /roles’},{name:‘General’,value:’/roll /rep /credits’},{name:‘Config’,value:’/setwelcome /antilink /antispam’}).setTimestamp()]});
}
} catch(err) {
console.error(err);
const msg={embeds:[emb(RED,‘Error’,err.message)],ephemeral:true};
if(interaction.replied||interaction.deferred) await interaction.followUp(msg); else await interaction.reply(msg);
}
});

mongoose.connect(process.env.MONGO_URI)
.then(()=>{ console.log(‘MongoDB connected!’); client.login(process.env.TOKEN); })
.catch(err=>{ console.error(’MongoDB error: ’+err.message); client.login(process.env.TOKEN); });
