require(‘dotenv’).config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, REST, Routes, Collection } = require(‘discord.js’);
const mongoose = require(‘mongoose’);
const http = require(‘http’);

// ─── KEEP ALIVE (for Render) ─────────────────────────────────────────────────
http.createServer((req, res) => res.end(‘Bot is alive!’)).listen(process.env.PORT || 3000);

// ─── DATABASE MODELS ─────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
userId: String, guildId: String,
xp: { type: Number, default: 0 },
level: { type: Number, default: 0 },
credits: { type: Number, default: 0 },
reputation: { type: Number, default: 0 },
lastRep: { type: Date, default: null },
messages: { type: Number, default: 0 },
});
userSchema.index({ userId: 1, guildId: 1 }, { unique: true });

const warnSchema = new mongoose.Schema({
userId: String, guildId: String,
moderatorId: String, reason: String,
warnId: String,
}, { timestamps: true });

const guildSchema = new mongoose.Schema({
guildId: { type: String, unique: true },
welcomeChannel: { type: String, default: null },
welcomeMessage: { type: String, default: ‘Welcome {user} to **{server}**! 🎉’ },
logChannel: { type: String, default: null },
antiLink: { type: Boolean, default: false },
antiSpam: { type: Boolean, default: false },
xpEnabled: { type: Boolean, default: true },
});

const User    = mongoose.model(‘User’, userSchema);
const Warning = mongoose.model(‘Warning’, warnSchema);
const Guild   = mongoose.model(‘Guild’, guildSchema);

// ─── HELPERS ─────────────────────────────────────────────────────────────────
async function getUser(userId, guildId) {
return await User.findOneAndUpdate({ userId, guildId }, {}, { upsert: true, new: true, setDefaultsOnInsert: true });
}
async function getGuild(guildId) {
return await Guild.findOneAndUpdate({ guildId }, {}, { upsert: true, new: true, setDefaultsOnInsert: true });
}
function xpForLevel(level) { return 100 * (level ** 2) + 100 * level; }
function genId() { return Math.random().toString(36).slice(2, 10).toUpperCase(); }
function parseDuration(str) {
if (!str) return null;
const m = str.match(/^(\d+)(s|m|h|d)$/i);
if (!m) return null;
return parseInt(m[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2].toLowerCase()];
}
function formatDur(ms) {
if (!ms) return ‘Permanent’;
const d = Math.floor(ms/86400000), h = Math.floor(ms%86400000/3600000),
m = Math.floor(ms%3600000/60000), s = Math.floor(ms%60000/1000);
return [d&&`${d}d`,h&&`${h}h`,m&&`${m}m`,s&&`${s}s`].filter(Boolean).join(’ ’);
}
const C = { blue:0x5865f2, green:0x23a559, red:0xf23f43, yellow:0xf0b232, cyan:0x00aff4 };
function emb(color, title, desc) {
const e = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();
if (desc) e.setDescription(desc);
return e;
}

