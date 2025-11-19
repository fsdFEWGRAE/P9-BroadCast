import express from "express";
import fs from "fs";
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
import translate from "@vitalets/google-translate-api";
import config from "./config.json" assert { type: "json" };

// ====================== CONFIG ======================
const PREFIX = "+";
const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID;

// من config.json
const TICKET_ROOM = config.ticketRoom;
const SHOP_ROOM = config.shopRoom;
const HEADER_IMAGE = config.headerImage;
const EMBED_COLOR = config.embedColor || "#0a1f44";

// ======= تحميل الحملات من ملف (لو موجود) =======
let broadcasts = {};
if (fs.existsSync("./broadcasts.json")) {
  try {
    broadcasts = JSON.parse(fs.readFileSync("./broadcasts.json", "utf8"));
  } catch {
    broadcasts = {};
  }
}

// ======= دالة حفظ الحملات =======
function saveBroadcasts() {
  fs.writeFileSync(
    "./broadcasts.json",
    JSON.stringify(broadcasts, null, 2),
    "utf8"
  );
}

// ======= دالة ترجمة عربية → إنجليزي =======
async function translateToEnglish(text) {
  try {
    const res = await translate(text, { from: "ar", to: "en" });
    return res.text;
  } catch (err) {
    console.error("Translate error:", err.message);
    // لو الترجمة فشلت نرجع نفس النص
    return text;
  }
}

// ====================== DISCORD CLIENT ======================
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

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ====================== KEEP ALIVE (Render) ======================
const app = express();
app.get("/", (_req, res) => res.send("P9 Broadcast Bot is running ✅"));
app.listen(process.env.PORT || 10000, () =>
  console.log("🌐 HTTP keep-alive server started")
);

// ====================== MESSAGE HANDLER ======================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  // ======= أمر +send → فتح قائمة الرتب =======
  if (command === "send") {
    if (message.author.id !== OWNER_ID) {
      return message.reply("❌ هذا الأمر فقط لصاحب البوت (الأونر).");
    }

    if (!message.guild) {
      return message.reply("❌ استخدم الأمر داخل السيرفر.");
    }

    const roles = message.guild.roles.cache
      .filter(
        (r) =>
          r.id !== message.guild.id && // استبعاد @everyone
          !r.managed && // استبعاد رتب البوتات الخارجية
          r.members.size > 0
      )
      .sort((a, b) => b.position - a.position);

    if (!roles.size) {
      return message.reply("⚠ لا يوجد رتب تحتوي أعضاء.");
    }

    // Discord يسمح بـ 25 خيار كحد أقصى في السليكت
    const options = roles.map((role) => ({
      label: role.name.slice(0, 100),
      description: `Members: ${role.members.size}`.slice(0, 100),
      value: role.id
    })).slice(0, 25);

    const select = new StringSelectMenuBuilder()
      .setCustomId("selectRole")
      .setPlaceholder("اختر الرتبة لإرسال الإعلان / Select a role")
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(select);

    return message.reply({
      content: "🔽 **اختر الرتبة التي تريد إرسال الإعلان لها:**",
      components: [row]
    });
  }

  // ======= +bcdelete ID → حذف الحملة من الخاص =======
  if (command === "bcdelete") {
    if (message.author.id !== OWNER_ID) {
      return message.reply("❌ هذا الأمر فقط لصاحب البوت.");
    }

    const id = args[0];
    if (!id) {
      return message.reply("❌ استخدم الأمر هكذا:\n`+bcdelete رقم_الحملة`");
    }

    const data = broadcasts[id];
    if (!data) {
      return message.reply("⚠ لا يوجد حملة بهذا الرقم (أو تم حذفها سابقًا).");
    }

    let deleted = 0;
    for (const entry of data) {
      try {
        const user = await client.users.fetch(entry.userId);
        const dm = await user.createDM();
        const msg = await dm.messages.fetch(entry.messageId);
        await msg.delete();
        deleted++;
      } catch {
        // غالبًا العضو حاذف الرسالة أو الـ DM قديم / مقفول
      }
    }

    delete broadcasts[id];
    saveBroadcasts();

    return message.reply(
      `🗑️ تم محاولة حذف رسائل الحملة \`${id}\`.\n✅ تم حذف **${deleted}** رسالة من الخاص (الباقي يمكن ما قدرنا نوصل له).`
    );
  }
});

