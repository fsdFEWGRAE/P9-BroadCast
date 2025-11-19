import express from "express";
import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";

import fs from "fs";

// ====================== ENV ======================
const TOKEN = process.env.BOT_TOKEN;
const OWNER = process.env.OWNER_ID;

// ====================== CONFIG ======================
const headerImage =
  "https://cdn.discordapp.com/attachments/1314585185406857317/1314994719631110154/image.png";

const ticketRoom = "1440508751412203570";
const shopRoom = "1439600517063118989";

// ====================== LOAD BROADCASTS ======================
let broadcasts = {};
if (fs.existsSync("./broadcasts.json")) {
  broadcasts = JSON.parse(fs.readFileSync("./broadcasts.json", "utf8"));
}

// ====================== TRANSLATION ======================
function translate(msg) {
  return `This is an official announcement from the administration:\n\n${msg}\n\nIf you need help, you may open a support ticket.`;
}

// ====================== CLIENT ======================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ====================== EXPRESS KEEP ALIVE ======================
const app = express();
app.get("/", (req, res) => res.send("Bot Running"));
app.listen(process.env.PORT || 10000);

// ====================== COMMAND: +send ======================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith("+send")) return;
  if (msg.author.id !== OWNER)
    return msg.reply("❌ هذا الأمر فقط للأونر.");

  // جلب كل الرتب
  const roles = msg.guild.roles.cache
    .filter((r) => r.members.size > 0 && r.name !== "@everyone")
    .map((r) => ({
      label: r.name,
      value: r.id
    }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId("selectRole")
    .setPlaceholder("اختر الرتبة المراد إرسال الإعلان لها")
    .addOptions(roles);

  const row = new ActionRowBuilder().addComponents(menu);

  msg.reply({
    content: "🔽 **اختر الرتبة:**",
    components: [row]
  });
});

// ====================== SELECT MENU ======================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== "selectRole") return;

  const roleId = interaction.values[0];

  // مودال كتابة الرسالة
  const modal = new ModalBuilder()
    .setCustomId(`modal_${roleId}`)
    .setTitle("كتابة الإعلان");

  const input = new TextInputBuilder()
    .setCustomId("msg")
    .setLabel("اكتب نص الإعلان")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const row = new ActionRowBuilder().addComponents(input);

  modal.addComponents(row);

  await interaction.showModal(modal);
});

// ====================== MODAL SUBMIT ======================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isModalSubmit()) return;

  const roleId = interaction.customId.split("_")[1];
  const msgAR = interaction.fields.getTextInputValue("msg");
  const msgEN = translate(msgAR);

  const role = interaction.guild.roles.cache.get(roleId);

  await interaction.reply({
    content: `⏳ يتم الآن إرسال الرسالة إلى أعضاء رتبة **${role.name}**...`,
    ephemeral: true
  });

  const members = role.members.filter((m) => !m.user.bot);
  const id = Date.now().toString();
  broadcasts[id] = [];

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("🎫 افتح تذكرة | Open Ticket")
      .setStyle(ButtonStyle.Link)
      .setURL(
        `https://discord.com/channels/${interaction.guild.id}/${ticketRoom}`
      ),
    new ButtonBuilder()
      .setLabel("🛒 روم الشراء | Shop Room")
      .setStyle(ButtonStyle.Link)
      .setURL(
        `https://discord.com/channels/${interaction.guild.id}/${shopRoom}`
      )
  );

  for (const [userId, member] of members) {
    try {
      const dm = await member.createDM();

      const embedAR = new EmbedBuilder()
        .setColor("#0a1f44")
        .setImage(headerImage)
        .setTitle("📢 إعلان جديد من الإدارة")
        .setDescription(`**الرسالة:**\n> ${msgAR}\n\n📢 **هذا إعلان رسمي من الإدارة**`)
        .setTimestamp();

      const embedEN = new EmbedBuilder()
        .setColor("#0a1f44")
        .setTitle("📢 Official Announcement")
        .setDescription(msgEN)
        .setTimestamp();

      const m = await dm.send({
        content: `<@${userId}>`,
        embeds: [embedAR, embedEN],
        components: [buttons]
      });

      broadcasts[id].push({
        userId,
        messageId: m.id
      });
    } catch (e) {
      // 🔥 تنبيه لو الخاص مقفل
      console.log(`❌ الخاص مقفل عند: ${member.user.username}`);
    }
  }

  fs.writeFileSync("./broadcasts.json", JSON.stringify(broadcasts, null, 2));

  interaction.followUp({
    ephemeral: true,
    content: `✅ تم إرسال الرسالة.\n📛 رقم الحملة: **${id}**`
  });
});

// ====================== DELETE CAMPAIGN ======================
client.on("messageCreate", async (msg) => {
  if (!msg.content.startsWith("+bcdelete")) return;
  if (msg.author.id !== OWNER) return;

  const id = msg.content.split(" ")[1];
  if (!id) return msg.reply("❌ استخدم: +bcdelete ID");

  if (!broadcasts[id]) return msg.reply("⚠ لا يوجد حملة بهذا الرقم.");

  let deleted = 0;

  for (const entry of broadcasts[id]) {
    try {
      const user = await client.users.fetch(entry.userId);
      const dm = await user.createDM();
      const m = await dm.messages.fetch(entry.messageId);
      await m.delete();
      deleted++;
    } catch {}
  }

  delete broadcasts[id];
  fs.writeFileSync("./broadcasts.json", JSON.stringify(broadcasts, null, 2));

  msg.reply(`🗑️ تم حذف ${deleted} رسالة.`);
});

// ====================== LOGIN ======================
client.login(TOKEN);