// ─── SLASH COMMANDS ───────────────────────────────────────────────────────────
const commands = [
// MODERATION
new SlashCommandBuilder().setName(‘ban’).setDescription(‘Ban a member’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’).setRequired(true)).addStringOption(o=>o.setName(‘reason’).setDescription(‘Reason’)).addStringOption(o=>o.setName(‘duration’).setDescription(‘Duration e.g. 7d’)).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
new SlashCommandBuilder().setName(‘unban’).setDescription(‘Unban a user’).addStringOption(o=>o.setName(‘userid’).setDescription(‘User ID’).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
new SlashCommandBuilder().setName(‘kick’).setDescription(‘Kick a member’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’).setRequired(true)).addStringOption(o=>o.setName(‘reason’).setDescription(‘Reason’)).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
new SlashCommandBuilder().setName(‘mute’).setDescription(‘Timeout a member’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’).setRequired(true)).addStringOption(o=>o.setName(‘duration’).setDescription(‘Duration e.g. 10m, 1h’).setRequired(true)).addStringOption(o=>o.setName(‘reason’).setDescription(‘Reason’)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
new SlashCommandBuilder().setName(‘unmute’).setDescription(‘Remove timeout from member’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
new SlashCommandBuilder().setName(‘warn’).setDescription(‘Warn a member’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’).setRequired(true)).addStringOption(o=>o.setName(‘reason’).setDescription(‘Reason’).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
new SlashCommandBuilder().setName(‘warnings’).setDescription(‘View warnings for a user’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
new SlashCommandBuilder().setName(‘warn_remove’).setDescription(‘Remove a warning’).addStringOption(o=>o.setName(‘warnid’).setDescription(‘Warn ID or “all”’).setRequired(true)).addUserOption(o=>o.setName(‘user’).setDescription(‘User’)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
new SlashCommandBuilder().setName(‘clear’).setDescription(‘Delete messages’).addIntegerOption(o=>o.setName(‘amount’).setDescription(‘Amount 1-100’).setRequired(true).setMinValue(1).setMaxValue(100)).addUserOption(o=>o.setName(‘user’).setDescription(‘Filter by user’)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
new SlashCommandBuilder().setName(‘lock’).setDescription(‘Lock a channel’).addChannelOption(o=>o.setName(‘channel’).setDescription(‘Channel’)).addStringOption(o=>o.setName(‘reason’).setDescription(‘Reason’)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
new SlashCommandBuilder().setName(‘unlock’).setDescription(‘Unlock a channel’).addChannelOption(o=>o.setName(‘channel’).setDescription(‘Channel’)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
new SlashCommandBuilder().setName(‘slowmode’).setDescription(‘Set slowmode’).addIntegerOption(o=>o.setName(‘seconds’).setDescription(‘Seconds (0 to disable)’).setRequired(true).setMinValue(0).setMaxValue(21600)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
new SlashCommandBuilder().setName(‘setnick’).setDescription(‘Change a member nickname’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’).setRequired(true)).addStringOption(o=>o.setName(‘nickname’).setDescription(‘New nickname’)).setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
// LEVELING
new SlashCommandBuilder().setName(‘rank’).setDescription(‘View rank card’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’)),
new SlashCommandBuilder().setName(‘top’).setDescription(‘View leaderboard’),
new SlashCommandBuilder().setName(‘setxp’).setDescription(‘Set user XP’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’).setRequired(true)).addIntegerOption(o=>o.setName(‘amount’).setDescription(‘XP amount’).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
new SlashCommandBuilder().setName(‘setlevel’).setDescription(‘Set user level’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’).setRequired(true)).addIntegerOption(o=>o.setName(‘level’).setDescription(‘Level’).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
// INFO
new SlashCommandBuilder().setName(‘user’).setDescription(‘View user info’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’)),
new SlashCommandBuilder().setName(‘avatar’).setDescription(‘Get user avatar’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’)),
new SlashCommandBuilder().setName(‘server’).setDescription(‘View server info’),
new SlashCommandBuilder().setName(‘roles’).setDescription(‘View all server roles’),
// GENERAL
new SlashCommandBuilder().setName(‘roll’).setDescription(‘Roll a dice’).addIntegerOption(o=>o.setName(‘sides’).setDescription(‘Number of sides (default 6)’).setMinValue(2).setMaxValue(1000)),
new SlashCommandBuilder().setName(‘rep’).setDescription(‘Give reputation to a user’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’).setRequired(true)),
new SlashCommandBuilder().setName(‘credits’).setDescription(‘View credits balance’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’)),
new SlashCommandBuilder().setName(‘profile’).setDescription(‘View profile’).addUserOption(o=>o.setName(‘user’).setDescription(‘User’)),
// CONFIG
new SlashCommandBuilder().setName(‘setwelcome’).setDescription(‘Set welcome channel’).addChannelOption(o=>o.setName(‘channel’).setDescription(‘Channel’).setRequired(true)).addStringOption(o=>o.setName(‘message’).setDescription(‘Message (use {user}, {server}, {membercount})’)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
new SlashCommandBuilder().setName(‘setlog’).setDescription(‘Set log channel’).addChannelOption(o=>o.setName(‘channel’).setDescription(‘Channel’).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
new SlashCommandBuilder().setName(‘antilink’).setDescription(‘Toggle anti-link’).addStringOption(o=>o.setName(‘toggle’).setDescription(‘on or off’).setRequired(true).addChoices({name:‘on’,value:‘on’},{name:‘off’,value:‘off’})).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
new SlashCommandBuilder().setName(‘antispam’).setDescription(‘Toggle anti-spam’).addStringOption(o=>o.setName(‘toggle’).setDescription(‘on or off’).setRequired(true).addChoices({name:‘on’,value:‘on’},{name:‘off’,value:‘off’})).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
new SlashCommandBuilder().setName(‘help’).setDescription(‘Show all commands’),
];

// ─── CLIENT ──────────────────────────────────────────────────────────────────
const client = new Client({
intents: [
GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates,
GatewayIntentBits.MessageContent,
],
});

const xpCooldowns = new Map();
const spamTracker = new Map();

// ─── READY ────────────────────────────────────────────────────────────────────
client.once(‘ready’, async () => {
console.log(`✅ ${client.user.tag} is online!`);
client.user.setActivity(’/help | ProBot Clone’, { type: 3 });

// Register slash commands
const rest = new REST({ version: ‘10’ }).setToken(process.env.TOKEN);
try {
await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(c => c.toJSON()) });
console.log(‘✅ Slash commands registered!’);
} catch (e) { console.error(‘Command registration error:’, e); }
});

// ─── WELCOME ──────────────────────────────────────────────────────────────────
client.on(‘guildMemberAdd’, async (member) => {
const guildData = await getGuild(member.guild.id);
if (!guildData.welcomeChannel) return;
const ch = member.guild.channels.cache.get(guildData.welcomeChannel);
if (!ch) return;
const msg = (guildData.welcomeMessage)
.replace(’{user}’, `<@${member.id}>`)
.replace(’{username}’, member.user.username)
.replace(’{server}’, member.guild.name)
.replace(’{membercount}’, member.guild.memberCount);
ch.send({ embeds: [new EmbedBuilder().setColor(C.blue).setTitle(`👋 Welcome to ${member.guild.name}!`).setDescription(msg).setThumbnail(member.user.displayAvatarURL()).addFields({name:‘👤 Member’,value:`<@${member.id}>`,inline:true},{name:‘🔢 Member #’,value:`${member.guild.memberCount}`,inline:true}).setTimestamp()] });
});

// ─── MESSAGE XP + ANTI-SPAM + ANTI-LINK ──────────────────────────────────────
client.on(‘messageCreate’, async (message) => {
if (message.author.bot || !message.guild) return;
const guildData = await getGuild(message.guild.id);

// Anti-link
if (guildData.antiLink) {
if (/(https?://|discord.gg/)/i.test(message.content) && !message.member.permissions.has(‘ManageMessages’)) {
await message.delete().catch(()=>{});
const w = await message.channel.send({ embeds: [emb(C.yellow,‘🔗 Links Not Allowed’,`<@${message.author.id}> Links are not allowed here!`)] });
setTimeout(() => w.delete().catch(()=>{}), 5000);
return;
}
}

// Anti-spam
if (guildData.antiSpam) {
const key = `${message.author.id}-${message.guild.id}`;
const now = Date.now();
const data = spamTracker.get(key) || { count: 0, last: 0 };
if (now - data.last < 3000) { data.count++; } else { data.count = 1; }
data.last = now;
spamTracker.set(key, data);
if (data.count >= 5) {
await message.member.timeout(60000, ‘Auto-mute: Spam’).catch(()=>{});
message.channel.send({ embeds: [emb(C.red,‘🛡️ Anti-Spam’,`<@${message.author.id}> was timed out for spamming!`)] });
data.count = 0;
}
}

// XP
if (!guildData.xpEnabled) return;
const xpKey = `${message.author.id}-${message.guild.id}`;
if (xpCooldowns.has(xpKey)) return;
xpCooldowns.set(xpKey, true);
setTimeout(() => xpCooldowns.delete(xpKey), 60000);

const user = await getUser(message.author.id, message.guild.id);
user.xp += Math.floor(Math.random() * 10 + 15);
user.messages += 1;
const needed = xpForLevel(user.level + 1);
if (user.xp >= needed) {
user.level += 1;
message.channel.send({ embeds: [emb(C.blue,‘⭐ Level Up!’,`🎉 <@${message.author.id}> reached **Level ${user.level}**!`)] });
}
await user.save();
});

// ─── SLASH COMMAND HANDLER ────────────────────────────────────────────────────
client.on(‘interactionCreate’, async (interaction) => {
if (!interaction.isChatInputCommand()) return;
const { commandName } = interaction;

try {
// ── MODERATION ────────────────────────────────────────────────────────────
if (commandName === ‘ban’) {
const target = interaction.options.getMember(‘user’);
const reason = interaction.options.getString(‘reason’) || ‘No reason provided’;
const durStr = interaction.options.getString(‘duration’);
const dur = parseDuration(durStr);
if (!target?.bannable) return interaction.reply({ embeds: [emb(C.red,‘❌ Error’,‘Cannot ban this user.’)], ephemeral:true });
await target.user.send({ embeds: [emb(C.red,`🔨 Banned from ${interaction.guild.name}`,`**Reason:** ${reason}\n**Duration:** ${dur?formatDur(dur):'Permanent'}`)] }).catch(()=>{});
await target.ban({ reason });
if (dur) setTimeout(() => interaction.guild.members.unban(target.id).catch(()=>{}), dur);
await interaction.reply({ embeds: [emb(C.red,‘🔨 Member Banned’,`**User:** ${target.user.tag}\n**Reason:** ${reason}\n**Duration:** ${dur?formatDur(dur):'Permanent'}\n**Moderator:** ${interaction.user.tag}`)] });
}

```
else if (commandName === 'unban') {
  const userId = interaction.options.getString('userid');
  await interaction.guild.members.unban(userId);
  await interaction.reply({ embeds: [emb(C.green,'✅ Member Unbanned',`**User ID:** ${userId}\n**Moderator:** ${interaction.user.tag}`)] });
}

else if (commandName === 'kick') {
  const target = interaction.options.getMember('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';
  if (!target?.kickable) return interaction.reply({ embeds: [emb(C.red,'❌ Error','Cannot kick this user.')], ephemeral:true });
  await target.user.send({ embeds: [emb(C.yellow,`👢 Kicked from ${interaction.guild.name}`,`**Reason:** ${reason}`)] }).catch(()=>{});
  await target.kick(reason);
  await interaction.reply({ embeds: [emb(C.yellow,'👢 Member Kicked',`**User:** ${target.user.tag}\n**Reason:** ${reason}\n**Moderator:** ${interaction.user.tag}`)] });
}

else if (commandName === 'mute') {
  const target = interaction.options.getMember('user');
  const durStr = interaction.options.getString('duration');
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const dur = parseDuration(durStr);
  if (!dur || dur > 2419200000) return interaction.reply({ embeds: [emb(C.red,'❌ Error','Invalid duration. Max 28d. Example: 10m, 1h, 7d')], ephemeral:true });
  if (!target?.moderatable) return interaction.reply({ embeds: [emb(C.red,'❌ Error','Cannot timeout this user.')], ephemeral:true });
  await target.timeout(dur, reason);
  await interaction.reply({ embeds: [emb(C.yellow,'🔇 Member Muted',`**User:** ${target.user.tag}\n**Duration:** ${formatDur(dur)}\n**Reason:** ${reason}\n**Moderator:** ${interaction.user.tag}`)] });
}

else if (commandName === 'unmute') {
  const target = interaction.options.getMember('user');
  await target.timeout(null);
  await interaction.reply({ embeds: [emb(C.green,'🔊 Member Unmuted',`**User:** ${target.user.tag}\n**Moderator:** ${interaction.user.tag}`)] });
}

else if (commandName === 'warn') {
  const target = interaction.options.getMember('user');
  const reason = interaction.options.getString('reason');
  const warnId = genId();
  await Warning.create({ userId: target.id, guildId: interaction.guild.id, moderatorId: interaction.user.id, reason, warnId });
  const total = await Warning.countDocuments({ userId: target.id, guildId: interaction.guild.id });
  await target.user.send({ embeds: [emb(C.yellow,`⚠️ Warning in ${interaction.guild.name}`,`**Reason:** ${reason}\n**Total Warnings:** ${total}\n**Warn ID:** \`${warnId}\``)] }).catch(()=>{});
  await interaction.reply({ embeds: [emb(C.yellow,'⚠️ Warning Issued',`**User:** ${target.user.tag}\n**Reason:** ${reason}\n**Total Warnings:** ${total}\n**Warn ID:** \`${warnId}\`\n**Moderator:** ${interaction.user.tag}`)] });
}

else if (commandName === 'warnings') {
  const target = interaction.options.getUser('user') || interaction.user;
  const warns = await Warning.find({ userId: target.id, guildId: interaction.guild.id }).sort({ createdAt: -1 }).limit(10);
  if (!warns.length) return interaction.reply({ embeds: [emb(C.green,'✅ No Warnings',`**${target.tag}** has no warnings.`)] });
  const desc = warns.map((w,i) => `**${i+1}.** \`${w.warnId}\` — ${w.reason}\n> <@${w.moderatorId}> • <t:${Math.floor(new Date(w.createdAt)/1000)}:R>`).join('\n\n');
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(C.yellow).setTitle(`⚠️ Warnings — ${target.tag}`).setDescription(desc).setFooter({text:`${warns.length} warning(s)`}).setTimestamp()] });
}

else if (commandName === 'warn_remove') {
  const warnId = interaction.options.getString('warnid');
  const target = interaction.options.getUser('user');
  if (warnId === 'all' && target) {
    await Warning.deleteMany({ userId: target.id, guildId: interaction.guild.id });
    await interaction.reply({ embeds: [emb(C.green,'✅ Warnings Cleared',`All warnings cleared for **${target.tag}**`)] });
  } else {
    await Warning.deleteOne({ warnId, guildId: interaction.guild.id });
    await interaction.reply({ embeds: [emb(C.green,'✅ Warning Removed',`Warning \`${warnId}\` has been removed.`)] });
  }
}

else if (commandName === 'clear') {
  const amount = interaction.options.getInteger('amount');
  const user = interaction.options.getUser('user');
  await interaction.deferReply({ ephemeral: true });
  let msgs = [...(await interaction.channel.messages.fetch({ limit: 100 })).values()].slice(0, amount);
  if (user) msgs = msgs.filter(m => m.author.id === user.id);
  msgs = msgs.filter(m => Date.now() - m.createdTimestamp < 1209600000);
  const deleted = await interaction.channel.bulkDelete(msgs, true);
  await interaction.editReply({ embeds: [emb(C.green,'🗑️ Messages Cleared',`Deleted **${deleted.size}** message(s).`)] });
}

else if (commandName === 'lock') {
  const ch = interaction.options.getChannel('channel') || interaction.channel;
  const reason = interaction.options.getString('reason') || 'No reason provided';
  await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
  await interaction.reply({ embeds: [emb(C.red,'🔒 Channel Locked',`<#${ch.id}> has been locked.\n**Reason:** ${reason}\n**Moderator:** ${interaction.user.tag}`)] });
}

else if (commandName === 'unlock') {
  const ch = interaction.options.getChannel('channel') || interaction.channel;
  await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
  await interaction.reply({ embeds: [emb(C.green,'🔓 Channel Unlocked',`<#${ch.id}> has been unlocked.\n**Moderator:** ${interaction.user.tag}`)] });
}

else if (commandName === 'slowmode') {
  const seconds = interaction.options.getInteger('seconds');
  await interaction.channel.setRateLimitPerUser(seconds);
  await interaction.reply({ embeds: [emb(C.yellow,'⏱️ Slowmode Updated', seconds === 0 ? 'Slowmode **disabled**.' : `Slowmode set to **${seconds} second(s)**.\n**Moderator:** ${interaction.user.tag}`)] });
}

else if (commandName === 'setnick') {
  const target = interaction.options.getMember('user');
  const nick = interaction.options.getString('nickname') || null;
  await target.setNickname(nick);
  await interaction.reply({ embeds: [emb(C.blue,'✏️ Nickname Changed',`**User:** ${target.user.tag}\n**New Nickname:** ${nick || '*Removed*'}\n**Moderator:** ${interaction.user.tag}`)] });
}

// ── LEVELING ──────────────────────────────────────────────────────────────
else if (commandName === 'rank') {
  const target = interaction.options.getUser('user') || interaction.user;
  const member = await interaction.guild.members.fetch(target.id);
  const userData = await getUser(target.id, interaction.guild.id);
  const needed = xpForLevel(userData.level + 1);
  const allUsers = await User.find({ guildId: interaction.guild.id }).sort({ xp: -1 });
  const rank = allUsers.findIndex(u => u.userId === target.id) + 1;
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(C.blue).setTitle(`⭐ Rank — ${target.username}`).setThumbnail(target.displayAvatarURL()).addFields({name:'🏆 Rank',value:`**#${rank}**`,inline:true},{name:'📊 Level',value:`**${userData.level}**`,inline:true},{name:'✨ XP',value:`**${userData.xp.toLocaleString()}** / ${needed.toLocaleString()}`,inline:true},{name:'💬 Messages',value:`**${userData.messages}**`,inline:true}).setTimestamp()] });
}

