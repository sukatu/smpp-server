const smpp = require('smpp');
const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'db-mysql-lon1-71816-do-user-7929445-0.c.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_XhJMDHEOmpLEcvhf-q5',
    database: 'defaultdb'
});

const server = smpp.createServer({
    debug: true
}, function (session) {
    session.on('error', function (err) {
        console.error('SMPP session error:', err);
    });

    session.on('bind_transceiver', function (pdu) {
        session.pause();
        checkAsyncUserPass(session, pdu.system_id, pdu.password, session.socket.remoteAddress, function (err) {
            if (err) {
                session.send(pdu.response({
                    command_status: smpp.ESME_RBINDFAIL
                }));
                session.close();
                return;
            }

            session.send(pdu.response());
            session.resume();

            console.log('SMPP Client with System ID', pdu.system_id, 'is successfully bound.');
        });
    });

    session.on('submit_sm', function (pdu) {
        const senderId = pdu.source_addr;
        const recipient = pdu.destination_addr;
        const messageText = pdu.short_message.message;

        console.log('Received message from', senderId, 'to', recipient, ':', messageText);
        sendSukatuMessage(session, senderId, recipient, messageText);
        session.send(pdu.response({
            command_status: smpp.ESME_ROK
        }));
    });
});

server.listen(65532);

function checkAsyncUserPass(session, systemId, password, ipAddress, callback) {
    ipAddress = ipAddress.replace(/^::ffff:/, '');
    console.log('Checking credentials for:', systemId, password, ipAddress);

    db.query('SELECT * FROM users WHERE smpp_username = ? AND smpp_password = ? AND ip_address = ?', [systemId, password, ipAddress], function (err, results) {
        if (err) {
            callback(err);
        } else {
            if (results.length > 0) {
                callback(null);
            } else {
                callback(new Error('Invalid credentials or IP address'));
            }
        }
    });
}

function sendSukatuMessage(session, senderId, recipient, messageText) {
    const sendingClient = smpp.connect('smpp://41.215.168.137:3010');

    sendingClient.bind_transceiver({
        system_id: 'Sims',
        password: 'sim@123',
    }, (bindPdu) => {
        if (bindPdu.command_status === 0) {
            console.log('Successfully bound to the SMPP server for sending messages');

            const messageOptions = {
                registered_delivery: 1,
                source_addr: senderId,
                destination_addr: recipient,
                short_message: messageText,
            };

            sendingClient.submit_sm(messageOptions, (submitPdu) => {
                if (submitPdu.command_status === 0) {
                    console.log('Message sent successfully');
                } else {
                    console.error('Error sending message:', submitPdu.command_status);
                }
            });
        } else {
            console.error('Failed to bind to the SMPP server for sending messages:', bindPdu.command_status);
        }
    });

    sendingClient.on('deliver_sm', function(pdu) {
        console.log('Received delivery report:', pdu);
      
        if (pdu.esm_class == 4) {
            var shortMessage = pdu.short_message;
            console.log('Received DR: %s', shortMessage);

            // Construct a response PDU to send back to the client
            const responsePdu = pdu.response();

            // Send the response PDU back to the client's session
            session.send(responsePdu, function(err) {
                if (err) {
                    console.error('Error sending delivery report response:', err);
                } else {
                    console.log('Delivery report response sent successfully');
                }
            });
        }
    });

    sendingClient.on('error', (err) => {
        console.error('SMPP client error for sending messages:', err);
    });

    sendingClient.on('close', () => {
        console.log('SMPP client closed after sending messages');
    });
}
