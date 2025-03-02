const express = require('express');
const { default: makeWASocket, useSingleFileAuthState } = require('@adiwajshing/baileys');
const qrcode = require('qrcode');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000; // Use the PORT environment variable for deployment

// Path to the authentication state file
const { state, saveState } = useSingleFileAuthState('./auth_info.json');

app.use(express.static('public'));
app.use(bodyParser.json());

let pairingCode = null;
let userPhoneNumber = null;

app.get('/', (req, res) => {
    res.send(`
        <h1>WhatsApp Web Auth</h1>
        <p>Scan the QR code or enter the pairing code to authenticate.</p>
        <img id="qrcode" src="/qrcode" alt="QR Code"/><br>
        <p>Pairing Code: <strong>${pairingCode}</strong></p>
        <form action="/pair" method="POST">
            <label for="pairingCode">Enter Pairing Code:</label>
            <input type="text" id="pairingCode" name="pairingCode" required><br>
            <label for="userPhoneNumber">Enter Your Phone Number (in international format, e.g., +1234567890):</label>
            <input type="text" id="userPhoneNumber" name="userPhoneNumber" required>
            <button type="submit">Pair</button>
        </form>
    `);
});

app.get('/qrcode', async (req, res) => {
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: require('pino')({ level: 'silent' }),
    });

    sock.ev.on('qr', (qr) => {
        qrcode.toDataURL(qr, (err, url) => {
            if (err) {
                res.status(500).send('Error generating QR code');
                return;
            }
            pairingCode = uuidv4();
            res.send(`<img src="${url}" alt="QR Code"/>`);
        });
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            console.log('Connection closed. Please restart the bot.');
            if (lastDisconnect.error.output.statusCode !== 401) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('Bot is connected');
            if (userPhoneNumber) {
                const userJid = `${userPhoneNumber.replace('+', '')}@s.whatsapp.net`;
                await sock.sendMessage(userJid, { text: `Welcome! Your session ID is: ${state.creds.me.id}` });
                console.log(`Session ID sent to ${userJid}`);
                res.send(`<h1>Authentication Successful!</h1><p>You are now paired with WhatsApp.</p><p>Session ID: ${state.creds.me.id}</p>`);
            }
        }
    });

    sock.ev.on('creds.update', saveState);
});

app.post('/pair', (req, res) => {
    const enteredCode = req.body.pairingCode;
    userPhoneNumber = req.body.userPhoneNumber;
    if (enteredCode === pairingCode) {
        console.log('Pairing code matched! Authentication successful.');
        res.send('<h1>Authentication Successful!</h1><p>You are now paired with WhatsApp.</p>');
    } else {
        res.send('<h1>Authentication Failed</h1><p>Invalid pairing code.</p>');
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});

async function startBot() {
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: require('pino')({ level: 'silent' }),
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            console.log('Connection closed. Please restart the bot.');
            if (lastDisconnect.error.output.statusCode !== 401) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('Bot is connected');
        }
    });

    sock.ev.on('creds.update', saveState);
}