else if (commandName === 'top') {
  const top = await User.find({ guildId: interaction.guild.id }).sort({ xp: -1 }).limit(10);
  const desc = (await Promise.all(top.map(async (u, i) => {
    try {
      const user = await client.users.fetch(u.userId);
      return `**${i+1}.** ${user.username} — Level **${u.level}** (${u.xp.toLocaleString()} XP)`;
    } catch { return `**${i+1}.** Unknown — Level **${u.level}**`; }
  }))).join('\n');
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(C.blue).setTitle('🏆 XP Leaderboard').setDescription(desc || 'No data yet.').setTimestamp()] });
}

else if (commandName === 'setxp') {
  const target = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');
  await User.findOneAndUpdate({ userId: target.id, guildId: interaction.guild.id }, { xp: amount }, { upsert: true });
  await interaction.reply({ embeds: [emb(C.green,'✅ XP Updated',`**${target.tag}**'s XP set to **${amount}**.`)] });
}

else if (commandName === 'setlevel') {
  const target = interaction.options.getUser('user');
  const level = interaction.options.getInteger('level');
  const xp = xpForLevel(level);
  await User.findOneAndUpdate({ userId: target.id, guildId: interaction.guild.id }, { level, xp }, { upsert: true });
  await interaction.reply({ embeds: [emb(C.green,'✅ Level Updated',`**${target.tag}**'s level set to **${level}**.`)] });
}

