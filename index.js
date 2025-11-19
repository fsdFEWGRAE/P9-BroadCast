import express from "express";
import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder
} from "discord.js";
import fs from "fs";

// ================= CONFIG =================
const PREFIX = "+";
const OWNER_ID = process.env.OWNER_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;

const TICKET_ROOM = "1440508751412203570";
const SHOP_ROOM   = "1439600517063118989";

const headerImage =
  "https://cdn.discordapp.com/attachments/1316747953148067840/1330755574800449566/IMG_8531.jpg";

// حفظ الحملات
let broadcasts = {};
if (fs.existsSync("./broadcasts.json")) {
  broadcasts = JSON.parse(fs.readFileSync("./broadcasts.json", "utf8"));
}

// ترجمة احترافية
function translateToEnglish(ar) {
  return `This is an official announcement from the administration:\n\n${ar}\n\nIf you need help, you may open a support ticket.`;
}

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ================= KEEP ALIVE =================
const app = express();
app.get("/", (_, res) => res.send("Bot running"));
app.listen(process.env.PORT || 10000);

// ================= MESSAGE HANDLER =================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith(PREFIX)) return;

  const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

  // SEND SYSTEM
  if (cmd === "send") {
    if (msg.author.id !== OWNER_ID)
      return msg.reply("❌ هذا الأمر فقط للأونر.");

    const roles = msg.guild.roles.cache.filter(r => r.members.size > 0);

    const menu = new StringSelectMenuBuilder()
      .setCustomId("select_role")
      .setPlaceholder("اختر الرتبة لإرسال الإعلان")
      .addOptions(
        roles.map(r => ({
          label: r.name,
          value: r.id
        }))
      );

    const row = new ActionRowBuilder().addComponents(menu);

    return msg.reply({
      content: "🔽 اختر الرتبة:",
      components: [row]
    });
  }

  // DELETE SYSTEM
  if (cmd === "bcdelete") {
    if (msg.author.id !== OWNER_ID)
      return msg.reply("❌ هذا الأمر فقط للأونر.");

    const id = args[0];
    if (!id) return msg.reply("❌ استخدم: +bcdelete ID");

    if (!broadcasts[id])
      return msg.reply("⚠ لا يوجد حملة بهذا الرقم.");

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

    return msg.reply(`🗑️ تم حذف ${deleted} رسالة.`);
  }
});

// ================= INTERACTIONS =================
client.on("interactionCreate", async (i) => {

  // SELECT MENU
  if (i.isStringSelectMenu()) {
    if (i.customId === "select_role") {
      const roleId = i.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`modal_${roleId}`)
        .setTitle("كتابة الإعلان");

      const input = new TextInputBuilder()
        .setCustomId("content")
        .setLabel("اكتب نص الإعلان (عربي)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);

      return i.showModal(modal);
    }
  }

  // MODAL SUBMIT
  if (i.isModalSubmit()) {
    if (i.customId.startsWith("modal_")) {
      const roleId = i.customId.split("_")[1];
      const role = i.guild.roles.cache.get(roleId);

      const textAR = i.fields.getTextInputValue("content");
      const textEN = translateToEnglish(textAR);

      const members = role.members.filter((m) => !m.user.bot);

      const id = Date.now().toString();
      broadcasts[id] = [];

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("🎫 افتح تذكرة | Open Ticket")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${i.guild.id}/${TICKET_ROOM}`),

        new ButtonBuilder()
          .setLabel("🛒 روم الشراء | Shop Room")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${i.guild.id}/${SHOP_ROOM}`)
      );

      for (const [uid, member] of members) {
        try {
          const dm = await member.createDM();

          const embedAR = new EmbedBuilder()
            .setColor("#0a1f44")
            .setImage(headerImage)
            .setTitle("📢 إعلان جديد من الإدارة")
            .setDescription(`**الرسالة:**\n${textAR}\n\n📢 **هذا إعلان رسمي من الإدارة**`)
            .setTimestamp();

          const embedEN = new EmbedBuilder()
            .setColor("#0a1f44")
            .setTitle("📢 Official Announcement")
            .setDescription(textEN)
            .setTimestamp();

          const sent = await dm.send({
            content: `<@${member.id}>`,
            embeds: [embedAR, embedEN],
            components: [buttons]
          });

          broadcasts[id].push({ userId: uid, messageId: sent.id });

        } catch {}
      }

      fs.writeFileSync("./broadcasts.json", JSON.stringify(broadcasts, null, 2));

      return i.reply({
        ephemeral: true,
        content: `✅ تم الإرسال.\nرقم الحملة: **${id}**`
      });
    }
  }
});

// LOGIN
client.login(BOT_TOKEN);
