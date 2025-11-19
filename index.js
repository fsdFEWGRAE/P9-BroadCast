import express from "express";
import fs from "fs";
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

// ================== CONFIG ==================
const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const PREFIX = "+";

// ايديات الرومات
const TICKET_ROOM = "1440508751412203570";
const SHOP_ROOM = "1439600517063118989";

// صورة الهيدر
const HEADER_IMAGE =
  "https://cdn.discordapp.com/attachments/1438169803490721903/1440640898840002641/ChatGPT_Image_16_2025_02_30_33_.png";

// لون الامبد
const EMBED_COLOR = "#0a1f44";

// ================== CLIENT ==================
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

// =============== Keep Alive (Render) ===============
const app = express();
app.get("/", (req, res) => res.send("Bot Alive"));
app.listen(process.env.PORT || 10000);

// =============== READY ===============
client.on("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// =============== TRANSLATION (AI STYLE) ===============
function translateToEnglish(text) {
  return `This is an official announcement from the server administration:

${text}

If you need any help, please open a support ticket using the button below.`;
}

// =============== MESSAGE COMMANDS ===============
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  // -------- +send --------
  if (command === "send") {
    if (message.author.id !== OWNER_ID)
      return message.reply("❌ هذا الأمر فقط للأونر.");

    // Fetch all members first
    await message.guild.members.fetch();

    const allRoles = message.guild.roles.cache
      .filter((r) => r.members.size > 0 && r.id !== message.guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        label: r.name,
        value: r.id
      }));

    const select = new StringSelectMenuBuilder()
      .setCustomId("role_select")
      .setPlaceholder("اختر الرتبة لإرسال الإعلان")
      .addOptions(allRoles);

    const row = new ActionRowBuilder().addComponents(select);

    return message.reply({
      content: "🔽 **اختر الرتبة:**",
      components: [row]
    });
  }
});

// =============== SELECT MENU HANDLER ===============
client.on("interactionCreate", async (interaction) => {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "role_select") {
      const roleId = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`msg_modal_${roleId}`)
        .setTitle("كتابة رسالة الإعلان");

      const input = new TextInputBuilder()
        .setCustomId("msg_ar")
        .setLabel("اكتب الرسالة بالعربي (سيتم ترجمتها)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);

      return interaction.showModal(modal);
    }
  }

  // =============== MODAL SUBMIT ===============
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("msg_modal_")) {
      const roleId = interaction.customId.split("_")[2];
      const role = interaction.guild.roles.cache.get(roleId);

      const msgAR = interaction.fields.getTextInputValue("msg_ar");
      const msgEN = translateToEnglish(msgAR);

      // Fetch to ensure full list
      await interaction.guild.members.fetch();

      const members = role.members.filter((m) => !m.user.bot);

      let sentCount = 0;
      let failedCount = 0;

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("🎫 افتح تذكرة | Open Ticket")
          .setStyle(ButtonStyle.Link)
          .setURL(
            `https://discord.com/channels/${interaction.guild.id}/${TICKET_ROOM}`
          ),

        new ButtonBuilder()
          .setLabel("🛒 شراء | Shop")
          .setStyle(ButtonStyle.Link)
          .setURL(
            `https://discord.com/channels/${interaction.guild.id}/${SHOP_ROOM}`
          )
      );

      for (const [id, member] of members) {
        try {
          const dm = await member.createDM();

          const embedAR = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setImage(HEADER_IMAGE)
            .setTitle("📢 إعلان جديد من الإدارة")
            .setDescription(
              `**الرسالة:**\n> ${msgAR}\n\n📢 **هذا إعلان رسمي من الإدارة**`
            )
            .setTimestamp();

          const embedEN = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle("📢 New Announcement from Administration")
            .setDescription(msgEN)
            .setTimestamp();

          await dm.send({
            content: `<@${member.id}>`,
            embeds: [embedAR, embedEN],
            components: [buttons]
          });

          sentCount++;
        } catch {
          failedCount++;
        }
      }

      return interaction.reply({
        ephemeral: true,
        content: `✅ **تم الإرسال بنجاح**  
👤 تم الإرسال إلى: **${sentCount}**  
❌ خاص مقفل: **${failedCount}**`
      });
    }
  }
});

// =============== LOGIN ===============
client.login(BOT_TOKEN);