// ── INFO ──────────────────────────────────────────────────────────────────
else if (commandName === 'user') {
  const target = interaction.options.getUser('user') || interaction.user;
  const member = await interaction.guild.members.fetch(target.id).catch(()=>null);
  const e = new EmbedBuilder().setColor(C.blue).setTitle(`👤 User — ${target.username}`).setThumbnail(target.displayAvatarURL())
    .addFields(
      {name:'🏷️ Tag',value:target.tag,inline:true},
      {name:'🆔 ID',value:target.id,inline:true},
      {name:'🤖 Bot',value:target.bot?'Yes':'No',inline:true},
      {name:'🎂 Created',value:`<t:${Math.floor(target.createdTimestamp/1000)}:R>`,inline:true},
    );
  if (member) e.addFields({name:'📅 Joined Server',value:`<t:${Math.floor(member.joinedTimestamp/1000)}:R>`,inline:true},{name:'🎭 Top Role',value:`${member.roles.highest}`,inline:true});
  await interaction.reply({ embeds: [e.setTimestamp()] });
}

else if (commandName === 'avatar') {
  const target = interaction.options.getUser('user') || interaction.user;
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(C.blue).setTitle(`🖼️ Avatar — ${target.username}`).setImage(target.displayAvatarURL({size:4096})).setTimestamp()] });
}

