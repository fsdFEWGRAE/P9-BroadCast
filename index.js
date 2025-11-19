import express from "express";
import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder
} from "discord.js";
import fs from "fs";

// ====================== CONFIG ======================
const PREFIX = "+";
const OWNER_ID = process.env.OWNER_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;

// روم التذكرة + الشراء
const TICKET_ROOM = "1440508751412203570";
const SHOP_ROOM   = "1439600517063118989";

// صورة الهيدر
const HEADER_IMG = "https://cdn.discordapp.com/attachments/1316747953148067840/1330755574800449566/IMG_8531.jpg";

// حملات DM (محفوظة)
let broadcasts = {};
if (fs.existsSync("./broadcasts.json")) {
  broadcasts = JSON.parse(fs.readFileSync("./broadcasts.json", "utf8"));
}

// ====================== AI Translation ======================
function translateToEnglish(txt) {
  return `
This is an official announcement from the administration:

${txt}

If you need help, you may open a support ticket.
`;
}

// ====================== CLIENT ======================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ====================== READY ======================
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ====================== KEEP ALIVE ======================
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(process.env.PORT || 10000);

// ====================== COMMAND: +send ======================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  // =================== SEND ===================
  if (command === "send") {
    if (message.author.id !== OWNER_ID)
      return message.reply("❌ هذا الأمر فقط للأونر.");

    const roles = message.guild.roles.cache
      .filter(r => r.members.size > 0 && r.name !== "@everyone")
      .map(r => ({
        label: r.name,
        value: r.id
      }));

    const select = new StringSelectMenuBuilder()
      .setCustomId("selectRoleMenu")
      .setPlaceholder("اختر الرتبة التي تريد إرسال الإعلان لها")
      .addOptions(roles);

    const row = new ActionRowBuilder().addComponents(select);

    return message.reply({
      content: "🔽 **اختر الرتبة لإرسال الإعلان:**",
      components: [row]
    });
  }

  // =================== DELETE ===================
  if (command === "bcdelete") {
    if (message.author.id !== OWNER_ID)
      return message.reply("❌ هذا الأمر للأونر فقط.");

    const id = args[0];
    if (!id) return message.reply("❌ استخدم: +bcdelete ID");

    const data = broadcasts[id];
    if (!data) return message.reply("⚠ لا يوجد حملة بهذا الرقم.");

    let deleted = 0;

    for (const entry of data) {
      try {
        const user = await client.users.fetch(entry.userId);
        const dm = await user.createDM();
        const msg = await dm.messages.fetch(entry.messageId);
        await msg.delete();
        deleted++;
      } catch {}
    }

    delete broadcasts[id];
    fs.writeFileSync("./broadcasts.json", JSON.stringify(broadcasts, null, 2));

    return message.reply(`🗑️ تم حذف **${deleted}** رسالة.`);
  }
});

// ====================== INTERACTIONS ======================
client.on("interactionCreate", async (interaction) => {

  // =============== SELECT MENU (اختر رتبة) ===============
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "selectRoleMenu") {

      const roleId = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`msgModal_${roleId}`)
        .setTitle("كتابة نص الإعلان");

      const input = new TextInputBuilder()
        .setCustomId("msgContent")
        .setLabel("اكتب نص الإعلان بالعربي")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);

      return interaction.showModal(modal);
    }
  }

  // =============== MODAL SUBMIT ===============
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("msgModal_")) {

      const roleId = interaction.customId.split("_")[1];
      const role = interaction.guild.roles.cache.get(roleId);

      const msgAR = interaction.fields.getTextInputValue("msgContent");
      const msgEN = translateToEnglish(msgAR);

      const members = role.members.filter(m => !m.user.bot);

      const campID = Date.now().toString();
      broadcasts[campID] = [];

      // الأزرار عربي + إنجليزي
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("🎫 افتح تذكرة | Open Ticket")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${interaction.guild.id}/${TICKET_ROOM}`),

        new ButtonBuilder()
          .setLabel("🛒 روم الشراء | Shop Room")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${interaction.guild.id}/${SHOP_ROOM}`)
      );

      for (const [id, member] of members) {
        try {
          const dm = await member.createDM();

          const embedAR = new EmbedBuilder()
            .setColor("#0a1f44")
            .setImage(HEADER_IMG)
            .setTitle("📢 إعلان جديد من الإدارة")
            .setDescription(
              `**الرسالة:**\n> ${msgAR}\n\n📢 **هذا إعلان رسمي من الإدارة**`
            )
            .setTimestamp();

          const embedEN = new EmbedBuilder()
            .setColor("#0a1f44")
            .setTitle("📢 Official Announcement")
            .setDescription(msgEN)
            .setTimestamp();

          const sent = await dm.send({
            content: `<@${member.id}>`,
            embeds: [embedAR, embedEN],
            components: [buttons]
          });

          broadcasts[campID].push({
            userId: member.id,
            messageId: sent.id
          });

        } catch (err) {}
      }

      fs.writeFileSync("./broadcasts.json", JSON.stringify(broadcasts, null, 2));

      return interaction.reply({
        ephemeral: true,
        content: `✅ تم إرسال الإعلان.\n📛 رقم الحملة: **${campID}**`
      });
    }
  }
});

// ====================== LOGIN ======================
client.login(BOT_TOKEN);