// ====================== INTERACTIONS ======================
client.on("interactionCreate", async (interaction) => {
  // ======= SELECT MENU لاختيار الرتبة =======
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "selectRole") {
      const roleId = interaction.values[0];
      const role = interaction.guild.roles.cache.get(roleId);

      if (!role) {
        return interaction.reply({
          content: "❌ هذه الرتبة لم تعد موجودة.",
          ephemeral: true
        });
      }

      // مودال نص الإعلان
      const modal = new ModalBuilder()
        .setCustomId(`announceModal_${roleId}`)
        .setTitle("نص الإعلان / Announcement");

      const textInput = new TextInputBuilder()
        .setCustomId("announcementText")
        .setLabel("نص الإعلان (عربي)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(textInput);
      modal.addComponents(row);

      return interaction.showModal(modal);
    }
  }

  // ======= MODAL SUBMIT =======
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("announceModal_")) {
      const roleId = interaction.customId.split("_")[1];
      const role = interaction.guild.roles.cache.get(roleId);

      if (!role) {
        return interaction.reply({
          content: "❌ الرتبة لم تعد موجودة.",
          ephemeral: true
        });
      }

      const msgAR = interaction.fields.getTextInputValue("announcementText");

      // ترجمة للنص اللي كتبه الأونر
      const msgEN = await translateToEnglish(msgAR);

      const members = role.members.filter((m) => !m.user.bot);
      const total = members.size;

      if (total === 0) {
        return interaction.reply({
          content: "⚠ لا يوجد أعضاء بشر يحملون هذه الرتبة.",
          ephemeral: true
        });
      }

      await interaction.reply({
        content: `⏳ جاري إرسال الإعلان إلى **${total}** عضو...`,
        ephemeral: true
      });

      const campaignId = Date.now().toString();
      broadcasts[campaignId] = [];

      let failed = 0;

      // أزرار (عربي + English)
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("🎫 افتح تذكرة | Open Ticket")
          .setStyle(ButtonStyle.Link)
          .setURL(
            `https://discord.com/channels/${interaction.guild.id}/${TICKET_ROOM}`
          ),
        new ButtonBuilder()
          .setLabel("🛒 روم الشراء | Shop Room")
          .setStyle(ButtonStyle.Link)
          .setURL(
            `https://discord.com/channels/${interaction.guild.id}/${SHOP_ROOM}`
          )
      );

      for (const [memberId, member] of members) {
        try {
          const dm = await member.createDM();

          // امبد عربي كبير
          const embedAR = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setImage(HEADER_IMAGE)
            .setTitle("📢 إعلان جديد من الإدارة")
            .setDescription(
              [
                "━━━━━━━━━━━━━━━━━━━━",
                "**الرسالة بالعربي:**",
                "",
                `> ${msgAR}`,
                "",
                "📢 **هذا إعلان رسمي من إدارة السيرفر**",
                "━━━━━━━━━━━━━━━━━━━━"
              ].join("\n")
            )
            .setFooter({ text: `Server: ${interaction.guild.name}` })
            .setTimestamp();

          // امبد إنجليزي كبير
          const embedEN = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle("📢 Official Announcement From The Administration")
            .setDescription(
              [
                "━━━━━━━━━━━━━━━━━━━━",
                `**Message in English:**`,
                "",
                msgEN,
                "",
                "📢 **This is an official announcement from the administration.**",
                "━━━━━━━━━━━━━━━━━━━━"
              ].join("\n")
            )
            .setFooter({ text: `Server: ${interaction.guild.name}` })
            .setTimestamp();

          const sentMsg = await dm.send({
            content: `<@${member.id}>`,
            embeds: [embedAR, embedEN],
            components: [buttons]
          });

          broadcasts[campaignId].push({
            userId: member.id,
            messageId: sentMsg.id
          });
        } catch (err) {
          failed++;
        }
      }

      saveBroadcasts();

      return interaction.followUp({
        content: [
          `✅ تم إرسال الإعلان للحملة \`${campaignId}\`.`,
          `👥 عدد المستلمين: **${total - failed}**`,
          failed > 0
            ? `⚠ لم نتمكن من الإرسال إلى **${failed}** عضو (غالبًا مقفلين الخاص أو حاذفين الـ DM).`
            : "✨ تم الإرسال لجميع الأعضاء بنجاح.",
          "",
          `🗑 لحذف رسائل هذه الحملة من الخاص استخدم:\n\`+bcdelete ${campaignId}\``
        ].join("\n"),
        ephemeral: true
      });
    }
  }
});

// ====================== LOGIN ======================
if (!BOT_TOKEN || !OWNER_ID) {
  console.error("❌ لازم تضيف BOT_TOKEN و OWNER_ID في السيكريت على Render.");
  process.exit(1);
}

client.login(BOT_TOKEN);