else if (commandName === 'server') {
  const g = interaction.guild;
  await g.fetch();
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(C.blue).setTitle(`🏰 Server — ${g.name}`).setThumbnail(g.iconURL())
    .addFields(
      {name:'🆔 ID',value:g.id,inline:true},
      {name:'👑 Owner',value:`<@${g.ownerId}>`,inline:true},
      {name:'👥 Members',value:`${g.memberCount}`,inline:true},
      {name:'📅 Created',value:`<t:${Math.floor(g.createdTimestamp/1000)}:R>`,inline:true},
      {name:'💬 Channels',value:`${g.channels.cache.size}`,inline:true},
      {name:'🎭 Roles',value:`${g.roles.cache.size}`,inline:true},
      {name:'💎 Boost Level',value:`Level ${g.premiumTier}`,inline:true},
      {name:'🚀 Boosts',value:`${g.premiumSubscriptionCount}`,inline:true},
    ).setTimestamp()] });
}

else if (commandName === 'roles') {
  const roles = interaction.guild.roles.cache.sort((a,b) => b.position - a.position).filter(r => r.id !== interaction.guild.id);
  const desc = roles.map(r => `${r} — **${r.members.size}** members`).join('\n').slice(0,4000);
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(C.blue).setTitle('🎭 Server Roles').setDescription(desc||'No roles.').setFooter({text:`${roles.size} roles`}).setTimestamp()] });
}

