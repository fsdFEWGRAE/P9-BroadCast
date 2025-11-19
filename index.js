import express from "express";
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";
import fs from "fs";
import config from "./config.json" assert { type: "json" };

// ====================== BASIC CONFIG ======================
const PREFIX = "+";
const OWNER_ID = process.env.OWNER_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;

let broadcasts = {};
if (fs.existsSync("./broadcasts.json")) {
  broadcasts = JSON.parse(fs.readFileSync("./broadcasts.json", "utf8"));
}

// AI Translation (بدون API)
function translateToEnglish(ar) {
  return `This is an announcement from the administration:\n\n${ar}\n\nIf you need any assistance, feel free to open a support ticket.`;
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

// ====================== KEEP-ALIVE FOR RENDER ======================
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(process.env.PORT || 10000, () =>
  console.log("🌐 KeepAlive Active")
);

// ====================== MESSAGE HANDLER ======================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;
  if (message.author.id !== OWNER_ID)
    return message.reply("❌ هذا الأمر فقط للأونر.");

  const command = message.content.slice(PREFIX.length).trim().toLowerCase();

  // ========== +send ==========
  if (command === "send") {
    const roles = message.guild.roles.cache
      .filter((r) => r.members.size > 0)
      .map((role) => ({
        label: role.name,
        value: role.id
      }))
      .slice(0, 25);

    const menu = new StringSelectMenuBuilder()
      .setCustomId("select_role")
      .setPlaceholder("اختر الرتبة لإرسال الإعلان")
      .addOptions(roles);

    const row = new ActionRowBuilder().addComponents(menu);

    return message.reply({
      content: "🔽 **اختر الرتبة:**",
      components: [row]
    });
  }
});

// ====================== INTERACTION HANDLER ======================
client.on("interactionCreate", async (interaction) => {
  // ========= SELECT MENU: اختيار الرتبة =========
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "select_role") {
      const roleId = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`modal_${roleId}`)
        .setTitle("إرسال الإعلان");

      const input = new TextInputBuilder()
        .setCustomId("msg")
        .setLabel("اكتب نص الإعلان (أي عدد أحرف)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);

      return interaction.showModal(modal);
    }
  }

  // ========= MODAL SUBMIT =========
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("modal_")) {
      const roleId = interaction.customId.split("_")[1];
      const role = interaction.guild.roles.cache.get(roleId);

      const msgAR = interaction.fields.getTextInputValue("msg");
      const msgEN = translateToEnglish(msgAR);

      const members = role.members.filter((m) => !m.user.bot);

      const campaignId = Date.now().toString();
      broadcasts[campaignId] = [];

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("🎫 افتح تذكرة • Open Ticket")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${interaction.guild.id}/${config.ticketRoom}`),

        new ButtonBuilder()
          .setLabel("🛒 روم الشراء • Shop Room")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${interaction.guild.id}/${config.shopRoom}`)
      );

      for (const [id, member] of members) {
        try {
          const dm = await member.createDM();

          const embedAR = new EmbedBuilder()
            .setColor(config.embedColor)
            .setImage(config.headerImage)
            .setTitle("📢 إعلان جديد")
            .setDescription(
              `**الرسالة:**\n> ${msgAR}\n\n📢 **هذا إعلان من الإدارة**`
            )
            .setTimestamp();

          const embedEN = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle("📢 New Announcement")
            .setDescription(msgEN)
            .setTimestamp();

          const msg = await dm.send({
            content: `<@${member.id}>`,
            embeds: [embedAR, embedEN],
            components: [buttons]
          });

          broadcasts[campaignId].push({
            userId: member.id,
            messageId: msg.id
          });
        } catch {}
      }

      fs.writeFileSync("./broadcasts.json", JSON.stringify(broadcasts, null, 2));

      return interaction.reply({
        ephemeral: true,
        content: `✅ تم إرسال الإعلان.\nرقم الحملة: **${campaignId}**`
      });
    }
  }
});

// ====================== LOGIN ======================
client.login(BOT_TOKEN);
