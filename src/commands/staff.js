// src/commands/staff.js
const { SlashCommandBuilder } = require('discord.js');
const db = require('../database');
const { COLORS, getEmojis } = require('../utils/constants');
const { base, success, error } = require('../utils/embeds');
const { isAdmin, isStaff } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staff')
    .setDescription('Staff management commands')

    .addSubcommand(s => s
      .setName('add')
      .setDescription('[Admin] Add a staff member')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addStringOption(o => o.setName('role').setDescription('Staff role').setRequired(true)
        .addChoices(
          { name: '🛠️ Staff',   value: 'staff' },
          { name: '⚡ Booster', value: 'booster' },
          { name: '🎓 Coach',   value: 'coach' },
        ))
    )

    .addSubcommand(s => s
      .setName('remove')
      .setDescription('[Admin] Remove a staff member')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addStringOption(o => o.setName('role').setDescription('Role to remove').setRequired(true)
        .addChoices(
          { name: '🛠️ Staff',   value: 'staff' },
          { name: '⚡ Booster', value: 'booster' },
          { name: '🎓 Coach',   value: 'coach' },
        ))
    )

    .addSubcommand(s => s
      .setName('list')
      .setDescription('[Staff] List all staff members')
    )

    .addSubcommand(s => s
      .setName('stats')
      .setDescription('[Staff] View staff member statistics')
      .addUserOption(o => o.setName('user').setDescription('Staff member').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('log')
      .setDescription('[Admin] View staff action log')
      .addUserOption(o => o.setName('user').setDescription('Filter by staff').setRequired(false))
      .addIntegerOption(o => o.setName('limit').setDescription('Entries to show').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('ban')
      .setDescription('[Admin] Ban a user from services')
      .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Ban reason').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('unban')
      .setDescription('[Admin] Unban a user')
      .addUserOption(o => o.setName('user').setDescription('User to unban').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('note')
      .setDescription('[Staff] Add a note to a user profile')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addStringOption(o => o.setName('note').setDescription('Note to add').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('lookup')
      .setDescription('[Staff] Look up a user profile')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('panel')
      .setDescription('[Admin] Send staff panel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(false))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const em = getEmojis();
    await interaction.deferReply({ ephemeral: true });

    if (!isStaff(interaction.member))
      return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });

    try {
      const roleMap = {
        staff:   process.env.STAFF_ROLE_ID,
        booster: process.env.BOOSTER_ROLE_ID,
        coach:   process.env.BOOSTER_ROLE_ID,
      };

      if (sub === 'add') {
        if (!isAdmin(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Admin only.')] });
        const user = interaction.options.getUser('user');
        const role = interaction.options.getString('role');
        const roleId = roleMap[role];
        if (roleId) {
          const member = await interaction.guild.members.fetch(user.id).catch(() => null);
          if (member) await member.roles.add(roleId).catch(() => {});
        }
        await db.query(`INSERT INTO staff_actions (staff_id, action, target_id, details) VALUES ($1,'add_staff',$2,$3)`,
          [interaction.user.id, user.id, JSON.stringify({ role })]);
        return interaction.editReply({ embeds: [success('Staff Added', `${user} has been added as **${role}**!`)] });
      }

      if (sub === 'remove') {
        if (!isAdmin(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Admin only.')] });
        const user = interaction.options.getUser('user');
        const role = interaction.options.getString('role');
        const roleId = roleMap[role];
        if (roleId) {
          const member = await interaction.guild.members.fetch(user.id).catch(() => null);
          if (member) await member.roles.remove(roleId).catch(() => {});
        }
        return interaction.editReply({ embeds: [success('Role Removed', `${user}'s **${role}** role removed.`)] });
      }

      if (sub === 'list') {
        const staffRole = interaction.guild.roles.cache.get(process.env.STAFF_ROLE_ID);
        const boosterRole = interaction.guild.roles.cache.get(process.env.BOOSTER_ROLE_ID);
        const staffMembers = staffRole?.members.map(m => m.toString()).join(', ') || '*None*';
        const boosters = boosterRole?.members.map(m => m.toString()).join(', ') || '*None*';
        const embed = base(COLORS.INFO)
          .setTitle(`${em.STAFF} Staff Roster`)
          .addFields(
            { name: `🛠️ Staff (${staffRole?.members.size || 0})`,     value: staffMembers,  inline: false },
            { name: `⚡ Boosters (${boosterRole?.members.size || 0})`, value: boosters,      inline: false },
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'stats') {
        const target = interaction.options.getUser('user') || interaction.user;
        const [orders, sessions, vouches] = await Promise.all([
          db.query(`SELECT COUNT(*) as c, SUM(price) as rev FROM orders WHERE booster_id=$1 AND status='completed'`, [target.id]),
          db.query(`SELECT COUNT(*) as c FROM coaching_sessions WHERE coach_id=$1 AND status='completed'`, [target.id]),
          db.query(`SELECT COUNT(*) as c, AVG(rating) as avg FROM vouches WHERE booster_id=$1`, [target.id]),
        ]);
        const embed = base(COLORS.INFO)
          .setTitle(`${em.STATS} Staff Stats — ${target.username}`)
          .addFields(
            { name: 'Orders Completed', value: orders.rows[0].c || '0',         inline: true },
            { name: 'Revenue Generated',value: `€${parseFloat(orders.rows[0].rev||0).toFixed(2)}`, inline: true },
            { name: 'Sessions Coached', value: sessions.rows[0].c || '0',        inline: true },
            { name: 'Vouches',          value: vouches.rows[0].c || '0',         inline: true },
            { name: 'Avg Rating',       value: vouches.rows[0].avg ? `${parseFloat(vouches.rows[0].avg).toFixed(2)}/5` : 'N/A', inline: true },
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'log') {
        if (!isAdmin(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Admin only.')] });
        const user = interaction.options.getUser('user');
        const limit = interaction.options.getInteger('limit') || 15;
        const { rows } = await db.query(
          user
            ? `SELECT * FROM staff_actions WHERE staff_id=$1 ORDER BY created_at DESC LIMIT $2`
            : `SELECT * FROM staff_actions ORDER BY created_at DESC LIMIT $1`,
          user ? [user.id, limit] : [limit]
        );
        const embed = base(COLORS.INFO).setTitle(`${em.STAFF} Staff Log`)
          .setDescription(rows.length
            ? rows.map(l => `<@${l.staff_id}> — **${l.action}** ${l.target_id ? `→ <@${l.target_id}>` : ''} | <t:${Math.floor(new Date(l.created_at).getTime()/1000)}:R>`).join('\n')
            : '*No entries.*'
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'ban') {
        if (!isAdmin(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Admin only.')] });
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        await db.query(
          `INSERT INTO users (id, guild_id, username, banned, ban_reason) VALUES ($1,$2,$3,TRUE,$4)
           ON CONFLICT (id) DO UPDATE SET banned=TRUE, ban_reason=$4, updated_at=NOW()`,
          [user.id, interaction.guild.id, user.username, reason]
        );
        await db.query(`INSERT INTO staff_actions (staff_id, action, target_id, details) VALUES ($1,'ban',$2,$3)`,
          [interaction.user.id, user.id, JSON.stringify({ reason })]);
        return interaction.editReply({ embeds: [success('User Banned', `${user} has been banned from services.\n**Reason:** ${reason}`)] });
      }

      if (sub === 'unban') {
        if (!isAdmin(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Admin only.')] });
        const user = interaction.options.getUser('user');
        await db.query(`UPDATE users SET banned=FALSE, ban_reason=NULL, updated_at=NOW() WHERE id=$1`, [user.id]);
        return interaction.editReply({ embeds: [success('User Unbanned', `${user} has been unbanned.`)] });
      }

      if (sub === 'note') {
        const user = interaction.options.getUser('user');
        const note = interaction.options.getString('note');
        const timestamp = new Date().toISOString();
        await db.query(
          `INSERT INTO users (id, guild_id, username, notes) VALUES ($1,$2,$3,$4)
           ON CONFLICT (id) DO UPDATE SET notes=CONCAT(users.notes, E'\n', $4), updated_at=NOW()`,
          [user.id, interaction.guild.id, user.username, `[${timestamp}] ${interaction.user.tag}: ${note}`]
        );
        return interaction.editReply({ embeds: [success('Note Added', `Note added to ${user}'s profile.`)] });
      }

      if (sub === 'lookup') {
        const user = interaction.options.getUser('user');
        const [userRow, orderStats, vouchStats] = await Promise.all([
          db.query(`SELECT * FROM users WHERE id=$1`, [user.id]),
          db.query(`SELECT COUNT(*) as total, SUM(price) as spent, COUNT(*) FILTER(WHERE status='completed') as completed FROM orders WHERE user_id=$1`, [user.id]),
          db.query(`SELECT COUNT(*) as total, AVG(rating) as avg FROM vouches WHERE user_id=$1`, [user.id]),
        ]);
        const u = userRow.rows[0];
        const o = orderStats.rows[0];
        const v = vouchStats.rows[0];
        const embed = base(COLORS.INFO)
          .setTitle(`${em.PERSON} User Lookup — ${user.username}`)
          .setThumbnail(user.displayAvatarURL())
          .addFields(
            { name: 'User',          value: `${user}`,                                      inline: true },
            { name: 'Banned',        value: u?.banned ? `${em.BANNED} Yes` : '✅ No',       inline: true },
            { name: 'Total Orders',  value: o.total || '0',                                  inline: true },
            { name: 'Completed',     value: o.completed || '0',                              inline: true },
            { name: 'Total Spent',   value: `€${parseFloat(o.spent||0).toFixed(2)}`,         inline: true },
            { name: 'Vouches Left',  value: v.total || '0',                                  inline: true },
            { name: 'Ban Reason',    value: u?.ban_reason || '*None*',                        inline: false },
            { name: 'Staff Notes',   value: (u?.notes?.slice(0,500)) || '*None*',             inline: false },
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'panel') {
        if (!isAdmin(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Admin only.')] });
        const { staffPanel } = require('../panels');
        const ch = interaction.options.getChannel('channel') || interaction.channel;
        await ch.send(staffPanel());
        return interaction.editReply({ embeds: [success('Sent', `Staff panel sent to ${ch}`)] });
      }

    } catch (err) {
      console.error('[staff]', err);
      return interaction.editReply({ embeds: [error('Error', err.message)] });
    }
  },
};