// ── GENERAL ───────────────────────────────────────────────────────────────
else if (commandName === 'roll') {
  const sides = interaction.options.getInteger('sides') || 6;
  const result = Math.floor(Math.random() * sides) + 1;
  await interaction.reply({ embeds: [emb(C.blue,'🎲 Dice Roll',`You rolled a **${result}** out of **${sides}**!`)] });
}

else if (commandName === 'rep') {
  const target = interaction.options.getUser('user');
  if (target.id === interaction.user.id) return interaction.reply({ embeds: [emb(C.red,'❌ Error','You cannot give rep to yourself!')], ephemeral:true });
  const giver = await getUser(interaction.user.id, interaction.guild.id);
  const now = new Date();
  if (giver.lastRep && now - giver.lastRep < 86400000) {
    const next = Math.ceil((86400000 - (now - giver.lastRep)) / 3600000);
    return interaction.reply({ embeds: [emb(C.yellow,'⏱️ Cooldown',`You can give rep again in **${next} hour(s)**!`)], ephemeral:true });
  }
  const receiver = await getUser(target.id, interaction.guild.id);
  receiver.reputation += 1;
  await receiver.save();
  giver.lastRep = now;
  await giver.save();
  await interaction.reply({ embeds: [emb(C.green,'⭐ Reputation Given',`You gave a reputation point to **${target.username}**!\nThey now have **${receiver.reputation}** rep.`)] });
}

