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
  EmbedBuilder,
  StringSelectMenuBuilder
} from "discord.js";
import fs from "fs";

// ====================== CONFIG ======================
const PREFIX = "+";
const OWNER_ID = process.env.OWNER_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;

// إعدادات من config.json (اختيارية)
let config = {
  ticketRoom: "1440508751412203570",
  shopRoom: "1439600517063118989",
  headerImage:
    "https://cdn.discordapp.com/attachments/1438169803490721903/1440640898840002641/ChatGPT_Image_16_2025_02_30_33_.png",
  embedColor: "#0a1f44"
};

try {
  if (fs.existsSync("./config.json")) {
    const fileData = JSON.parse(fs.readFileSync("./config.json", "utf8"));
    config = { ...config, ...fileData };
  }
} catch (err) {
  console.warn("⚠️ لم أستطع قراءة config.json، سأستخدم الإعدادات الافتراضية.", err);
}

const TICKET_ROOM = config.ticketRoom;
const SHOP_ROOM = config.shopRoom;
const HEADER_IMAGE = config.headerImage;
const EMBED_COLOR = config.embedColor;

// ========== تحميل الحملات من JSON ==========
let broadcasts = {};
if (fs.existsSync("./broadcasts.json")) {
  try {
    broadcasts = JSON.parse(fs.readFileSync("./broadcasts.json", "utf8"));
  } catch {
    broadcasts = {};
  }
}

// =============== بلوك إنجليزي عام حول الرسالة ===============
function buildEnglishBlock(arabicText) {
  return [
    "This is an announcement from the server administration.",
    "",
    "Original message (written in Arabic):",
    arabicText,
    "",
    "If you need assistance, feel free to open a ticket or visit the shop channel."
  ].join("\n");
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
    if (message.author.id !== OWNER_ID) {
      return message.reply("❌ هذا الأمر فقط للأونر.");
    }

    if (!message.guild) {
      return message.reply("❌ استخدم الأمر داخل السيرفر.");
    }

    const roles = message.guild.roles.cache
      .filter((r) => r.id !== message.guild.id && r.members.size > 0)
      .sort((a, b) => b.position - a.position)
      .first(25); // أقصى شيء 25 خيار في السليكت منيو

    if (!roles.length) {
      return message.reply("⚠ لا يوجد رتب تحتوي أعضاء.");
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("roleSelect")
      .setPlaceholder("اختر الرتبة / Select a role")
      .addOptions(
        roles.map((role) => ({
          label: role.name.slice(0, 25),
          description: `الأعضاء: ${role.members.size}`,
          value: role.id
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    return message.reply({
      content: "🔽 **اختر الرتبة التي تريد إرسال الإعلان لها:**",
      components: [row]
    });
  }

  // --------- +bcdelete ID ---------
  if (command === "bcdelete") {
    if (message.author.id !== OWNER_ID) {
      return message.reply("❌ هذا الأمر فقط للأونر.");
    }

    const id = args[0];
    if (!id) return message.reply("❌ استخدم: `+bcdelete رقم_الحملة`");

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
      } catch {
        // ممكن العضو حاذف الرسالة أو مقفل الخاص
      }
    }

    delete broadcasts[id];
    fs.writeFileSync("./broadcasts.json", JSON.stringify(broadcasts, null, 2));

    return message.reply(
      `🗑️ تم محاولة حذف رسائل الحملة.\n🗑️ المحذوف فعلياً: **${deleted}** رسالة.`
    );
  }
});

// ====================== INTERACTIONS ======================
client.on("interactionCreate", async (interaction) => {
  // ----- اختيار الرتبة (Select Menu) -----
  if (interaction.isStringSelectMenu() && interaction.customId === "roleSelect") {
    const roleId = interaction.values[0];
    const role = interaction.guild.roles.cache.get(roleId);

    if (!role) {
      return interaction.reply({ content: "❌ الرتبة غير موجودة.", ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId(`msgModal_${roleId}`)
      .setTitle("نص الإعلان / Announcement");

    const input = new TextInputBuilder()
      .setCustomId("msgContent")
      .setLabel("نص الإعلان بالعربي")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setPlaceholder("اكتب نص الإعلان هنا..."); // <= أقل من 45 حرف عشان ما يرجع نفس الخطأ

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    return interaction.showModal(modal);
  }

  // ----- استلام نص الإعلان من المودال -----
  if (interaction.isModalSubmit() && interaction.customId.startsWith("msgModal_")) {
    const roleId = interaction.customId.split("_")[1];
    const role = interaction.guild.roles.cache.get(roleId);

    if (!role) {
      return interaction.reply({ content: "❌ الرتبة لم تعد موجودة.", ephemeral: true });
    }

    const msgAR = interaction.fields.getTextInputValue("msgContent");
    const msgEN = buildEnglishBlock(msgAR);

    const members = role.members.filter((m) => !m.user.bot);

    if (!members.size) {
      return interaction.reply({
        content: "⚠ لا يوجد أعضاء يملكون هذه الرتبة.",
        ephemeral: true
      });
    }

    await interaction.reply({
      content: `⏳ جاري إرسال الإعلان إلى **${members.size}** عضو...`,
      ephemeral: true
    });

    const id = Date.now().toString();
    broadcasts[id] = [];

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("🎫 فتح تذكرة | Open Ticket")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${interaction.guild.id}/${TICKET_ROOM}`),
      new ButtonBuilder()
        .setLabel("🛒 روم الشراء | Shop Channel")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${interaction.guild.id}/${SHOP_ROOM}`)
    );

    let success = 0;
    let failed = 0;

    for (const [memberId, member] of members) {
      try {
        const dm = await member.createDM();

        const embedAR = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setImage(HEADER_IMAGE) // الصورة اللي طلبتها
          .setTitle("📢 إعلان جديد من الإدارة")
          .setDescription(
            [
              "━━━━━━━━━━━━━━━━━━━",
              "**الرسالة بالعربي:**",
              msgAR,
              "",
              "📢 **هذا إعلان من إدارة السيرفر**",
              "━━━━━━━━━━━━━━━━━━━"
            ].join("\n")
          )
          .setFooter({ text: `السيرفر: ${interaction.guild.name}` })
          .setTimestamp();

        const embedEN = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setTitle("📢 New Announcement From The Administration")
          .setDescription(
            [
              "━━━━━━━━━━━━━━━━━━━",
              msgEN,
              "",
              "📢 This is an announcement from the administration.",
              "━━━━━━━━━━━━━━━━━━━"
            ].join("\n")
          )
          .setFooter({ text: `Server: ${interaction.guild.name}` })
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
        success++;
      } catch (err) {
        // العضو قافل الخاص أو مانع الرسائل
        failed++;
      }
    }

    fs.writeFileSync("./broadcasts.json", JSON.stringify(broadcasts, null, 2));

    return interaction.followUp({
      content:
        `✅ تم إرسال الإعلان إلى **${success}** عضو.\n` +
        (failed
          ? `⚠ تعذر الإرسال إلى **${failed}** عضو (الغالب قافلين الخاص أو مانعين الرسائل من السيرفر).`
          : "✨ لم يحصل أي خطأ في الإرسال.") +
        `\n\n📛 رقم الحملة: \`${id}\`\n🗑 لحذفها: \`+bcdelete ${id}\``,
      ephemeral: true
    });
  }
});

// ====================== LOGIN ======================
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN غير موجود في السيكريت.");
  process.exit(1);
}

client.login(BOT_TOKEN);
