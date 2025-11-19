import express from "express";
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

import fs from "fs";

// ================= CONFIG =================
const PREFIX = "+";
const OWNER_ID = process.env.OWNER_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;

const TICKET_ROOM = "1440508751412203570";
const SHOP_ROOM = "1439600517063118989";

const HEADER_IMAGE =
  "https://cdn.discordapp.com/attachments/1438169803490721903/1440640898840002641/ChatGPT_Image_16_2025_02_30_33_.png?ex=691ee4e4&is=691d9364&hm=256ec54d66a9b26bed5d0ed0e0dbc9eaccee9527e22f2e600d1fe9f734afc032&";

let broadcasts = fs.existsSync("./broadcasts.json")
  ? JSON.parse(fs.readFileSync("./broadcasts.json", "utf8"))
  : {};

// ========== ترجمة احترافية ==========
function translateText(ar) {
  return `This is an official announcement from the administration:\n\n${ar}\n\nIf you need help, you may open a support ticket.`;
}

// ========== EXPRESS KEEP ALIVE ==========
const app = express();
app.get("/", (req, res) => res.send("Bot Active"));
app.listen(process.env.PORT || 10000);

// ========== DISCORD CLIENT ==========
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

client.once("ready", () =>
  console.log(`🔥 Logged in as ${client.user.tag}`)
);

// ========== MESSAGE COMMAND ==========
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.split(" ");
  const cmd = args[0].slice(PREFIX.length).toLowerCase();

  // +send
  if (cmd === "send") {
    if (message.author.id !== OWNER_ID)
      return message.reply("❌ فقط الأونر يستطيع.");

    const roles = message.guild.roles.cache.filter(
      (r) => r.members.size > 0
    );

    const menu = new StringSelectMenuBuilder()
      .setCustomId("selectRole")
      .setPlaceholder("اختر الرتبة لإرسال الإعلان…")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        roles.map((r) => ({
          label: r.name,
          value: r.id
        }))
      );

    const row = new ActionRowBuilder().addComponents(menu);

    return message.reply({
      content: "🔽 اختر الرتبة:",
      components: [row]
    });
  }

  // +bcdelete
  if (cmd === "bcdelete") {
    if (message.author.id !== OWNER_ID)
      return message.reply("❌ فقط الأونر يستطيع.");

    const id = args[1];
    if (!id) return message.reply("❌ استخدم: +bcdelete ID");

    if (!broadcasts[id])
      return message.reply("⚠ لا يوجد حملة بهذا الرقم.");

    let deleted = 0;

    for (const entry of broadcasts[id]) {
      try {
        const user = await client.users.fetch(entry.userId);
        const dm = await user.createDM();
        const msg = await dm.messages.fetch(entry.messageId);
        await msg.delete();
        deleted++;
      } catch {}
    }

    delete broadcasts[id];
    fs.writeFileSync("broadcasts.json", JSON.stringify(broadcasts));

    return message.reply(`🗑️ تم حذف **${deleted}** رسالة.`);
  }
});

// ========== INTERACTIONS ==========
client.on("interactionCreate", async (int) => {
  // اختيار الرتبة
  if (int.isStringSelectMenu() && int.customId === "selectRole") {
    const roleId = int.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`msgModal_${roleId}`)
      .setTitle("كتابة الإعلان");

    const input = new TextInputBuilder()
      .setCustomId("msgContent")
      .setLabel("اكتب نص الإعلان بالعربي")
      .setStyle(TextInputStyle.Paragraph);

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    return int.showModal(modal);
  }

  // إرسال الإعلان
  if (int.isModalSubmit() && int.customId.startsWith("msgModal_")) {
    const roleId = int.customId.split("_")[1];
    const role = await int.guild.roles.fetch(roleId);

    const msgAR = int.fields.getTextInputValue("msgContent");
    const msgEN = translateText(msgAR);

    const id = Date.now().toString();
    broadcasts[id] = [];

    await int.reply({
      ephemeral: true,
      content: "⏳ جاري إرسال الإعلان…"
    });

    for (const [memberId, member] of role.members) {
      if (member.user.bot) continue;

      try {
        const dm = await member.createDM();

        // EMBED عربي
        const embedAR = new EmbedBuilder()
          .setColor("#0a1f44")
          .setImage(HEADER_IMAGE)
          .setTitle("📢 إعلان جديد من الإدارة")
          .setDescription(
            `**الرسالة:**\n> ${msgAR}\n\n📢 **هذا إعلان رسمي**`
          )
          .setFooter({ text: int.guild.name })
          .setTimestamp();

        // EMBED Eng
        const embedEN = new EmbedBuilder()
          .setColor("#0a1f44")
          .setTitle("📢 Official Announcement")
          .setDescription(msgEN)
          .setTimestamp();

        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("🎫 افتح تذكرة | Open Ticket")
            .setStyle(ButtonStyle.Link)
            .setURL(
              `https://discord.com/channels/${int.guild.id}/${TICKET_ROOM}`
            ),
          new ButtonBuilder()
            .setLabel("🛒 روم الشراء | Shop Room")
            .setStyle(ButtonStyle.Link)
            .setURL(
              `https://discord.com/channels/${int.guild.id}/${SHOP_ROOM}`
            )
        );

        const sentMsg = await dm.send({
          content: `<@${member.id}>`,
          embeds: [embedAR, embedEN],
          components: [buttons]
        });

        broadcasts[id].push({
          userId: member.id,
          messageId: sentMsg.id
        });
      } catch {
        await int.followUp({
          ephemeral: true,
          content: `⚠ العضو **${member.user.username}** قافل الخاص.`
        });
      }
    }

    fs.writeFileSync("broadcasts.json", JSON.stringify(broadcasts));

    return int.followUp({
      ephemeral: true,
      content: `✅ تم إرسال الإعلان.\nرقم الحملة: **${id}**`
    });
  }
});

// ========== LOGIN ==========
client.login(BOT_TOKEN);