else if (commandName === 'credits') {
  const target = interaction.options.getUser('user') || interaction.user;
  const userData = await getUser(target.id, interaction.guild.id);
  await interaction.reply({ embeds: [emb(C.blue,'💳 Credits',`**${target.username}** has **${userData.credits.toLocaleString()}** credits.`)] });
}

else if (commandName === 'profile') {
  const target = interaction.options.getUser('user') || interaction.user;
  const userData = await getUser(target.id, interaction.guild.id);
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(C.blue).setTitle(`👤 Profile — ${target.username}`).setThumbnail(target.displayAvatarURL())
    .addFields(
      {name:'⭐ Level',value:`**${userData.level}**`,inline:true},
      {name:'✨ XP',value:`**${userData.xp.toLocaleString()}**`,inline:true},
      {name:'💳 Credits',value:`**${userData.credits.toLocaleString()}**`,inline:true},
      {name:'⭐ Reputation',value:`**${userData.reputation}**`,inline:true},
      {name:'💬 Messages',value:`**${userData.messages}**`,inline:true},
    ).setTimestamp()] });
}

// ── CONFIG ────────────────────────────────────────────────────────────────
else if (commandName === 'setwelcome') {
  const ch = interaction.options.getChannel('channel');
  const msg = interaction.options.getString('message') || 'Welcome {user} to **{server}**! 🎉';
  await Guild.findOneAndUpdate({ guildId: interaction.guild.id }, { welcomeChannel: ch.id, welcomeMessage: msg }, { upsert: true });
  await interaction.reply({ embeds: [emb(C.green,'✅ Welcome Set',`Welcome channel set to <#${ch.id}>\n**Message:** ${msg}`)] });
}

