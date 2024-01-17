const smpp = require('smpp');
const log4js = require('log4js');

log4js.configure({
  appenders: { console: { type: 'console' } },
  categories: { default: { appenders: ['console'], level: 'debug' } }
});

const logger = log4js.getLogger('smpp-server');

const startSMPPServer = () => {
    const server = smpp.createServer({
        debug: true
    }, function (session) {
        session.on('error', function (err) {});

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

    });

    server.listen(8056);

    function checkAsyncUserPass(session, systemId, password, ipAddress, callback) {
        ipAddress = ipAddress.replace(/^::ffff:/, '');
        console.log('Checking credentials for:', systemId, password, ipAddress);


        if (systemId === 'testuser' && password === 'testpassword') {
            callback(null);
        } else {
            callback(new Error('Invalid credentials or IP address'));
        }
    }
};

module.exports = startSMPPServer;
