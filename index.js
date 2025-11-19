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

// ====================== الإعدادات العامة ======================
const PREFIX = "+";
const OWNER_ID = process.env.OWNER_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;

// ====== تحميل الإعدادات من config.json (التكت + الشراء + الصورة + اللون) ======
let CONFIG = {
  ticketRoom: "1440508751412203570",
  shopRoom: "1439600517063118989",
  headerImage: "",
  embedColor: "#0a1f44"
};

try {
  const json = fs.readFileSync("./config.json", "utf8");
  CONFIG = { ...CONFIG, ...JSON.parse(json) };
  console.log("✅ Loaded config.json");
} catch (e) {
  console.warn("⚠️ لم أستطع قراءة config.json، أستخدم الإعدادات الافتراضية.");
}

const TICKET_ROOM = CONFIG.ticketRoom;
const SHOP_ROOM = CONFIG.shopRoom;
const HEADER_IMAGE = CONFIG.headerImage;
const EMBED_COLOR = CONFIG.embedColor;

// ========== تحميل الحملات من broadcasts.json (لو موجود) ==========
let broadcasts = {};
if (fs.existsSync("./broadcasts.json")) {
  try {
    broadcasts = JSON.parse(fs.readFileSync("./broadcasts.json", "utf8"));
    console.log("✅ Loaded broadcasts.json");
  } catch {
    console.warn("⚠️ مشكلة في قراءة broadcasts.json، ببدأ من جديد.");
    broadcasts = {};
  }
}

// =============== “ترجمة” إنجليزي احترافية حوالين كلامك ===============
function buildEnglishBlock(arabicText) {
  return [
    "This is an announcement from the administration.",
    "",
    "Original message (Arabic):",
    `> ${arabicText}`,
    "",
    "If you need assistance, feel free to open a ticket using the button below."
  ].join("\n");
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

// ====================== EXPRESS KEEP-ALIVE (Render) ======================
const app = express();
app.get("/", (req, res) => res.send("Bot is running ✅"));
app.listen(process.env.PORT || 10000, () =>
  console.log("🌐 Render KeepAlive Active")
);

// ====================== HANDLER للأوامر النصية ======================
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
      .filter((r) => r.members.size > 0 && r.id !== message.guild.id)
      .first(5);

    if (!roles.length) {
      return message.reply("⚠ لا يوجد رتب تحتوي أعضاء.");
    }

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
      content: "🔽 **اختر الرتبة لإرسال الإعلان الخاص لأعضائها:**",
      components: [row]
    });
  }

  // --------- +bcdelete ID ---------
  if (command === "bcdelete") {
    if (message.author.id !== OWNER_ID)
      return message.reply("❌ هذا الأمر فقط للأونر.");

    const id = args[0];
    if (!id) return message.reply("❌ استخدم:\n`+bcdelete رقم_الحملة`");

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
        // ممكن الرسالة محذوفة أو قديمة
      }
    }

    delete broadcasts[id];
    fs.writeFileSync("./broadcasts.json", JSON.stringify(broadcasts, null, 2));

    return message.reply(`🗑️ تم محاولة حذف **${deleted}** رسالة من الخاص.`);
  }
});

// ====================== الأزرار + المودال ======================
client.on("interactionCreate", async (interaction) => {
  // --------- اختيار الرتبة ---------
  if (interaction.isButton()) {
    if (interaction.customId.startsWith("selectRole_")) {
      const roleId = interaction.customId.split("_")[1];

      const modal = new ModalBuilder()
        .setCustomId(`msgModal_${roleId}`)
        .setTitle("كتابة رسالة الإعلان");

      const input = new TextInputBuilder()
        .setCustomId("msgContent")
        .setLabel("اكتب نص الإعلان بالعربي (بيطلع عربي + إنجليزي)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);

      return interaction.showModal(modal);
    }
  }

  // --------- إرسال الإعلان بعد كتابة النص ---------
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("msgModal_")) {
      const roleId = interaction.customId.split("_")[1];
      const role = interaction.guild.roles.cache.get(roleId);

      if (!role) {
        return interaction.reply({
          ephemeral: true,
          content: "❌ الرتبة لم تعد موجودة."
        });
      }

      const msgAR = interaction.fields.getTextInputValue("msgContent");
      const msgEN = buildEnglishBlock(msgAR);

      const members = role.members.filter((m) => !m.user.bot);
      const broadcastId = Date.now().toString();
      broadcasts[broadcastId] = [];

      // أزرار عربي + إنجليزي
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("🎫 افتح تذكرة | Open Ticket")
          .setStyle(ButtonStyle.Link)
          .setURL(
            `https://discord.com/channels/${interaction.guild.id}/${TICKET_ROOM}`
          ),
        new ButtonBuilder()
          .setLabel("🛒 روم الشراء | Shop Channel")
          .setStyle(ButtonStyle.Link)
          .setURL(
            `https://discord.com/channels/${interaction.guild.id}/${SHOP_ROOM}`
          )
      );

      await interaction.reply({
        ephemeral: true,
        content: `⏳ جاري إرسال الإعلان إلى **${members.size}** عضو من رتبة **${role.name}**...`
      });

      for (const [memberId, member] of members) {
        try {
          const dm = await member.createDM();

          // ==== الامبد العربي (مرتب + كبير) ====
          const embedAR = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle("📢 إعلان جديد من الإدارة")
            .setDescription(
              [
                "━━━━━━━━━━━━━━━━━━━",
                "🕌 **الرسالة بالعربي:**",
                "",
                `> ${msgAR}`,
                "",
                "📢 **هذا إعلان رسمي من إدارة السيرفر.**",
                "━━━━━━━━━━━━━━━━━━━",
                "",
                "إذا تحتاج مساعدة اضغط على الزر:",
                "🎫 **افتح تذكرة | Open Ticket**"
              ].join("\n")
            )
            .setTimestamp();

          if (HEADER_IMAGE) {
            embedAR.setImage(HEADER_IMAGE);
          }

          // ==== الامبد الإنجليزي ====
          const embedEN = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle("📢 New Announcement From The Administration")
            .setDescription(
              [
                "━━━━━━━━━━━━━━━━━━━",
                "🌍 **English Message:**",
                "",
                msgEN,
                "",
                "📢 **This is an official announcement from the server administration.**",
                "━━━━━━━━━━━━━━━━━━━"
              ].join("\n")
            )
            .setTimestamp();

          const sentMsg = await dm.send({
            content: `<@${member.id}>`,
            embeds: [embedAR, embedEN],
            components: [buttons]
          });

          broadcasts[broadcastId].push({
            userId: member.id,
            messageId: sentMsg.id
          });
        } catch {
          // المستخدم قافل الخاص أو خطأ آخر
        }
      }

      fs.writeFileSync("./broadcasts.json", JSON.stringify(broadcasts, null, 2));

      return interaction.followUp({
        ephemeral: true,
        content: `✅ تم إرسال الإعلان.\n📛 رقم الحملة: \`${broadcastId}\`\n🗑️ لحذف رسائل هذه الحملة من الخاص:\n\`+bcdelete ${broadcastId}\``
      });
    }
  }
});

// ====================== LOGIN ======================
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN غير موجود في Environment (السيكرت).");
  process.exit(1);
}
client.login(BOT_TOKEN);