else if (commandName === 'setlog') {
  const ch = interaction.options.getChannel('channel');
  await Guild.findOneAndUpdate({ guildId: interaction.guild.id }, { logChannel: ch.id }, { upsert: true });
  await interaction.reply({ embeds: [emb(C.green,'✅ Log Channel Set',`Log channel set to <#${ch.id}>`)] });
}

else if (commandName === 'antilink') {
  const toggle = interaction.options.getString('toggle') === 'on';
  await Guild.findOneAndUpdate({ guildId: interaction.guild.id }, { antiLink: toggle }, { upsert: true });
  await interaction.reply({ embeds: [emb(toggle?C.green:C.red,`🔗 Anti-Link ${toggle?'Enabled':'Disabled'}`,`Anti-link protection is now **${toggle?'on':'off'}**.`)] });
}

else if (commandName === 'antispam') {
  const toggle = interaction.options.getString('toggle') === 'on';
  await Guild.findOneAndUpdate({ guildId: interaction.guild.id }, { antiSpam: toggle }, { upsert: true });
  await interaction.reply({ embeds: [emb(toggle?C.green:C.red,`🛡️ Anti-Spam ${toggle?'Enabled':'Disabled'}`,`Anti-spam protection is now **${toggle?'on':'off'}**.`)] });
}

// ── HELP ──────────────────────────────────────────────────────────────────
else if (commandName === 'help') {
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(C.blue).setTitle('📚 All Commands')
    .addFields(
      {name:'🛡️ Moderation',value:'`/ban` `/unban` `/kick` `/mute` `/unmute` `/warn` `/warnings` `/warn_remove` `/clear` `/lock` `/unlock` `/slowmode` `/setnick`'},
      {name:'⭐ Leveling',value:'`/rank` `/top` `/setxp` `/setlevel` `/profile`'},
      {name:'ℹ️ Info',value:'`/user` `/avatar` `/server` `/roles`'},
      {name:'🌐 General',value:'`/roll` `/rep` `/credits`'},
      {name:'⚙️ Config',value:'`/setwelcome` `/setlog` `/antilink` `/antispam`'},
    ).setFooter({text:'[ ] = Required  ( ) = Optional'}).setTimestamp()] });
}
```

} catch (err) {
console.error(`Error in /${commandName}:`, err);
const msg = { embeds: [emb(C.red,‘❌ Error’,`Something went wrong: ${err.message}`)], ephemeral: true };
if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
else await interaction.reply(msg);
}
});

// ─── CONNECT DB & LOGIN ───────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
.then(() => { console.log(‘✅ MongoDB connected!’); client.login(process.env.TOKEN); })
.catch(err => { console.error(‘❌ MongoDB error:’, err.message); client.login(process.env.TOKEN); });
