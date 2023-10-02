const sessionName = "fushigo";
const {
  makeWASocket,
  DisconnectReason,
  downloadMediaMessage,
  Browsers,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const { TiktokDL } = require("@tobyg74/tiktok-api-dl");
const {
  Sticker,
  createSticker,
  StickerTypes,
} = require("wa-sticker-formatter");
const { writeFile } = require("fs/promises");
const config = require("./config.json");
const fs = require("fs");
const axios = require("axios");
const prefix = config.prefix;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(
    `./${sessionName ? sessionName : "session"}`
  );
  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    browser: Browsers.macOS("Desktop"),
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect.error instanceof Boom
          ? lastDisconnect.error.output.statusCode !==
            DisconnectReason.loggedOut
          : true;
      console.log(
        "connection closed due to ",
        lastDisconnect.error,
        ", reconnecting ",
        shouldReconnect
      );
      // reconnect if not logged out
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === "open") {
      console.log("opened connection");
    }
  });

  sock.ev.on("messages.upsert", async (message) => {
    let msg;
    let imageChecker;
    let videoChecker;
    if (message.type === "notify") {
      if (message.messages[0].message.extendedTextMessage) {
        msg = message.messages[0].message.extendedTextMessage.text;
      } else if (message.messages[0].message.imageMessage) {
        msg = message.messages[0].message.imageMessage.caption;
        imageChecker = message.messages[0].message.imageMessage;
      } else if (message.messages[0].message.videoMessage) {
        msg = message.messages[0].message.videoMessage.caption;
        videoChecker = message.messages[0].message.videoMessage;
      } else if (message.messages[0].message.conversation) {
        msg = message.messages[0].message.conversation;
      } else if (message.messages[0].message.stickerMessage) {
        msg = message.messages[0].message.stickerMessage.mimetype;
      }

      const chatId = message.messages[0].key.remoteJid;

      try {
        if (msg.startsWith(prefix)) {
          const args = msg.slice(prefix.length).trim().split(/ +/);
          const command = args.shift().toLowerCase();
          const url = args.join(" ");

          switch (command) {
            case "h":
            case "hlp":
            case "help":
              const helpContent = {
                image: { url: "./icon.jpg" },
                caption: `Hi, Kenalin Namaku Fushigo 👋,
disini aku sedikit jelasin apa aja yang bisa aku lakuin, ini dia!
Commands yang tersedia:
1. /help *Menampilkan daftar perintah / commands*

*MEDIA*
1. /sticker *Membuat sticker dari gambar*

*DOWNLOADER*
1. /tiktokvid *Mengunduh video tiktok*
2. /tikimg *Mengunduh gambar tiktok*
3. /reelsdl *Mengunduh video Reels Instagram*

*AI*
1. /ai *Menjawab pertanyaan*
2. /bard *Menjawab pertanyaan menggunakan Google Bard*

Gitu aja sih yang bisa aku bantu:), Selamat Menikmati!
~Fushigo BOT⭐`,
              };

              await sock.sendMessage(chatId, helpContent);

              break;

            case "p":
            case "pg":
            case "ping":
              await sock.sendMessage(chatId, { text: "pong" });
              break;

            case "s":
            case "stick":
            case "sticker":
            case "stickers":
              if (imageChecker) {
                try {
                  const image = await downloadMediaMessage(
                    message.messages[0],
                    "buffer"
                  );
                  const buffer = Buffer.from(image, "base64");

                  const stickerBuffer = await new Sticker(buffer)
                    .setPack("FushigoStick")
                    .setAuthor("FushigoBot")
                    .setType(StickerTypes.FULL)
                    .setCategories(["🤩", "🎉"])
                    .setQuality(50)
                    .toBuffer();

                  await sock.sendMessage(chatId, {
                    sticker: stickerBuffer,
                  });
                } catch (error) {
                  console.log(error);
                  sock.sendMessage(chatId, {
                    text: "Pastikan gambar memiliki format JPG/JPEG/PNG",
                  });
                }
              } else {
                console.log("message not has media");
                await sock.sendMessage(chatId, { text: "Sertakan gambar." });
              }
              break;

            case "tvid":
            case "tiktokvid":
            case "tiktokvideo":
              if (!url)
                return await sock.sendMessage(chatId, {
                  text: "sertakan url: /tiktokvid url.",
                });

              try {
                const tiktokUrl = `${url}`;

                TiktokDL(tiktokUrl).then(async (result) => {
                  const response = result.result.video[0];

                  if (response) {
                    await sock.sendMessage(chatId, {
                      text: "Sedang diproses!.",
                    });
                  }

                  await sock.sendMessage(chatId, {
                    video: { url: `${response}` },
                  });
                });
              } catch (error) {
                console.log(error);
                await sock.sendMessage(chatId, {
                  text: "Terjadi kesalahan pastikan URL benar.",
                });
              }
              break;

            case "ai":
            case "gpt":
            case "chatgpt":
            case "chat-gpt":
              if (!url)
                return await sock.sendMessage(chatId, {
                  text: "Sertakan pertanyaan.",
                });
              try {
                const getRequest = {
                  method: "GET",
                  url: "https://api.akuari.my.id/ai/gpt/",
                  params: {
                    chat: `${url}`,
                  },
                };

                const response = await axios.request(getRequest);
                const result = response.data.respon;
                await sock.sendMessage(chatId, { text: `${result}` });
              } catch (err) {
                console.log(err);
                await sock.sendMessage(chatId, {
                  text: "Maaf terjadi error, silahkan coba kembali.",
                });
              }
              break;

            case "timg":
            case "tikimg":
            case "tiktokimg":
            case "tiktokimage":
              if (!url)
                return await sock.sendMessage(chatId, {
                  text: "Sertakan url tiktok.",
                });
              const tikokUrl = `${url}`;
              try {
                const result = await TiktokDL(tikokUrl);
                const img = result.result.images;

                for (let i = 0; i < img.length; i++) {
                  const outputFileName = `./temp/image${i}.webp`;
                  await axios({
                    method: "get",
                    url: img[i],
                    responseType: "stream",
                  })
                    .then(async (response) => {
                      const writer = fs.createWriteStream(outputFileName);

                      await response.data.pipe(writer);

                      writer.on("finish", async () => {
                        await sock.sendMessage(chatId, {
                          image: { url: outputFileName },
                        });
                      });

                      writer.on("error", (err) => {
                        console.error("Gagal menyimpan gambar:", err);
                      });
                    })
                    .catch((error) => {
                      console.error("Gagal mengunduh gambar:", error);
                    });
                }
              } catch (error) {
                console.log(error);
              }
              break;

            case "bard":
              if (!url)
                return await sock.sendMessage(chatId, {
                  text: "Sertakan pertanyaan.",
                });
              try {
                const getRequest = {
                  method: "GET",
                  url: "https://api.akuari.my.id/ai/gbard",
                  params: {
                    chat: `${url}`,
                  },
                };

                const response = await axios.request(getRequest);
                const result = response.data.respon;
                await sock.sendMessage(chatId, { text: `${result}` });
              } catch (err) {
                console.log(err);
                await sock.sendMessage(chatId, {
                  text: "Maaf terjadi error, silahkan coba kembali.",
                });
              }
              break;

            case "reelsvid":
            case "reelsdl":
              if (!url)
                return await sock.sendMessage(chatId, {
                  text: "Sertakan url Reels.",
                });

              try {
                let reels = await idl(`${url}`);
                await sock.sendMessage(chatId, {
                  video: { url: `${reels.data[0].url}` },
                });
              } catch (error) {
                await sock.sendMessage(chatId, {
                  text: "Pastikan Url Reels Benar",
                });
              }

              break;

            default:
              await sock.sendMessage(chatId, {
                text: "commands tidak ada, gunakan /help untuk menampilkan commands",
              });
              break;
          }
        }
      } catch (error) {
        console.log(error);
      }
    }
  });
}

// run in main file
connectToWhatsApp();
