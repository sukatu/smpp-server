const smpp = require('smpp');
const mysql = require('mysql');

const db = mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'root',
    database: 'xsenders'
});

const server = smpp.createServer({
    debug: true
}, function (session) {
    session.on('error', function (err) {
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
        sendSukatuMessage(senderId, recipient, messageText);
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
function sendSukatuMessage(senderId, recipient, messageText, callback) {
    const sendingClient = smpp.connect('smpp://smpp.hubtel.com:2775');

    sendingClient.bind_transceiver({
        system_id: 'mzckktif',
        password: 'hxycwhmj',
    }, (bindPdu) => {
        if (bindPdu.command_status === 0) {
            console.log('Successfully bound to the SMPP server for se nding messages');

            const messageOptions = {
                registered_delivery: 1,
                source_addr: senderId,
                destination_addr: recipient,
                short_message: messageText,
            };

            sendingClient.submit_sm(messageOptions, (submitPdu) => {
                if (submitPdu.command_status === 0) {
                    console.log('Message sent successfully');
                    sendingClient.on('deliver_sm', (deliverPdu) => {
                        const messageId = deliverPdu.receipted_message_id;
                        const status = deliverPdu.message_state;

                        console.log('Received delivery report for message ID:', messageId, 'with status:', status);
                    });
                } else {
                    console.error('Error sending message:', submitPdu.command_status);
                    sendingClient.unbind(() => {
                        console.log('Unbound from the SMPP server due to error in sending message');
                    });
                }
            });
            sendingClient.on('deliver_sm', function(pdu) {
                console.log('Received delivery report:', pdu);
              
                if (pdu.esm_class == 4) {
                  var shortMessage = pdu.short_message;
                  console.log('Received DR: %s', shortMessage);
                  sendingClient.send(pdu.response());
                }
              });
        } else {
            console.error('Failed to bind to the SMPP server for sending messages:', bindPdu.command_status);
            sendingClient.disconnect();
        }
    });

    sendingClient.on('error', (err) => {
        console.error('SMPP client error for sending messages:', err);
    });

    sendingClient.on('close', () => {
        console.log('SMPP client closed after sending messages');
    });
}
