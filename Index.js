import express from "express";
import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
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

const TICKET_ROOM = "1440508751412203570";
const SHOP_ROOM = "1439600517063118989";

// ========== تحميل الحملات من JSON ==========
let broadcasts = {};
if (fs.existsSync("./broadcasts.json")) {
  broadcasts = JSON.parse(fs.readFileSync("./broadcasts.json", "utf8"));
}

// =============== ترجمة AI بسيطة ===============
function translateToEnglish(ar) {
  return `This is an announcement from the administration:\n\n${ar}\n\nIf you need assistance, feel free to open a ticket.`;
}

// ====================== CLIENT ======================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ====================== READY ======================
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ====================== EXPRESS KEEPALIVE ======================
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(process.env.PORT || 10000, () =>
  console.log("🌐 Render KeepAlive Active")
);

// ====================== MESSAGE COMMAND ======================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  // --------- +send ---------
  if (command === "send") {
    if (message.author.id !== OWNER_ID)
      return message.reply("❌ هذا الأمر فقط للأونر.");

    const roles = message.guild.roles.cache
      .filter((r) => r.members.size > 0)
      .first(5);

    const row = new ActionRowBuilder();

    roles.forEach((role) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`selectRole_${role.id}`)
          .setLabel(role.name)
          .setStyle(ButtonStyle.Primary)
      );
    });

    return message.reply({
      content: "🔽 **اختر الرتبة لإرسال الإعلان:**",
      components: [row]
    });
  }

  // --------- +bcdelete ---------
  if (command === "bcdelete") {
    if (message.author.id !== OWNER_ID)
      return message.reply("❌ هذا الأمر فقط للأونر.");

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

    return message.reply(`🗑️ تم حذف ${deleted} رسالة.`);
  }
});

// ====================== BUTTONS ======================
client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith("selectRole_")) {
      const roleId = interaction.customId.split("_")[1];

      const modal = new ModalBuilder()
        .setCustomId(`msgModal_${roleId}`)
        .setTitle("كتابة رسالة الإعلان");

      const input = new TextInputBuilder()
        .setCustomId("msgContent")
        .setLabel("اكتب نص الإعلان")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(input);

      modal.addComponents(row);

      return interaction.showModal(modal);
    }
  }

  // ====================== MODAL SUBMIT ======================
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("msgModal_")) {
      const roleId = interaction.customId.split("_")[1];
      const role = interaction.guild.roles.cache.get(roleId);

      const msgAR = interaction.fields.getTextInputValue("msgContent");
      const msgEN = translateToEnglish(msgAR);

      const members = role.members.filter((m) => !m.user.bot);

      const id = Date.now().toString();
      broadcasts[id] = [];

      // الأزرار
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("🎫 افتح تذكرة")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${interaction.guild.id}/${TICKET_ROOM}`),

        new ButtonBuilder()
          .setLabel("🛒 روم الشراء")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${interaction.guild.id}/${SHOP_ROOM}`)
      );

      // صورة الهيدر (الصورة اللي أرسلتها)
      const headerImage =
        "https://cdn.discordapp.com/attachments/1314585185406857317/1314994719631110154/image.png";

      for (const [memberId, member] of members) {
        try {
          const dm = await member.createDM();

          const embedAR = new EmbedBuilder()
            .setColor("#1b2a41")
            .setImage(headerImage)
            .setTitle("📢 إعلان جديد")
            .setDescription(
              `**الرسالة:**\n> ${msgAR}\n\n📢 **هذا إعلان من الإدارة**`
            )
            .setTimestamp();

          const embedEN = new EmbedBuilder()
            .setColor("#1b2a41")
            .setTitle("📢 New Announcement")
            .setDescription(msgEN)
            .setTimestamp();

          const sentMsg = await dm.send({
            content: `<@${member.id}>`,
            embeds: [embedAR, embedEN],
            components: [buttons]
          });

          broadcasts[id].push({
            userId: member.id,
            messageId: sentMsg.id
          });
        } catch {}
      }

      fs.writeFileSync("./broadcasts.json", JSON.stringify(broadcasts, null, 2));

      return interaction.reply({
        ephemeral: true,
        content: `✅ تم إرسال الإعلان.\nرقم الحملة: **${id}**`
      });
    }
  }
});

// ====================== LOGIN ======================
client.login(BOT_TOKEN);
